-- MC-02: institutional identity only. No backfill, provisioning API or trading.
begin;

alter table public.organizations
  add column market_identity_sealed boolean not null default false;

create or replace function private.demo_reset_guard_organization_run()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.market_identity_sealed and not new.market_identity_sealed then
    raise exception 'organization market identity seal is permanent';
  end if;
  if new.run_id is distinct from old.run_id and
    (old.run_id is not null or old.market_identity_sealed or new.market_identity_sealed) then
    raise exception 'organization run ownership is write-once';
  end if;
  return new;
end;
$$;
-- The existing AFTER UPDATE (whole row) trigger checks final BEFORE-trigger values.
revoke all on function private.demo_reset_guard_organization_run()
  from public, anon, authenticated, service_role;

comment on column public.organizations.market_identity_sealed is
  'Permanent historical ownership seal for modern Market Core identity. Once true, run_id including NULL cannot change. No historical backfill.';
comment on column public.organizations.run_id is
  'Historical run ownership. Unsealed NULL may be assigned once. Non-NULL ownership and sealed NULL ownership are immutable.';

create table public.market_core_participants (
  id text primary key default ('PAR-' || gen_random_uuid()::text),
  organization_id uuid not null unique references public.organizations(id)
    on update restrict on delete restrict,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'RETIRED')),
  created_at timestamptz not null default now(),
  constraint market_core_participants_id_format check
    (id ~ '^PAR-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
comment on table public.market_core_participants is
  'One permanent institutional identity per exact organization UUID. Run derives through organization. ACTIVE is identity lifecycle, not eligibility, funding or trading admission. Preserve identity and its organization root.';

-- Always acquire organization before participant. Even an already sealed row gets
-- a same-value UPDATE: a competing REPEATABLE READ snapshot must abort rather than
-- miss a committed participant. No exception handling/retry or intermediate commit.
create function private.market_core_seal_organization(p_organization_id uuid)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare
  original public.organizations%rowtype;
  sealed public.organizations%rowtype;
begin
  select * into original from public.organizations o
    where o.id = p_organization_id for update;
  if not found then raise exception 'market_core_organization_unavailable'; end if;
  update public.organizations o set market_identity_sealed = true
    where o.id = p_organization_id returning o.* into sealed;
  if not found or sealed.id is distinct from p_organization_id
    or sealed.run_id is distinct from original.run_id
    or sealed.market_identity_sealed is distinct from true then
    raise exception 'market_core_organization_seal_failed';
  end if;
end;
$$;

create function private.market_core_participant_before_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform private.market_core_seal_organization(new.organization_id);
  return new;
end;
$$;
create trigger market_core_participant_seal_before_insert
  before insert on public.market_core_participants
  for each row execute function private.market_core_participant_before_insert();

create function private.market_core_participant_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.created_at is distinct from old.created_at then
      raise exception 'market_core_participant_identity_immutable';
    end if;
  end if;
  -- Validate the final reference AFTER every BEFORE trigger. Do not lock/seal a
  -- second redirected organization here: that would invert the single-root order.
  -- A true seal is monotonic, so it cannot become stale after this check.
  if not exists (select 1 from public.organizations o
    where o.id = new.organization_id and o.market_identity_sealed) then
    raise exception 'market_core_participant_organization_unsealed';
  end if;
  return new;
end;
$$;
create trigger market_core_participant_identity_guard
  after insert or update on public.market_core_participants
  for each row execute function private.market_core_participant_guard();

create function private.market_core_participant_preserve()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'market_core_participant_identity_preserved';
end;
$$;
-- Statement-level rejection also covers no-row deletes and BEFORE-row suppression.
create trigger market_core_participant_preserve
  before delete or truncate on public.market_core_participants
  for each statement execute function private.market_core_participant_preserve();

create function private.market_core_get_or_create_participant(p_organization_id uuid)
returns public.market_core_participants
language plpgsql volatile security invoker set search_path = '' as $$
declare
  participant public.market_core_participants%rowtype;
begin
  perform private.market_core_seal_organization(p_organization_id);
  select * into participant from public.market_core_participants p
    where p.organization_id = p_organization_id;
  if not found then
    -- No ON CONFLICT adoption, especially not on participant ID collisions.
    insert into public.market_core_participants(organization_id)
      values (p_organization_id) returning * into participant;
  end if;
  if participant.organization_id is distinct from p_organization_id then
    raise exception 'market_core_participant_organization_mismatch';
  end if;
  return participant;
end;
$$;
comment on function private.market_core_get_or_create_participant(uuid) is
  'Internal owner/definer-context identity primitive only. Unique-organization repeatability is not command idempotency. MC-05 must supply the external command/receipt boundary.';

revoke all on function private.market_core_seal_organization(uuid),
  private.market_core_participant_before_insert(), private.market_core_participant_guard(),
  private.market_core_participant_preserve(), private.market_core_get_or_create_participant(uuid)
  from public, anon, authenticated, service_role;

alter table public.market_core_participants enable row level security;
-- Remove Supabase default grants, including service-role BYPASSRLS and DDL-related
-- table privileges. Do not alter organization grants or global default privileges.
revoke all on table public.market_core_participants from public, anon, authenticated, service_role;
grant select on table public.market_core_participants to authenticated;

create policy market_core_participants_select_selected_member
  on public.market_core_participants for select to authenticated
  using (exists (
    select 1 from public.session_contexts s
    join public.profiles p on p.user_id = s.principal_user_id
    join public.organizations o on o.id = s.active_organization_id
    join public.memberships m on m.organization_id = o.id and m.user_id = p.user_id
    where s.principal_user_id = (select auth.uid())
      and s.effective_demo_persona_id is null
      and o.id = market_core_participants.organization_id
      and p.status = 'ACTIVE' and o.status = 'ACTIVE' and m.status = 'ACTIVE'
  ));

commit;

-- Phase 4.5 identity: users, organizations, memberships, roles, demo personas, audit.
-- Application tables only. Does not alter Solana / WHEAT-2027 state.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create type public.organization_type as enum (
  'PLATFORM',
  'REGULATOR',
  'REGISTRAR',
  'SCAS',
  'PRODUCER',
  'ISSUER',
  'INVESTMENT_FUND',
  'TRADING_FIRM',
  'COMPLIANCE_PROVIDER'
);

create type public.membership_status as enum (
  'ACTIVE',
  'SUSPENDED',
  'INVITED',
  'INACTIVE'
);

create type public.organization_status as enum ('ACTIVE', 'SUSPENDED');
create type public.app_user_status as enum ('ACTIVE', 'SUSPENDED');
create type public.role_request_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.onboarding_intent as enum ('PRODUCER', 'INVESTOR', 'TRADER', 'OTHER');
create type public.app_audit_kind as enum ('AUTH', 'ADMIN', 'DEMO_CONTEXT', 'BLOCKCHAIN');
create type public.persona_status as enum ('ACTIVE', 'INACTIVE');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  status public.app_user_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  type public.organization_type not null,
  status public.organization_status not null default 'ACTIVE',
  external_producer_ref text,
  external_investor_ref text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  status public.membership_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  role_id text not null,
  assigned_by uuid references public.profiles (user_id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint membership_roles_role_id_check check (
    role_id in (
      'SYSTEM_ADMIN',
      'REGULATOR',
      'REGISTRAR_OPERATOR',
      'SCAS_OPERATOR',
      'ISSUER_OPERATOR',
      'PRODUCER_ADMIN',
      'INVESTOR',
      'TRADER',
      'COMPLIANCE_OFFICER'
    )
  )
);

create unique index membership_roles_active_unique
  on public.membership_roles (membership_id, role_id)
  where revoked_at is null;

create table public.role_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  intent public.onboarding_intent not null,
  organization_name text,
  status public.role_request_status not null default 'PENDING',
  reviewed_by uuid references public.profiles (user_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.demo_personas (
  id text primary key,
  display_name text not null,
  group_key text not null,
  organization_id uuid not null references public.organizations (id),
  role_id text not null,
  status public.persona_status not null default 'ACTIVE',
  external_producer_ref text,
  external_investor_ref text,
  wallet_address text,
  investor_ata text,
  constraint demo_personas_role_id_check check (
    role_id in (
      'SYSTEM_ADMIN',
      'REGULATOR',
      'REGISTRAR_OPERATOR',
      'SCAS_OPERATOR',
      'ISSUER_OPERATOR',
      'PRODUCER_ADMIN',
      'INVESTOR',
      'TRADER',
      'COMPLIANCE_OFFICER'
    )
  )
);

create table public.session_contexts (
  principal_user_id uuid primary key references public.profiles (user_id) on delete cascade,
  active_organization_id uuid references public.organizations (id),
  effective_demo_persona_id text references public.demo_personas (id),
  updated_at timestamptz not null default now()
);

create table public.app_audit_events (
  id uuid primary key default gen_random_uuid(),
  kind public.app_audit_kind not null,
  event_key text not null,
  principal_user_id uuid references public.profiles (user_id),
  effective_demo_persona_id text,
  from_persona_id text,
  to_persona_id text,
  organization_id uuid references public.organizations (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index app_audit_events_created_at_idx on public.app_audit_events (created_at desc);
create index memberships_user_id_idx on public.memberships (user_id);
create index membership_roles_membership_id_idx on public.membership_roles (membership_id);

create or replace function private.uid()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

create or replace function private.is_system_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.organizations o on o.id = m.organization_id
    join public.profiles p on p.user_id = m.user_id
    where m.user_id = uid
      and m.status = 'ACTIVE'
      and mr.revoked_at is null
      and mr.role_id = 'SYSTEM_ADMIN'
      and o.status = 'ACTIVE'
      and p.status = 'ACTIVE'
  );
$$;

create or replace function public.is_system_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select private.is_system_admin(auth.uid());
$$;

create or replace function private.write_audit(
  p_kind public.app_audit_kind,
  p_event_key text,
  p_principal uuid,
  p_effective text default null,
  p_from text default null,
  p_to text default null,
  p_org uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.app_audit_events (
    kind, event_key, principal_user_id, effective_demo_persona_id,
    from_persona_id, to_persona_id, organization_id, metadata
  ) values (
    p_kind, p_event_key, p_principal, p_effective, p_from, p_to, p_org, p_metadata
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'ACTIVE'
  );
  perform private.write_audit(
    'AUTH',
    'registration',
    new.id,
    null, null, null, null,
    jsonb_build_object('email_domain', split_part(coalesce(new.email, ''), '@', 2))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.assume_demo_persona(p_persona_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  persona public.demo_personas%rowtype;
  previous text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  select * into persona from public.demo_personas where id = p_persona_id;
  if not found then
    raise exception 'persona_not_found';
  end if;
  if persona.status <> 'ACTIVE' then
    raise exception 'inactive_persona';
  end if;
  select effective_demo_persona_id into previous
  from public.session_contexts
  where principal_user_id = uid;
  insert into public.session_contexts (
    principal_user_id, active_organization_id, effective_demo_persona_id, updated_at
  ) values (uid, persona.organization_id, persona.id, now())
  on conflict (principal_user_id) do update
    set active_organization_id = excluded.active_organization_id,
        effective_demo_persona_id = excluded.effective_demo_persona_id,
        updated_at = now();
  perform private.write_audit(
    'DEMO_CONTEXT',
    'demo_persona_switched',
    uid,
    persona.id,
    previous,
    persona.id,
    persona.organization_id,
    jsonb_build_object('persona_id', persona.id)
  );
  return jsonb_build_object('ok', true, 'persona_id', persona.id);
end;
$$;

create or replace function public.exit_demo_persona()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  previous text;
  admin_org uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  select effective_demo_persona_id into previous
  from public.session_contexts
  where principal_user_id = uid;
  select m.organization_id into admin_org
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  where m.user_id = uid
    and m.status = 'ACTIVE'
    and mr.revoked_at is null
    and mr.role_id = 'SYSTEM_ADMIN'
  limit 1;
  insert into public.session_contexts (
    principal_user_id, active_organization_id, effective_demo_persona_id, updated_at
  ) values (uid, admin_org, null, now())
  on conflict (principal_user_id) do update
    set active_organization_id = excluded.active_organization_id,
        effective_demo_persona_id = null,
        updated_at = now();
  perform private.write_audit(
    'DEMO_CONTEXT',
    'demo_persona_exited',
    uid,
    null,
    previous,
    null,
    admin_org,
    '{}'::jsonb
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.switch_active_organization(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  membership public.memberships%rowtype;
  org public.organizations%rowtype;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into membership
  from public.memberships
  where user_id = uid and organization_id = p_organization_id;
  if not found then
    raise exception 'forbidden';
  end if;
  if membership.status <> 'ACTIVE' then
    raise exception 'suspended_membership';
  end if;
  select * into org from public.organizations where id = p_organization_id;
  if org.status <> 'ACTIVE' then
    raise exception 'suspended_organization';
  end if;
  insert into public.session_contexts (
    principal_user_id, active_organization_id, effective_demo_persona_id, updated_at
  ) values (uid, p_organization_id, null, now())
  on conflict (principal_user_id) do update
    set active_organization_id = excluded.active_organization_id,
        updated_at = now();
  perform private.write_audit(
    'AUTH',
    'organization_switched',
    uid, null, null, null, p_organization_id, '{}'::jsonb
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.submit_role_request(
  p_intent public.onboarding_intent,
  p_organization_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  request_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.role_requests (user_id, intent, organization_name)
  values (uid, p_intent, p_organization_name)
  returning id into request_id;
  perform private.write_audit(
    'AUTH',
    'role_request_submitted',
    uid, null, null, null, null,
    jsonb_build_object('intent', p_intent::text)
  );
  return request_id;
end;
$$;

create or replace function public.review_role_request(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  req public.role_requests%rowtype;
  org_id uuid;
  mem_id uuid;
  role_id text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'invalid_decision';
  end if;
  select * into req from public.role_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  update public.role_requests
    set status = p_decision::public.role_request_status,
        reviewed_by = uid,
        reviewed_at = now()
    where id = p_request_id;
  if p_decision = 'APPROVED' then
    role_id := case req.intent
      when 'PRODUCER' then 'PRODUCER_ADMIN'
      when 'INVESTOR' then 'INVESTOR'
      when 'TRADER' then 'TRADER'
      else null
    end;
    if role_id is null then
      perform private.write_audit('ADMIN', 'role_request_approved_pending_org', uid, null, null, null, null, jsonb_build_object('request_id', p_request_id));
      return jsonb_build_object('ok', true, 'pending_organization', true);
    end if;
    insert into public.organizations (slug, name, type)
    values (
      lower(regexp_replace(coalesce(req.organization_name, req.intent::text || '-' || left(req.user_id::text, 8)), '[^a-zA-Z0-9]+', '-', 'g')),
      coalesce(req.organization_name, req.intent::text),
      case req.intent
        when 'PRODUCER' then 'PRODUCER'::public.organization_type
        when 'INVESTOR' then 'INVESTMENT_FUND'::public.organization_type
        when 'TRADER' then 'TRADING_FIRM'::public.organization_type
      end
    )
    returning id into org_id;
    insert into public.memberships (user_id, organization_id, status)
    values (req.user_id, org_id, 'ACTIVE')
    returning id into mem_id;
    insert into public.membership_roles (membership_id, role_id, assigned_by)
    values (mem_id, role_id, uid);
  end if;
  perform private.write_audit(
    'ADMIN',
    case when p_decision = 'APPROVED' then 'role_request_approved' else 'role_request_rejected' end,
    uid, null, null, null, org_id,
    jsonb_build_object('request_id', p_request_id, 'subject_user_id', req.user_id)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.set_user_status(p_user_id uuid, p_status public.app_user_status)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  update public.profiles set status = p_status where user_id = p_user_id;
  perform private.write_audit(
    'ADMIN',
    case when p_status = 'SUSPENDED' then 'user_suspended' else 'user_reactivated' end,
    uid, null, null, null, null,
    jsonb_build_object('subject_user_id', p_user_id)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.set_organization_status(
  p_organization_id uuid,
  p_status public.organization_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  update public.organizations set status = p_status where id = p_organization_id;
  perform private.write_audit(
    'ADMIN',
    'organization_status_changed',
    uid, null, null, null, p_organization_id,
    jsonb_build_object('status', p_status::text)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.assign_membership_role(
  p_membership_id uuid,
  p_role_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mem public.memberships%rowtype;
begin
  if uid is null or not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  if p_role_id not in (
    'SYSTEM_ADMIN','REGULATOR','REGISTRAR_OPERATOR','SCAS_OPERATOR',
    'ISSUER_OPERATOR','PRODUCER_ADMIN','INVESTOR','TRADER','COMPLIANCE_OFFICER'
  ) then
    raise exception 'unknown_role';
  end if;
  select * into mem from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'not_found';
  end if;
  update public.membership_roles
    set revoked_at = now()
    where membership_id = p_membership_id and role_id = p_role_id and revoked_at is null;
  insert into public.membership_roles (membership_id, role_id, assigned_by)
  values (p_membership_id, p_role_id, uid);
  perform private.write_audit(
    'ADMIN',
    'role_assigned',
    uid, null, null, null, mem.organization_id,
    jsonb_build_object('membership_id', p_membership_id, 'role_id', p_role_id)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.revoke_membership_role(
  p_membership_id uuid,
  p_role_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mem public.memberships%rowtype;
begin
  if uid is null or not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  select * into mem from public.memberships where id = p_membership_id;
  update public.membership_roles
    set revoked_at = now()
    where membership_id = p_membership_id and role_id = p_role_id and revoked_at is null;
  perform private.write_audit(
    'ADMIN',
    'role_revoked',
    uid, null, null, null, mem.organization_id,
    jsonb_build_object('membership_id', p_membership_id, 'role_id', p_role_id)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.grant_system_admin_if_none(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  org_id uuid := '11111111-1111-4111-8111-111111111001';
  mem_id uuid;
begin
  -- First SYSTEM_ADMIN only. Safe to call after creating the presenter user.
  if exists (
    select 1 from public.membership_roles mr
    join public.memberships m on m.id = mr.membership_id
    where mr.role_id = 'SYSTEM_ADMIN' and mr.revoked_at is null
  ) then
    raise exception 'admin_already_exists';
  end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    raise exception 'user_not_found';
  end if;
  insert into public.memberships (user_id, organization_id, status)
  values (uid, org_id, 'ACTIVE')
  on conflict (user_id, organization_id) do update set status = 'ACTIVE'
  returning id into mem_id;
  insert into public.membership_roles (membership_id, role_id)
  values (mem_id, 'SYSTEM_ADMIN');
  perform private.write_audit(
    'ADMIN',
    'system_admin_bootstrapped',
    uid, null, null, null, org_id, '{}'::jsonb
  );
  return jsonb_build_object('ok', true, 'user_id', uid);
end;
$$;

create or replace function public.record_auth_event(p_event_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  if p_event_key not in ('login', 'logout') then
    raise exception 'invalid_event';
  end if;
  if p_event_key = 'login' then
    update public.profiles set last_sign_in_at = now() where user_id = uid;
  end if;
  perform private.write_audit('AUTH', p_event_key, uid, null, null, null, null, '{}'::jsonb);
end;
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_roles enable row level security;
alter table public.role_requests enable row level security;
alter table public.demo_personas enable row level security;
alter table public.session_contexts enable row level security;
alter table public.app_audit_events enable row level security;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or private.is_system_admin(auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = (select status from public.profiles where user_id = auth.uid()));

create policy organizations_select_member_or_admin on public.organizations
  for select to authenticated
  using (
    private.is_system_admin(auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.status = 'ACTIVE'
    )
  );

create policy memberships_select_own_or_admin on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or private.is_system_admin(auth.uid()));

create policy membership_roles_select_own_or_admin on public.membership_roles
  for select to authenticated
  using (
    private.is_system_admin(auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.id = membership_roles.membership_id and m.user_id = auth.uid()
    )
  );

create policy role_requests_select_own_or_admin on public.role_requests
  for select to authenticated
  using (user_id = auth.uid() or private.is_system_admin(auth.uid()));

create policy demo_personas_select_admin on public.demo_personas
  for select to authenticated
  using (private.is_system_admin(auth.uid()));

create policy session_contexts_select_own on public.session_contexts
  for select to authenticated
  using (principal_user_id = auth.uid());

create policy audit_select_admin_or_own on public.app_audit_events
  for select to authenticated
  using (
    private.is_system_admin(auth.uid())
    or principal_user_id = auth.uid()
  );

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.organizations, public.memberships,
  public.membership_roles, public.role_requests, public.demo_personas,
  public.session_contexts, public.app_audit_events to authenticated;
grant update on public.profiles to authenticated;

grant execute on function public.is_system_admin() to authenticated;
grant execute on function public.assume_demo_persona(text) to authenticated;
grant execute on function public.exit_demo_persona() to authenticated;
grant execute on function public.switch_active_organization(uuid) to authenticated;
grant execute on function public.submit_role_request(public.onboarding_intent, text) to authenticated;
grant execute on function public.review_role_request(uuid, text) to authenticated;
grant execute on function public.set_user_status(uuid, public.app_user_status) to authenticated;
grant execute on function public.set_organization_status(uuid, public.organization_status) to authenticated;
grant execute on function public.assign_membership_role(uuid, text) to authenticated;
grant execute on function public.revoke_membership_role(uuid, text) to authenticated;
grant execute on function public.record_auth_event(text) to authenticated;
-- Bootstrap is intended for SQL editor / service role after first presenter signup.
revoke all on function public.grant_system_admin_if_none(text) from public, anon, authenticated;

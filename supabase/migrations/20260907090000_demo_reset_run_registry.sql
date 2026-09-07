-- GP-01: Golden Path run registry and root-level organisation run ownership.
-- Additive only. Does not backfill historical rows. Does not delete, truncate
-- or drop. Does not weaken RLS or immutable origination protections.
-- Does not issue runs. Authenticated clients cannot insert, update or delete
-- registry rows. No reset execution path is introduced.

create type public.demo_reset_run_lifecycle_status as enum (
  'CURRENT',
  'SUPERSEDED'
);

comment on type public.demo_reset_run_lifecycle_status is
  'Explicit current-run lifecycle. CURRENT is a stored fact, never "latest row".';

create table public.demo_reset_run_instances (
  id uuid primary key default gen_random_uuid(),
  operator_principal_user_id uuid not null
    references public.profiles (user_id)
    on delete restrict,
  environment_name text not null,
  dataset_id text not null,
  database_ref text not null,
  lifecycle_status public.demo_reset_run_lifecycle_status not null,
  created_at timestamptz not null default now(),
  constraint demo_reset_run_instances_environment_name_check
    check (char_length(environment_name) between 1 and 64),
  constraint demo_reset_run_instances_dataset_id_check
    check (char_length(dataset_id) between 1 and 64),
  constraint demo_reset_run_instances_database_ref_check
    check (char_length(database_ref) between 1 and 64)
);

comment on table public.demo_reset_run_instances is
  'Golden Path run registry. One row is one server-issued run instance. Reading a dry-run must not insert or update this table.';

comment on column public.demo_reset_run_instances.id is
  'Server-issued run instance identity. Never derived from the principal or supplied by a client as authority.';

comment on column public.demo_reset_run_instances.operator_principal_user_id is
  'Principal entitled to operate this run. This is operator authority, not Auth-user ownership of a run.';

comment on column public.demo_reset_run_instances.lifecycle_status is
  'CURRENT or SUPERSEDED. Two CURRENT rows for the same operator and approved context are rejected by unique index.';

-- Exactly one current run per operator + approved environment/dataset/database.
-- This is the current-run invariant. ORDER BY created_at is not a substitute.
create unique index demo_reset_run_instances_one_current_uidx
  on public.demo_reset_run_instances (
    operator_principal_user_id,
    environment_name,
    dataset_id,
    database_ref
  )
  where lifecycle_status = 'CURRENT';

create index demo_reset_run_instances_operator_idx
  on public.demo_reset_run_instances (operator_principal_user_id);

alter table public.organizations
  add column run_id uuid references public.demo_reset_run_instances (id);

comment on column public.organizations.run_id is
  'Golden Path run that created this organisation. NULL means non-run: platform, seeded, or pre-existing unassigned rows. Not backfilled.';

create index organizations_run_id_idx
  on public.organizations (run_id)
  where run_id is not null;

-- Registry is administrative infrastructure. Clients may read only their own
-- current/historical runs when they are a system admin. They cannot mutate.
alter table public.demo_reset_run_instances enable row level security;

revoke all on table public.demo_reset_run_instances from public;
revoke all on table public.demo_reset_run_instances from anon;
revoke all on table public.demo_reset_run_instances from authenticated;

create policy demo_reset_run_instances_select_own_admin
  on public.demo_reset_run_instances
  for select
  to authenticated
  using (
    operator_principal_user_id = auth.uid()
    and private.is_system_admin(auth.uid())
  );

grant select on table public.demo_reset_run_instances to authenticated;

-- ---------------------------------------------------------------------------
-- Read-only allowlisted row counts.
-- The function is a closed CASE over approved object names. It is not a
-- general table-count primitive. Authenticated clients cannot execute it.
-- Origination tables are service-role-only, so this RPC is granted to
-- service_role alone.
-- ---------------------------------------------------------------------------

create or replace function private.demo_reset_matches_run_scope(
  p_scope text,
  p_run_id uuid,
  p_row_run_id uuid
)
returns boolean
language sql
immutable
as $$
  select case p_scope
    when 'RUN' then p_row_run_id is not null and p_row_run_id = p_run_id
    when 'NON_RUN' then p_row_run_id is null
    when 'ENVIRONMENT' then true
    else false
  end
$$;

create or replace function public.demo_reset_count_rows(
  p_object text,
  p_scope text,
  p_run_id uuid default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_scope not in ('RUN', 'NON_RUN', 'ENVIRONMENT') then
    raise exception 'invalid_scope';
  end if;
  if p_scope = 'RUN' and p_run_id is null then
    raise exception 'run_required';
  end if;

  case p_object
    when 'organizations' then
      return (
        select count(*)::bigint
        from public.organizations o
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'memberships' then
      return (
        select count(*)::bigint
        from public.memberships m
        inner join public.organizations o on o.id = m.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'membership_roles' then
      return (
        select count(*)::bigint
        from public.membership_roles mr
        inner join public.memberships m on m.id = mr.membership_id
        inner join public.organizations o on o.id = m.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'demo_personas' then
      return (
        select count(*)::bigint
        from public.demo_personas dp
        inner join public.organizations o on o.id = dp.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'profiles' then
      if p_scope = 'RUN' then
        raise exception 'object_not_countable';
      end if;
      return (select count(*)::bigint from public.profiles);

    when 'session_contexts' then
      if p_scope = 'RUN' then
        raise exception 'object_not_countable';
      end if;
      return (select count(*)::bigint from public.session_contexts);

    when 'producer_fields' then
      return (
        select count(*)::bigint
        from public.producer_fields pf
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'field_submissions' then
      return (
        select count(*)::bigint
        from public.field_submissions fs
        inner join public.producer_fields pf on pf.id = fs.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'field_documents' then
      return (
        select count(*)::bigint
        from public.field_documents fd
        inner join public.producer_fields pf on pf.id = fd.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'field_upload_intents' then
      return (
        select count(*)::bigint
        from public.field_upload_intents fui
        inner join public.producer_fields pf on pf.id = fui.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'field_verification_cases' then
      return (
        select count(*)::bigint
        from public.field_verification_cases fvc
        inner join public.producer_fields pf on pf.id = fvc.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'field_cadastre_verifications' then
      return (
        select count(*)::bigint
        from public.field_cadastre_verifications fcv
        inner join public.producer_fields pf on pf.id = fcv.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'field_verification_evidence' then
      return (
        select count(*)::bigint
        from public.field_verification_evidence fve
        inner join public.producer_fields pf on pf.id = fve.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'field_verification_messages' then
      return (
        select count(*)::bigint
        from public.field_verification_messages fvm
        inner join public.producer_fields pf on pf.id = fvm.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'verified_field_snapshots' then
      return (
        select count(*)::bigint
        from public.verified_field_snapshots vfs
        inner join public.producer_fields pf on pf.id = vfs.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'origination_dacs' then
      return (
        select count(*)::bigint
        from public.origination_dacs d
        inner join public.producer_fields pf on pf.id = d.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'origination_dac_messages' then
      return (
        select count(*)::bigint
        from public.origination_dac_messages dm
        inner join public.origination_dacs d on d.id = dm.dac_id
        inner join public.producer_fields pf on pf.id = d.field_id
        inner join public.organizations o on o.id = pf.organization_id
        where private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)
      );

    when 'demo_reset_run_instances' then
      if p_scope <> 'ENVIRONMENT' then
        raise exception 'object_not_countable';
      end if;
      return (select count(*)::bigint from public.demo_reset_run_instances);

    else
      raise exception 'object_not_countable';
  end case;
end;
$$;

comment on function public.demo_reset_count_rows(text, text, uuid) is
  'Read-only allowlisted inventory counts. Closed object list. Not a general table reader. No mutations.';

revoke all on function public.demo_reset_count_rows(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.demo_reset_count_rows(text, text, uuid)
  to service_role;

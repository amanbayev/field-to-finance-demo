-- GP-01: reusable profiles, run-owned participation. No identity provisioning,
-- session changes, generic admin replacement, or reset execution.
begin;

create function private.guard_membership_organization()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'membership organization is immutable';
  end if;
  return new;
end;
$$;
create trigger memberships_organization_immutable
  after update on public.memberships
  for each row execute function private.guard_membership_organization();

create function private.guard_membership_role_parent()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.membership_id is distinct from old.membership_id then
    raise exception 'membership role parent is immutable';
  end if;
  return new;
end;
$$;
create trigger membership_roles_parent_immutable
  after update on public.membership_roles
  for each row execute function private.guard_membership_role_parent();

revoke all on function private.guard_membership_organization() from public, anon, authenticated, service_role;
revoke all on function private.guard_membership_role_parent() from public, anon, authenticated, service_role;

-- Runtime identity mutations already use authorized SECURITY DEFINER RPCs.
-- Remove Supabase default direct mutation/trigger/truncate grants on ONLY these
-- tables. Session RLS reads and existing generic admin RPC semantics are retained.
revoke all on table public.memberships, public.membership_roles from service_role;
grant select on table public.memberships, public.membership_roles to service_role;

-- Preserved retry infrastructure. No FK to deletable business participation or
-- reusable participant profiles. Identifiers in the receipt describe history.
create table private.demo_run_participant_commands (
  run_id uuid not null references public.demo_reset_run_instances(id) on delete restrict,
  request_id uuid not null,
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (run_id, request_id)
);
create index demo_run_participant_commands_request_idx
  on private.demo_run_participant_commands(request_id);
alter table private.demo_run_participant_commands enable row level security;
revoke all on table private.demo_run_participant_commands from public, anon, authenticated, service_role;

create function private.guard_demo_participant_command()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new is distinct from old then
    raise exception 'demo participant command is immutable';
  end if;
  return new;
end;
$$;
create trigger demo_participant_command_immutable
  after update on private.demo_run_participant_commands
  for each row execute function private.guard_demo_participant_command();
revoke all on function private.guard_demo_participant_command() from public, anon, authenticated, service_role;

create function public.demo_reset_bind_run_participants(
  p_operator_principal_user_id uuid,
  p_environment_name text,
  p_dataset_id text,
  p_database_ref text,
  p_request_id uuid,
  p_producer_user_id uuid,
  p_issuer_user_id uuid,
  p_investor_user_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  current_run public.demo_reset_run_instances%rowtype;
  prior private.demo_run_participant_commands%rowtype;
  payload jsonb;
  receipt jsonb;
  issuance jsonb;
  keys text[] := array['issuanceRequestId', 'runId', 'producerOrganizationId', 'issuerOrganizationId', 'investorOrganizationId'];
  key text;
  org_ids uuid[];
  user_ids uuid[] := array[p_producer_user_id, p_issuer_user_id, p_investor_user_id];
  org_types public.organization_type[] := array['PRODUCER', 'ISSUER', 'INVESTMENT_FUND']::public.organization_type[];
  roles text[] := array['PRODUCER_ADMIN', 'ISSUER_OPERATOR', 'INVESTOR'];
  participants text[] := array['producer', 'issuer', 'investor'];
  mem_id uuid;
  assigned_role_id uuid;
  i integer;
begin
  -- Runtime provenance/endpoint matching is the trusted server's responsibility;
  -- no run, organization or role argument exists, even on this privileged RPC.
  if p_environment_name is null or p_environment_name not in ('approved-demo-qa', 'local-development')
    or p_dataset_id is null or char_length(p_dataset_id) not between 1 and 64
    or p_dataset_id <> btrim(p_dataset_id)
    or p_database_ref is null or p_database_ref !~ '^[a-z0-9]{20}$'
  then raise exception 'demo_participant_invalid_context'; end if;
  if p_operator_principal_user_id is null or not private.is_system_admin(p_operator_principal_user_id)
  then raise exception 'demo_participant_forbidden'; end if;
  if p_request_id is null or array_position(user_ids, null) is not null
    or (select count(distinct u) from unnest(user_ids) u) <> 3
    or p_request_id = any(user_ids)
  then raise exception 'demo_participant_invalid_request'; end if;

  -- Same lock key as issuance: CURRENT cannot advance during binding. This also
  -- serializes different binding requests and the empty-CURRENT case.
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(
    'demo_reset_issue_run', p_operator_principal_user_id, p_environment_name, p_dataset_id, p_database_ref
  )::text, 0));
  if not private.is_system_admin(p_operator_principal_user_id)
  then raise exception 'demo_participant_forbidden'; end if;

  select * into current_run from public.demo_reset_run_instances
    where operator_principal_user_id = p_operator_principal_user_id
      and environment_name = p_environment_name and dataset_id = p_dataset_id
      and database_ref = p_database_ref and lifecycle_status = 'CURRENT'
    for update;
  if not found then raise exception 'demo_participant_current_run_missing'; end if;
  payload := jsonb_build_object('producerUserId', p_producer_user_id,
    'issuerUserId', p_issuer_user_id, 'investorUserId', p_investor_user_id);

  select c.* into prior from private.demo_run_participant_commands c
    join public.demo_reset_run_instances r on r.id = c.run_id
    where c.request_id = p_request_id and r.operator_principal_user_id = p_operator_principal_user_id
      and r.environment_name = p_environment_name and r.dataset_id = p_dataset_id
      and r.database_ref = p_database_ref;
  if found then
    if prior.request is distinct from payload then raise exception 'demo_participant_request_conflict'; end if;
    if prior.run_id <> current_run.id then raise exception 'demo_participant_run_changed'; end if;
  end if;

  issuance := current_run.issuance_result;
  if current_run.issuance_request_id is null or issuance is null or jsonb_typeof(issuance) <> 'object'
    or not (issuance ?& keys) or issuance - keys <> '{}'::jsonb
  then raise exception 'demo_participant_run_mismatch'; end if;
  foreach key in array keys loop
    if jsonb_typeof(issuance -> key) <> 'string'
      or (issuance ->> key) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then raise exception 'demo_participant_run_mismatch'; end if;
  end loop;
  if (issuance ->> 'runId')::uuid <> current_run.id
    or (issuance ->> 'issuanceRequestId')::uuid <> current_run.issuance_request_id
  then raise exception 'demo_participant_run_mismatch'; end if;
  org_ids := array[(issuance ->> 'producerOrganizationId')::uuid,
    (issuance ->> 'issuerOrganizationId')::uuid, (issuance ->> 'investorOrganizationId')::uuid];
  if (select count(distinct o) from unnest(org_ids) o) <> 3 or current_run.id = any(org_ids)
  then raise exception 'demo_participant_run_mismatch'; end if;
  if p_request_id = current_run.id or p_request_id = current_run.issuance_request_id or p_request_id = any(org_ids)
  then raise exception 'demo_participant_invalid_request'; end if;

  -- Hold lifecycle/type/existence stable through the transaction. Ordered shared
  -- locks also coexist with the same reusable profiles participating elsewhere.
  perform 1 from public.organizations where id = any(org_ids) order by id for share;
  for i in 1..3 loop
    if not exists (select 1 from public.organizations
      where id = org_ids[i] and run_id = current_run.id and type = org_types[i] and status = 'ACTIVE')
    then raise exception 'demo_participant_run_mismatch'; end if;
  end loop;
  perform 1 from public.profiles where user_id = any(user_ids) order by user_id for share;
  if (select count(*) from public.profiles where user_id = any(user_ids) and status = 'ACTIVE') <> 3
  then raise exception 'demo_participant_profile_unavailable'; end if;

  -- Historical receipt only: retry does not undo a later suspension/revocation.
  if prior.run_id is not null then return prior.result; end if;

  receipt := jsonb_build_object('requestId', p_request_id, 'runId', current_run.id);
  for i in 1..3 loop
    insert into public.memberships(user_id, organization_id, status)
      values (user_ids[i], org_ids[i], 'ACTIVE')
      on conflict (user_id, organization_id) do update set status = 'ACTIVE'
      returning id into mem_id;
    -- Normal generated IDs, not derived from the request. A same-parent no-op
    -- locks any existing active role until commit without rewriting its history.
    insert into public.membership_roles(membership_id, role_id, assigned_by)
      values (mem_id, roles[i], p_operator_principal_user_id)
      on conflict (membership_id, role_id) where revoked_at is null
      do update set membership_id = excluded.membership_id
      returning id into assigned_role_id;
    receipt := receipt || jsonb_build_object(participants[i], jsonb_build_object(
      'userId', user_ids[i], 'organizationId', org_ids[i], 'membershipId', mem_id,
      'membershipRoleId', assigned_role_id, 'roleId', roles[i]));
  end loop;
  insert into private.demo_run_participant_commands(run_id, request_id, request, result)
    values (current_run.id, p_request_id, payload, receipt);
  return receipt;
end;
$$;
revoke all on function public.demo_reset_bind_run_participants(uuid,text,text,text,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.demo_reset_bind_run_participants(uuid,text,text,text,uuid,uuid,uuid,uuid)
  to service_role;

commit;

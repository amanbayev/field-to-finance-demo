-- GP-01: privileged issuance of a run and three fresh business organization roots.
-- Additive; no backfill, reset, identity onboarding, or generic admin RPC changes.
begin;

alter table public.demo_reset_run_instances
  add column issuance_request_id uuid,
  add column issuance_request jsonb,
  add column issuance_result jsonb,
  add constraint demo_reset_run_issuance_receipt_check check (
    num_nonnulls(issuance_request_id, issuance_request, issuance_result) = 0
    or (
      num_nonnulls(issuance_request_id, issuance_request, issuance_result) = 3
      and jsonb_typeof(issuance_request) = 'object'
      and jsonb_typeof(issuance_result) = 'object'
    )
  );

-- Supabase defaults grant service_role all table privileges. Runtime registry
-- access uses definer RPCs; session reads retain authenticated SELECT under RLS.
-- Restrict only this table, including unused TRUNCATE/TRIGGER privileges.
revoke all on table public.demo_reset_run_instances from service_role;

comment on column public.demo_reset_run_instances.issuance_request_id is
  'Idempotency command UUID, scoped by operator and approved context. Not a run UUID or authority. NULL for pre-existing registry rows.';
comment on column public.demo_reset_run_instances.issuance_request is
  'Normalized organization names bound to the issuance request; changed payload under the same request is refused.';
comment on column public.demo_reset_run_instances.issuance_result is
  'Immutable historical issuance receipt, not current lifecycle or ownership authority. Retained after supersession; organizations.run_id remains the ownership root.';

create unique index demo_reset_run_issuance_request_uidx
  on public.demo_reset_run_instances (
    operator_principal_user_id, environment_name, dataset_id, database_ref, issuance_request_id
  ) where issuance_request_id is not null;

-- Every inserted run is historical identity, including legacy NULL receipts.
-- Preserve identity/receipt and permit only monotonic lifecycle transitions.
create function private.guard_demo_run_issuance_receipt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.id, new.operator_principal_user_id, new.environment_name, new.dataset_id,
        new.database_ref, new.created_at, new.issuance_request_id, new.issuance_request, new.issuance_result)
    is distinct from
    row(old.id, old.operator_principal_user_id, old.environment_name, old.dataset_id,
        old.database_ref, old.created_at, old.issuance_request_id, old.issuance_request, old.issuance_result)
  then
    raise exception 'demo_run_issuance_receipt_immutable';
  end if;
  if old.lifecycle_status = 'SUPERSEDED' and new.lifecycle_status <> 'SUPERSEDED' then
    raise exception 'demo_run_issuance_receipt_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_demo_run_issuance_receipt() from public, anon, authenticated;
create trigger demo_run_issuance_receipt_immutable
  after update on public.demo_reset_run_instances
  for each row execute function private.guard_demo_run_issuance_receipt();

create function public.demo_reset_issue_run(
  p_operator_principal_user_id uuid,
  p_environment_name text,
  p_dataset_id text,
  p_database_ref text,
  p_request_id uuid,
  p_organization_names jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  prior public.demo_reset_run_instances%rowtype;
  normalized_names jsonb := '{}'::jsonb;
  role_name text;
  organization_name text;
  new_run_id uuid;
  producer_id uuid;
  issuer_id uuid;
  investor_id uuid;
  receipt jsonb;
begin
  -- The application derives these from its session and existing environment
  -- policy. SQL also refuses invalid contexts and rechecks real admin authority.
  -- Runtime provenance / endpoint matching stay at the trusted server boundary.
  if p_environment_name is null or p_environment_name not in ('approved-demo-qa', 'local-development')
    or p_dataset_id is null or char_length(p_dataset_id) not between 1 and 64
    or p_dataset_id <> btrim(p_dataset_id)
    or p_database_ref is null or p_database_ref !~ '^[a-z0-9]{20}$'
    or p_request_id is null
  then
    raise exception 'demo_run_invalid_context';
  end if;
  if p_operator_principal_user_id is null or not private.is_system_admin(p_operator_principal_user_id) then
    raise exception 'demo_run_forbidden';
  end if;
  if p_organization_names is null or jsonb_typeof(p_organization_names) <> 'object' then
    raise exception 'demo_run_invalid_names';
  end if;
  if not (p_organization_names ?& array['producer', 'issuer', 'investor'])
    or (p_organization_names - array['producer', 'issuer', 'investor']) <> '{}'::jsonb then
    raise exception 'demo_run_invalid_names';
  end if;
  foreach role_name in array array['producer', 'issuer', 'investor'] loop
    if jsonb_typeof(p_organization_names -> role_name) <> 'string' then
      raise exception 'demo_run_invalid_names';
    end if;
    organization_name := btrim(regexp_replace(p_organization_names ->> role_name, E'[ \\t\\r\\n]+', ' ', 'g'));
    if char_length(organization_name) not between 1 and 120 or organization_name ~ '[[:cntrl:]]' then
      raise exception 'demo_run_invalid_names';
    end if;
    normalized_names := normalized_names || jsonb_build_object(role_name, organization_name);
  end loop;

  -- Lock the lifecycle context, NOT the request: different requests also compete
  -- for CURRENT. Transaction-scoped; a hash collision only over-serializes.
  perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(
    'demo_reset_issue_run', p_operator_principal_user_id, p_environment_name, p_dataset_id, p_database_ref
  )::text, 0));
  if not private.is_system_admin(p_operator_principal_user_id) then
    raise exception 'demo_run_forbidden';
  end if;

  select * into prior from public.demo_reset_run_instances
    where operator_principal_user_id = p_operator_principal_user_id
      and environment_name = p_environment_name and dataset_id = p_dataset_id
      and database_ref = p_database_ref and issuance_request_id = p_request_id;
  if found then
    if prior.issuance_request is distinct from normalized_names then
      raise exception 'demo_run_request_conflict';
    end if;
    -- A historical retry returns its receipt, never resurrects its run.
    return prior.issuance_result;
  end if;

  new_run_id := gen_random_uuid();
  producer_id := gen_random_uuid();
  issuer_id := gen_random_uuid();
  investor_id := gen_random_uuid();
  receipt := jsonb_build_object(
    'issuanceRequestId', p_request_id, 'runId', new_run_id,
    'producerOrganizationId', producer_id, 'issuerOrganizationId', issuer_id,
    'investorOrganizationId', investor_id
  );

  update public.demo_reset_run_instances set lifecycle_status = 'SUPERSEDED'
    where operator_principal_user_id = p_operator_principal_user_id
      and environment_name = p_environment_name and dataset_id = p_dataset_id
      and database_ref = p_database_ref and lifecycle_status = 'CURRENT';
  insert into public.demo_reset_run_instances (
    id, operator_principal_user_id, environment_name, dataset_id, database_ref,
    lifecycle_status, issuance_request_id, issuance_request, issuance_result
  ) values (
    new_run_id, p_operator_principal_user_id, p_environment_name, p_dataset_id, p_database_ref,
    'CURRENT', p_request_id, normalized_names, receipt
  );

  -- Fresh rows only, already stamped at INSERT. Slugs use database-issued
  -- identities, not name lookup; a collision fails the entire transaction.
  insert into public.organizations (id, slug, name, type, run_id) values
    (producer_id, 'gp-producer-' || producer_id::text, normalized_names ->> 'producer', 'PRODUCER', new_run_id),
    (issuer_id, 'gp-issuer-' || issuer_id::text, normalized_names ->> 'issuer', 'ISSUER', new_run_id),
    (investor_id, 'gp-investor-' || investor_id::text, normalized_names ->> 'investor', 'INVESTMENT_FUND', new_run_id);

  -- No exception swallowing or intermediate commits. A failed INSERT rolls back
  -- the new run, every new organization, and the prior run's supersession.
  return receipt;
end;
$$;

revoke all on function public.demo_reset_issue_run(uuid, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.demo_reset_issue_run(uuid, text, text, text, uuid, jsonb)
  to service_role;

commit;

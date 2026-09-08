-- GP-01 review correction: run ownership is historical identity.
-- Additive guards only. No backfill, issuance, reset execution or RLS changes.
-- AFTER UPDATE checks the final row, including changes made by BEFORE triggers.
-- Raising an exception rolls back the statement even for service_role/definers.

create function private.demo_reset_guard_organization_run()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.run_id is not null and new.run_id is distinct from old.run_id then
    raise exception 'organization run ownership is write-once' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger organizations_run_id_write_once
  after update on public.organizations
  for each row execute function private.demo_reset_guard_organization_run();

comment on column public.organizations.run_id is
  'Historical Golden Path run ownership. NULL remains unassigned and may be assigned once. A non-NULL run cannot change or be cleared. No historical backfill.';

create function private.demo_reset_guard_field_organization()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'field organization is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger producer_fields_organization_immutable
  after update on public.producer_fields
  for each row execute function private.demo_reset_guard_field_organization();

-- Immutable DAC messages derive run ownership through their mutable DAC parent.
-- Freezing that parent's source field closes the same historical relabelling gap.
-- Draft terms, issuer selection and normal DAC lifecycle updates remain allowed.
create function private.demo_reset_guard_dac_field()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.field_id is distinct from old.field_id then
    raise exception 'DAC field is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger origination_dacs_field_immutable
  after update on public.origination_dacs
  for each row execute function private.demo_reset_guard_dac_field();

-- Trigger-only helpers, not callable application RPCs.
revoke all on function private.demo_reset_guard_organization_run()
  from public, anon, authenticated, service_role;
revoke all on function private.demo_reset_guard_field_organization()
  from public, anon, authenticated, service_role;
revoke all on function private.demo_reset_guard_dac_field()
  from public, anon, authenticated, service_role;

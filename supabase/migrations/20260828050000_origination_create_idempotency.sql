-- Origination production fix: public-id-safe create idempotency.
-- Additive. Does not rewrite earlier origination migrations.
-- Does not alter market_core_*, registrar_registered_ownership, identity enums,
-- Phase 5B, or personal-os objects.

alter table public.producer_fields
  add column if not exists client_create_request_id uuid;

create unique index if not exists producer_fields_org_create_request_uidx
  on public.producer_fields (organization_id, client_create_request_id)
  where client_create_request_id is not null;

create or replace function public.origination_create_field(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  field_in jsonb := payload->'field';
  event_in jsonb := payload->'event';
  request_id uuid := nullif(field_in->>'client_create_request_id', '')::uuid;
  org_id uuid := (field_in->>'organization_id')::uuid;
  existing public.producer_fields%rowtype;
  inserted public.producer_fields%rowtype;
  seq bigint;
  public_id text;
begin
  if request_id is null then
    raise exception 'origination create request id is required' using errcode = 'P0001';
  end if;
  if org_id is null then
    raise exception 'origination organization is required' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(org_id::text), hashtext(request_id::text));

  select * into existing
  from public.producer_fields
  where organization_id = org_id
    and client_create_request_id = request_id;
  if found then
    return jsonb_build_object('created', false, 'field', to_jsonb(existing));
  end if;

  seq := nextval('public.producer_field_id_seq');
  public_id := 'FIELD-' || (field_in->>'season') || '-' || lpad(seq::text, 4, '0');

  begin
    insert into public.producer_fields (
      id, public_id, organization_id, status, name, season, crop, cadastre_number,
      declared_area_ha, region, district, declared_snapshot, current_submission_id,
      verified_snapshot_id, client_create_request_id, created_by_user_id, created_by_role,
      created_at, updated_at, archived_at
    ) values (
      (field_in->>'id')::uuid,
      public_id,
      org_id,
      coalesce(field_in->>'status', 'DRAFT')::public.field_lifecycle_status,
      field_in->>'name',
      (field_in->>'season')::integer,
      field_in->>'crop',
      field_in->>'cadastre_number',
      nullif(field_in->>'declared_area_ha', '')::numeric,
      nullif(field_in->>'region', ''),
      nullif(field_in->>'district', ''),
      coalesce(field_in->'declared_snapshot', '{}'::jsonb),
      nullif(field_in->>'current_submission_id', '')::uuid,
      nullif(field_in->>'verified_snapshot_id', '')::uuid,
      request_id,
      field_in->>'created_by_user_id',
      field_in->>'created_by_role',
      coalesce((field_in->>'created_at')::timestamptz, now()),
      coalesce((field_in->>'updated_at')::timestamptz, now()),
      nullif(field_in->>'archived_at', '')::timestamptz
    )
    returning * into inserted;
  exception
    when unique_violation then
      select * into existing
      from public.producer_fields
      where organization_id = org_id
        and client_create_request_id = request_id;
      if not found then
        raise;
      end if;
      return jsonb_build_object('created', false, 'field', to_jsonb(existing));
  end;

  insert into public.field_origination_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    coalesce(nullif(event_in->>'id', '')::uuid, gen_random_uuid()),
    coalesce((event_in->>'occurred_at')::timestamptz, now()),
    coalesce(event_in->>'actor_user_id', inserted.created_by_user_id),
    coalesce(event_in->>'effective_role', inserted.created_by_role),
    nullif(event_in->>'persona_id', ''),
    org_id,
    coalesce(event_in->>'event_type', 'field_created'),
    coalesce(event_in->>'object_type', 'field'),
    inserted.id::text,
    coalesce(event_in->>'result', 'ok'),
    coalesce(event_in->'metadata', '{}'::jsonb) || jsonb_build_object('publicId', inserted.public_id)
  );

  return jsonb_build_object('created', true, 'field', to_jsonb(inserted));
end;
$$;

revoke all on function public.origination_create_field(jsonb) from public, anon, authenticated;
grant execute on function public.origination_create_field(jsonb) to service_role;

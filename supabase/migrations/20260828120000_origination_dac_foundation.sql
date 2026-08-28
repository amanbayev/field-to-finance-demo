-- Origination Slice B.1: Producer ↔ Issuer DAC contract + registrar intake.
-- Additive. Does not alter market_core_*, pools, coverage, issuance, placements,
-- Solana adapters, or demonstrator DAC-2027-0001..0013 fixtures.
-- Live public ids start at DAC-{year}-0014 so they cannot collide with mock DACs.
-- THIS MIGRATION HAS NEVER BEEN APPLIED. Do not apply it from this change set.

create sequence if not exists public.origination_dac_id_seq start 14;

do $$ begin
  create type public.origination_dac_status as enum (
    'DRAFT',
    'PENDING_PRODUCER_CONFIRMATION',
    'PENDING_ISSUER_CONFIRMATION',
    'EXECUTED',
    'READY_FOR_REGISTRAR',
    'UNDER_REGISTRAR_REVIEW',
    'RETURNED_BY_REGISTRAR',
    'REGISTRAR_ACCEPTED',
    'ARCHIVED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.origination_dac_message_type as enum (
    'COMMENT',
    'SYSTEM',
    'DECISION'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.origination_dacs (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  field_id uuid not null references public.producer_fields (id),
  verified_snapshot_id uuid not null references public.verified_field_snapshots (id),
  scas_case_id uuid not null references public.field_verification_cases (id),
  producer_organization_id uuid not null references public.organizations (id),
  issuer_organization_id uuid references public.organizations (id),
  status public.origination_dac_status not null default 'DRAFT',
  crop text not null,
  harvest_year integer not null,
  expected_volume_tonnes numeric(14,4),
  quality_class text,
  producer_reference text,
  cadastre_number text not null,
  declared_area_hectares numeric(14,4),
  verified_area_hectares numeric(14,4),
  region text,
  district text,
  land_right_holder text not null,
  land_right_type text not null,
  scas_notes text not null default '',
  registrar_notes text not null default '',
  terms_version integer not null default 1,
  current_terms_hash text not null,
  producer_confirmed_terms_hash text,
  producer_confirmed_by_user_id text,
  producer_confirmed_by_role text,
  producer_confirmed_at timestamptz,
  issuer_confirmed_terms_hash text,
  issuer_confirmed_by_user_id text,
  issuer_confirmed_by_role text,
  issuer_confirmed_at timestamptz,
  executed_terms_snapshot jsonb,
  executed_terms_hash text,
  executed_at timestamptz,
  created_by_user_id text not null,
  updated_by_user_id text not null,
  registrar_reviewed_by_user_id text,
  submitted_to_registrar_at timestamptz,
  accepted_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint origination_dacs_crop_len check (char_length(trim(crop)) between 1 and 80),
  constraint origination_dacs_harvest_year check (harvest_year between 2020 and 2100),
  constraint origination_dacs_volume_positive check (
    expected_volume_tonnes is null or expected_volume_tonnes > 0
  ),
  constraint origination_dacs_terms_version_positive check (terms_version >= 1),
  constraint origination_dacs_executed_terms check (
    status in (
      'DRAFT',
      'PENDING_PRODUCER_CONFIRMATION',
      'PENDING_ISSUER_CONFIRMATION',
      'ARCHIVED'
    )
    or (
      executed_terms_hash is not null
      and executed_at is not null
      and issuer_organization_id is not null
      and executed_terms_snapshot is not null
    )
  )
);

create table if not exists public.origination_dac_messages (
  id uuid primary key default gen_random_uuid(),
  dac_id uuid not null references public.origination_dacs (id),
  sender_user_id text not null,
  sender_role text not null,
  sender_persona_id text,
  body text not null,
  message_type public.origination_dac_message_type not null default 'COMMENT',
  created_at timestamptz not null default now()
);

create table if not exists public.origination_dac_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id text not null,
  effective_role text not null,
  persona_id text,
  organization_id uuid references public.organizations (id),
  event_type text not null,
  object_type text not null default 'dac',
  object_id text not null,
  result text not null default 'ok',
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists origination_dacs_one_active_snapshot_uidx
  on public.origination_dacs (verified_snapshot_id)
  where status <> 'ARCHIVED';

create index if not exists origination_dacs_org_status_idx
  on public.origination_dacs (producer_organization_id, status, created_at desc);

create index if not exists origination_dacs_issuer_status_idx
  on public.origination_dacs (issuer_organization_id, status, created_at desc);

create index if not exists origination_dacs_status_idx
  on public.origination_dacs (status, harvest_year, crop);

create index if not exists origination_dacs_field_idx
  on public.origination_dacs (field_id, created_at desc);

create index if not exists origination_dac_messages_dac_idx
  on public.origination_dac_messages (dac_id, created_at);

create index if not exists origination_dac_events_object_idx
  on public.origination_dac_events (object_type, object_id, occurred_at);

drop trigger if exists origination_dac_messages_immutable on public.origination_dac_messages;
create trigger origination_dac_messages_immutable
  before update or delete on public.origination_dac_messages
  for each row execute function public.origination_reject_mutation();

drop trigger if exists origination_dac_events_immutable on public.origination_dac_events;
create trigger origination_dac_events_immutable
  before update or delete on public.origination_dac_events
  for each row execute function public.origination_reject_mutation();

create or replace function public.origination_next_dac_seq()
returns bigint
language sql
security definer
set search_path = public
as $$ select nextval('public.origination_dac_id_seq'); $$;

create or replace function public.origination_assert_issuer_org(issuer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if issuer_id is null then
    raise exception 'issuer organization is not permitted' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.organizations
    where id = issuer_id
      and type = 'ISSUER'
      and status = 'ACTIVE'
  ) then
    raise exception 'issuer organization is not permitted' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.origination_dac_write_effects(
  dac public.origination_dacs,
  event_in jsonb,
  message_in jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.origination_dac_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    coalesce(nullif(event_in->>'id', '')::uuid, gen_random_uuid()),
    coalesce((event_in->>'occurred_at')::timestamptz, now()),
    coalesce(event_in->>'actor_user_id', dac.updated_by_user_id),
    coalesce(event_in->>'effective_role', 'SCAS_OPERATOR'),
    nullif(event_in->>'persona_id', ''),
    nullif(event_in->>'organization_id', '')::uuid,
    coalesce(event_in->>'event_type', 'dac_updated'),
    'dac',
    dac.id::text,
    coalesce(event_in->>'result', 'ok'),
    coalesce(event_in->'metadata', '{}'::jsonb)
  );

  insert into public.field_origination_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    gen_random_uuid(),
    coalesce((event_in->>'occurred_at')::timestamptz, now()),
    coalesce(event_in->>'actor_user_id', dac.updated_by_user_id),
    coalesce(event_in->>'effective_role', 'SCAS_OPERATOR'),
    nullif(event_in->>'persona_id', ''),
    dac.producer_organization_id,
    coalesce(event_in->>'event_type', 'dac_updated'),
    'dac',
    dac.id::text,
    'ok',
    coalesce(event_in->'metadata', '{}'::jsonb) || jsonb_build_object('fieldId', dac.field_id)
  );

  if jsonb_typeof(message_in) = 'object' then
    insert into public.origination_dac_messages (
      id, dac_id, sender_user_id, sender_role, sender_persona_id, body, message_type, created_at
    ) values (
      coalesce(nullif(message_in->>'id', '')::uuid, gen_random_uuid()),
      dac.id,
      message_in->>'sender_user_id',
      message_in->>'sender_role',
      nullif(message_in->>'sender_persona_id', ''),
      message_in->>'body',
      coalesce(message_in->>'message_type', 'COMMENT')::public.origination_dac_message_type,
      coalesce((message_in->>'created_at')::timestamptz, now())
    );
  end if;
end;
$$;

create or replace function public.origination_dac_replace_row(dac_in jsonb)
returns public.origination_dacs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.origination_dacs%rowtype;
begin
  update public.origination_dacs
  set
    issuer_organization_id = nullif(dac_in->>'issuer_organization_id', '')::uuid,
    status = (dac_in->>'status')::public.origination_dac_status,
    crop = dac_in->>'crop',
    harvest_year = (dac_in->>'harvest_year')::integer,
    expected_volume_tonnes = nullif(dac_in->>'expected_volume_tonnes', '')::numeric,
    quality_class = nullif(dac_in->>'quality_class', ''),
    producer_reference = nullif(dac_in->>'producer_reference', ''),
    scas_notes = coalesce(dac_in->>'scas_notes', ''),
    registrar_notes = coalesce(dac_in->>'registrar_notes', ''),
    terms_version = coalesce((dac_in->>'terms_version')::integer, terms_version),
    current_terms_hash = dac_in->>'current_terms_hash',
    producer_confirmed_terms_hash = nullif(dac_in->>'producer_confirmed_terms_hash', ''),
    producer_confirmed_by_user_id = nullif(dac_in->>'producer_confirmed_by_user_id', ''),
    producer_confirmed_by_role = nullif(dac_in->>'producer_confirmed_by_role', ''),
    producer_confirmed_at = nullif(dac_in->>'producer_confirmed_at', '')::timestamptz,
    issuer_confirmed_terms_hash = nullif(dac_in->>'issuer_confirmed_terms_hash', ''),
    issuer_confirmed_by_user_id = nullif(dac_in->>'issuer_confirmed_by_user_id', ''),
    issuer_confirmed_by_role = nullif(dac_in->>'issuer_confirmed_by_role', ''),
    issuer_confirmed_at = nullif(dac_in->>'issuer_confirmed_at', '')::timestamptz,
    executed_terms_snapshot = case
      when dac_in->'executed_terms_snapshot' is null
        or jsonb_typeof(dac_in->'executed_terms_snapshot') = 'null'
        or dac_in->>'executed_terms_snapshot' = ''
      then null
      else dac_in->'executed_terms_snapshot'
    end,
    executed_terms_hash = nullif(dac_in->>'executed_terms_hash', ''),
    executed_at = nullif(dac_in->>'executed_at', '')::timestamptz,
    updated_by_user_id = dac_in->>'updated_by_user_id',
    registrar_reviewed_by_user_id = nullif(dac_in->>'registrar_reviewed_by_user_id', ''),
    submitted_to_registrar_at = nullif(dac_in->>'submitted_to_registrar_at', '')::timestamptz,
    accepted_at = nullif(dac_in->>'accepted_at', '')::timestamptz,
    returned_at = nullif(dac_in->>'returned_at', '')::timestamptz,
    updated_at = coalesce((dac_in->>'updated_at')::timestamptz, now())
  where id = (dac_in->>'id')::uuid
  returning * into updated;
  if not found then
    raise exception 'origination DAC not found' using errcode = 'P0002';
  end if;
  return updated;
end;
$$;

create or replace function public.origination_dac_guarded_apply(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dac_in jsonb := payload->'dac';
  current public.origination_dacs%rowtype;
  updated public.origination_dacs%rowtype;
  expected text[];
  expected_hash text := nullif(payload->>'expected_terms_hash', '');
  expected_producer uuid := nullif(payload->>'expected_producer_organization_id', '')::uuid;
  expected_issuer uuid := nullif(payload->>'expected_issuer_organization_id', '')::uuid;
begin
  if dac_in is null or dac_in->>'id' is null then
    raise exception 'origination DAC not found' using errcode = 'P0002';
  end if;

  select * into current
  from public.origination_dacs
  where id = (dac_in->>'id')::uuid
  for update;
  if not found then
    raise exception 'origination DAC not found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(payload->'expected_statuses') = 'array' then
    select array_agg(value #>> '{}') into expected
    from jsonb_array_elements(payload->'expected_statuses');
  end if;
  if expected is null or not (current.status::text = any (expected)) then
    raise exception 'Not in an allowed source state.' using errcode = 'P0001';
  end if;
  if expected_producer is not null and current.producer_organization_id <> expected_producer then
    raise exception 'Producer organization does not match.' using errcode = 'P0001';
  end if;
  if expected_issuer is not null and current.issuer_organization_id is distinct from expected_issuer then
    raise exception 'Issuer organization does not match.' using errcode = 'P0001';
  end if;
  if expected_hash is not null and current.current_terms_hash is distinct from expected_hash then
    raise exception 'terms hash mismatch' using errcode = 'P0001';
  end if;

  updated := public.origination_dac_replace_row(dac_in);
  perform public.origination_dac_write_effects(updated, payload->'event', payload->'message');
  return jsonb_build_object('dac', to_jsonb(updated));
end;
$$;

create or replace function public.origination_create_dac(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dac_in jsonb := payload->'dac';
  event_in jsonb := payload->'event';
  snapshot_id uuid := (dac_in->>'verified_snapshot_id')::uuid;
  field_id uuid := (dac_in->>'field_id')::uuid;
  existing public.origination_dacs%rowtype;
  inserted public.origination_dacs%rowtype;
  field_row public.producer_fields%rowtype;
  snapshot_row public.verified_field_snapshots%rowtype;
  seq bigint;
  public_id text;
  harvest_year integer;
  issuer_id uuid := nullif(dac_in->>'issuer_organization_id', '')::uuid;
begin
  if snapshot_id is null or field_id is null then
    raise exception 'DAC requires a verified field snapshot' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(snapshot_id::text));

  select * into field_row from public.producer_fields where id = field_id;
  if not found then
    raise exception 'field not found' using errcode = 'P0001';
  end if;
  if field_row.status <> 'VERIFIED' then
    raise exception 'DAC can only be created from a verified field' using errcode = 'P0001';
  end if;

  select * into snapshot_row from public.verified_field_snapshots where id = snapshot_id;
  if not found or snapshot_row.field_id <> field_id then
    raise exception 'verified snapshot is not bound to this field' using errcode = 'P0001';
  end if;

  if issuer_id is not null then
    perform public.origination_assert_issuer_org(issuer_id);
  end if;

  select * into existing
  from public.origination_dacs
  where verified_snapshot_id = snapshot_id
    and status <> 'ARCHIVED';
  if found then
    raise exception 'An active DAC already exists for this verified snapshot.' using errcode = 'P0001';
  end if;

  harvest_year := coalesce((dac_in->>'harvest_year')::integer, field_row.season);
  seq := nextval('public.origination_dac_id_seq');
  public_id := 'DAC-' || harvest_year::text || '-' || lpad(seq::text, 4, '0');

  insert into public.origination_dacs (
    id, public_id, field_id, verified_snapshot_id, scas_case_id, producer_organization_id,
    issuer_organization_id, status, crop, harvest_year, expected_volume_tonnes, quality_class,
    producer_reference, cadastre_number, declared_area_hectares, verified_area_hectares, region, district,
    land_right_holder, land_right_type, scas_notes, registrar_notes, terms_version, current_terms_hash,
    created_by_user_id, updated_by_user_id, created_at, updated_at
  ) values (
    (dac_in->>'id')::uuid,
    public_id,
    field_id,
    snapshot_id,
    (dac_in->>'scas_case_id')::uuid,
    (dac_in->>'producer_organization_id')::uuid,
    issuer_id,
    coalesce(dac_in->>'status', 'DRAFT')::public.origination_dac_status,
    dac_in->>'crop',
    harvest_year,
    nullif(dac_in->>'expected_volume_tonnes', '')::numeric,
    nullif(dac_in->>'quality_class', ''),
    nullif(dac_in->>'producer_reference', ''),
    dac_in->>'cadastre_number',
    nullif(dac_in->>'declared_area_hectares', '')::numeric,
    nullif(dac_in->>'verified_area_hectares', '')::numeric,
    nullif(dac_in->>'region', ''),
    nullif(dac_in->>'district', ''),
    dac_in->>'land_right_holder',
    dac_in->>'land_right_type',
    coalesce(dac_in->>'scas_notes', ''),
    coalesce(dac_in->>'registrar_notes', ''),
    coalesce((dac_in->>'terms_version')::integer, 1),
    dac_in->>'current_terms_hash',
    dac_in->>'created_by_user_id',
    dac_in->>'updated_by_user_id',
    coalesce((dac_in->>'created_at')::timestamptz, now()),
    coalesce((dac_in->>'updated_at')::timestamptz, now())
  )
  returning * into inserted;

  perform public.origination_dac_write_effects(
    inserted,
    coalesce(event_in, '{}'::jsonb) || jsonb_build_object('event_type', coalesce(event_in->>'event_type', 'dac_created')),
    null
  );

  return jsonb_build_object('created', true, 'dac', to_jsonb(inserted));
end;
$$;

create or replace function public.origination_update_dac_draft(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  issuer_id uuid := nullif(payload#>>'{dac,issuer_organization_id}', '')::uuid;
begin
  if issuer_id is not null then
    perform public.origination_assert_issuer_org(issuer_id);
  end if;
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_send_dac_to_producer(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  issuer_id uuid := nullif(payload#>>'{dac,issuer_organization_id}', '')::uuid;
begin
  perform public.origination_assert_issuer_org(issuer_id);
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_producer_confirm_dac(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_producer_return_dac(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if payload->'message' is null or nullif(payload#>>'{message,body}', '') is null then
    raise exception 'Return requires a reason.' using errcode = 'P0001';
  end if;
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_issuer_confirm_dac(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current public.origination_dacs%rowtype;
  dac_id uuid := (payload#>>'{dac,id}')::uuid;
begin
  select * into current from public.origination_dacs where id = dac_id for update;
  if not found then
    raise exception 'origination DAC not found' using errcode = 'P0002';
  end if;
  if current.producer_confirmed_terms_hash is distinct from current.current_terms_hash then
    raise exception 'Issuer confirmation requires the same terms hash.' using errcode = 'P0001';
  end if;
  if nullif(payload#>>'{dac,issuer_confirmed_terms_hash}', '') is distinct from current.current_terms_hash then
    raise exception 'terms hash mismatch' using errcode = 'P0001';
  end if;
  if nullif(payload#>>'{dac,executed_terms_hash}', '') is distinct from current.current_terms_hash then
    raise exception 'terms hash mismatch' using errcode = 'P0001';
  end if;
  perform public.origination_assert_issuer_org(current.issuer_organization_id);
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_issuer_return_dac(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if payload->'message' is null or nullif(payload#>>'{message,body}', '') is null then
    raise exception 'Return requires a reason.' using errcode = 'P0001';
  end if;
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_submit_dac_to_registrar(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current public.origination_dacs%rowtype;
  dac_id uuid := (payload#>>'{dac,id}')::uuid;
begin
  select * into current from public.origination_dacs where id = dac_id for update;
  if not found then
    raise exception 'origination DAC not found' using errcode = 'P0002';
  end if;
  if current.executed_terms_hash is null or current.executed_at is null then
    raise exception 'Registrar intake requires an executed Producer-Issuer contract.' using errcode = 'P0001';
  end if;
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_start_dac_review(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_accept_dac(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.origination_dac_guarded_apply(payload);
end;
$$;

create or replace function public.origination_return_dac_intake(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if payload->'message' is null or nullif(payload#>>'{message,body}', '') is null then
    raise exception 'Return requires a reason.' using errcode = 'P0001';
  end if;
  return public.origination_dac_guarded_apply(payload);
end;
$$;

revoke all on function public.origination_next_dac_seq() from public, anon, authenticated;
revoke all on function public.origination_assert_issuer_org(uuid) from public, anon, authenticated;
revoke all on function public.origination_dac_write_effects(public.origination_dacs, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.origination_dac_replace_row(jsonb) from public, anon, authenticated;
revoke all on function public.origination_dac_guarded_apply(jsonb) from public, anon, authenticated;
revoke all on function public.origination_create_dac(jsonb) from public, anon, authenticated;
revoke all on function public.origination_update_dac_draft(jsonb) from public, anon, authenticated;
revoke all on function public.origination_send_dac_to_producer(jsonb) from public, anon, authenticated;
revoke all on function public.origination_producer_confirm_dac(jsonb) from public, anon, authenticated;
revoke all on function public.origination_producer_return_dac(jsonb) from public, anon, authenticated;
revoke all on function public.origination_issuer_confirm_dac(jsonb) from public, anon, authenticated;
revoke all on function public.origination_issuer_return_dac(jsonb) from public, anon, authenticated;
revoke all on function public.origination_submit_dac_to_registrar(jsonb) from public, anon, authenticated;
revoke all on function public.origination_start_dac_review(jsonb) from public, anon, authenticated;
revoke all on function public.origination_accept_dac(jsonb) from public, anon, authenticated;
revoke all on function public.origination_return_dac_intake(jsonb) from public, anon, authenticated;

grant execute on function public.origination_next_dac_seq() to service_role;
grant execute on function public.origination_create_dac(jsonb) to service_role;
grant execute on function public.origination_update_dac_draft(jsonb) to service_role;
grant execute on function public.origination_send_dac_to_producer(jsonb) to service_role;
grant execute on function public.origination_producer_confirm_dac(jsonb) to service_role;
grant execute on function public.origination_producer_return_dac(jsonb) to service_role;
grant execute on function public.origination_issuer_confirm_dac(jsonb) to service_role;
grant execute on function public.origination_issuer_return_dac(jsonb) to service_role;
grant execute on function public.origination_submit_dac_to_registrar(jsonb) to service_role;
grant execute on function public.origination_start_dac_review(jsonb) to service_role;
grant execute on function public.origination_accept_dac(jsonb) to service_role;
grant execute on function public.origination_return_dac_intake(jsonb) to service_role;

alter table public.origination_dacs enable row level security;
alter table public.origination_dac_messages enable row level security;
alter table public.origination_dac_events enable row level security;

revoke all on public.origination_dacs from anon, authenticated;
revoke all on public.origination_dac_messages from anon, authenticated;
revoke all on public.origination_dac_events from anon, authenticated;
grant all on public.origination_dacs to service_role;
grant all on public.origination_dac_messages to service_role;
grant all on public.origination_dac_events to service_role;
grant usage, select on sequence public.origination_dac_id_seq to service_role;

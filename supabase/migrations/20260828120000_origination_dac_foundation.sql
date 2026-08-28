-- Origination Slice B: off-chain DAC rights object + registrar intake.
-- Additive. Does not alter market_core_*, pools, coverage, issuance, placements,
-- Solana adapters, or demonstrator DAC-2027-0001..0013 fixtures.
-- Live public ids start at DAC-{year}-0014 so they cannot collide with mock DACs.

create sequence if not exists public.origination_dac_id_seq start 14;

do $$ begin
  create type public.origination_dac_status as enum (
    'DRAFT',
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
  right_holder text not null,
  right_type text not null,
  scas_notes text not null default '',
  registrar_notes text not null default '',
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
    status, crop, harvest_year, expected_volume_tonnes, quality_class, producer_reference,
    cadastre_number, declared_area_hectares, verified_area_hectares, region, district,
    right_holder, right_type, scas_notes, registrar_notes, created_by_user_id,
    updated_by_user_id, registrar_reviewed_by_user_id, submitted_to_registrar_at,
    accepted_at, returned_at, created_at, updated_at
  ) values (
    (dac_in->>'id')::uuid,
    public_id,
    field_id,
    snapshot_id,
    (dac_in->>'scas_case_id')::uuid,
    (dac_in->>'producer_organization_id')::uuid,
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
    dac_in->>'right_holder',
    dac_in->>'right_type',
    coalesce(dac_in->>'scas_notes', ''),
    coalesce(dac_in->>'registrar_notes', ''),
    dac_in->>'created_by_user_id',
    dac_in->>'updated_by_user_id',
    nullif(dac_in->>'registrar_reviewed_by_user_id', ''),
    nullif(dac_in->>'submitted_to_registrar_at', '')::timestamptz,
    nullif(dac_in->>'accepted_at', '')::timestamptz,
    nullif(dac_in->>'returned_at', '')::timestamptz,
    coalesce((dac_in->>'created_at')::timestamptz, now()),
    coalesce((dac_in->>'updated_at')::timestamptz, now())
  )
  returning * into inserted;

  insert into public.origination_dac_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    coalesce(nullif(event_in->>'id', '')::uuid, gen_random_uuid()),
    coalesce((event_in->>'occurred_at')::timestamptz, now()),
    coalesce(event_in->>'actor_user_id', inserted.created_by_user_id),
    coalesce(event_in->>'effective_role', 'SCAS_OPERATOR'),
    nullif(event_in->>'persona_id', ''),
    nullif(event_in->>'organization_id', '')::uuid,
    coalesce(event_in->>'event_type', 'dac_created'),
    'dac',
    inserted.id::text,
    coalesce(event_in->>'result', 'ok'),
    coalesce(event_in->'metadata', '{}'::jsonb) || jsonb_build_object('publicId', inserted.public_id)
  );

  insert into public.field_origination_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    gen_random_uuid(),
    inserted.created_at,
    inserted.created_by_user_id,
    coalesce(event_in->>'effective_role', 'SCAS_OPERATOR'),
    nullif(event_in->>'persona_id', ''),
    inserted.producer_organization_id,
    'dac_created',
    'dac',
    inserted.id::text,
    'ok',
    jsonb_build_object(
      'publicId', inserted.public_id,
      'fieldId', inserted.field_id,
      'verifiedSnapshotId', inserted.verified_snapshot_id
    )
  );

  return jsonb_build_object('created', true, 'dac', to_jsonb(inserted));
end;
$$;

revoke all on function public.origination_next_dac_seq() from public, anon, authenticated;
revoke all on function public.origination_create_dac(jsonb) from public, anon, authenticated;
grant execute on function public.origination_next_dac_seq() to service_role;
grant execute on function public.origination_create_dac(jsonb) to service_role;

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

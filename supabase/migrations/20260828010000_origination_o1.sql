-- Origination O1: producer fields, SCAS verification, private evidence.
-- Additive only. Does not alter market_core_*, registrar_registered_ownership,
-- identity enums, or personal-os objects.

create sequence if not exists public.producer_field_id_seq start 1;
create sequence if not exists public.field_case_id_seq start 1;
create sequence if not exists public.field_submission_id_seq start 1;

do $$ begin
  create type public.field_lifecycle_status as enum (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED',
    'RESUBMITTED', 'VERIFIED', 'REJECTED', 'ARCHIVED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.field_document_type as enum (
    'LAND_OWNERSHIP', 'LEASE_AGREEMENT', 'CADASTRE_EXTRACT', 'OTHER_EVIDENCE'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.field_document_status as enum (
    'UPLOADED', 'ACCEPTED', 'REPLACEMENT_REQUESTED', 'SUPERSEDED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.field_classification as enum (
    'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PERSONAL_DATA'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.field_retention_status as enum (
    'ACTIVE', 'ARCHIVED', 'RETENTION_HOLD', 'ELIGIBLE_FOR_DELETION'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.malware_scan_status as enum (
    'NOT_SCANNED', 'PENDING', 'CLEAN', 'QUARANTINED', 'FAILED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.field_verification_case_status as enum (
    'NEW', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'VERIFIED', 'REJECTED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.field_message_type as enum (
    'COMMENT', 'DOCUMENT_REQUEST', 'DOCUMENT_UPLOADED', 'SYSTEM', 'DECISION'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.field_evidence_kind as enum (
    'CADASTRAL', 'SATELLITE_IMAGERY', 'REVIEWER_NOTE', 'OTHER'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.producer_fields (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  organization_id uuid not null references public.organizations (id),
  status public.field_lifecycle_status not null default 'DRAFT',
  name text not null,
  season integer not null,
  crop text not null,
  cadastre_number text not null,
  declared_area_ha numeric(14,4),
  region text,
  district text,
  declared_snapshot jsonb not null default '{}'::jsonb,
  current_submission_id uuid,
  verified_snapshot_id uuid,
  created_by_user_id text not null,
  created_by_role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint producer_fields_name_len check (char_length(trim(name)) between 1 and 200),
  constraint producer_fields_cadastre_len check (char_length(trim(cadastre_number)) between 1 and 64)
);

create table if not exists public.field_submissions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  field_id uuid not null references public.producer_fields (id),
  organization_id uuid not null references public.organizations (id),
  version integer not null,
  declared_data jsonb not null,
  document_ids uuid[] not null default '{}',
  submitted_by_user_id text not null,
  submitted_by_role text not null,
  submitted_by_persona_id text,
  submitted_at timestamptz not null
);

create table if not exists public.field_documents (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.producer_fields (id),
  submission_id uuid references public.field_submissions (id),
  document_type public.field_document_type not null,
  bucket text not null,
  object_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  version integer not null,
  status public.field_document_status not null default 'UPLOADED',
  classification public.field_classification not null default 'CONFIDENTIAL',
  retention_status public.field_retention_status not null default 'ACTIVE',
  malware_scan_status public.malware_scan_status not null default 'NOT_SCANNED',
  uploaded_by_user_id text not null,
  uploaded_at timestamptz not null default now(),
  replaces_document_id uuid references public.field_documents (id),
  is_current boolean not null default true
);

create table if not exists public.field_verification_cases (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  field_id uuid not null unique references public.producer_fields (id),
  organization_id uuid not null references public.organizations (id),
  current_submission_id uuid not null references public.field_submissions (id),
  status public.field_verification_case_status not null default 'NEW',
  assigned_reviewer_user_id text,
  assigned_reviewer_persona_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_cadastre_verifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.field_verification_cases (id),
  field_id uuid not null references public.producer_fields (id),
  provider_id text not null default 'manual-scas',
  cadastre_number text not null,
  right_holder text not null,
  right_type text not null,
  registered_area_ha numeric(14,4),
  region text,
  district text,
  validity_status text not null,
  source_reference text not null default '',
  notes text not null default '',
  checked_by_user_id text not null,
  checked_by_role text not null,
  checked_by_persona_id text,
  checked_at timestamptz not null default now()
);

create table if not exists public.field_verification_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.field_verification_cases (id),
  field_id uuid not null references public.producer_fields (id),
  kind public.field_evidence_kind not null,
  notes text not null default '',
  imagery_date date,
  bucket text,
  object_path text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  uploaded_by_user_id text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.field_verification_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.field_verification_cases (id),
  field_id uuid not null references public.producer_fields (id),
  sender_user_id text not null,
  sender_role text not null,
  sender_persona_id text,
  body text not null,
  message_type public.field_message_type not null default 'COMMENT',
  linked_document_id uuid references public.field_documents (id),
  created_at timestamptz not null default now()
);

create table if not exists public.verified_field_snapshots (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null unique references public.producer_fields (id),
  case_id uuid not null references public.field_verification_cases (id),
  submission_id uuid not null references public.field_submissions (id),
  payload jsonb not null,
  approved_by_user_id text not null,
  approved_by_role text not null,
  approved_by_persona_id text,
  approved_at timestamptz not null default now()
);

create table if not exists public.field_origination_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id text not null,
  effective_role text not null,
  persona_id text,
  organization_id uuid references public.organizations (id),
  event_type text not null,
  object_type text not null,
  object_id text not null,
  result text not null default 'ok',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists producer_fields_org_status_idx
  on public.producer_fields (organization_id, status);
create index if not exists field_documents_field_idx
  on public.field_documents (field_id, is_current);
create index if not exists field_verification_cases_status_idx
  on public.field_verification_cases (status, created_at desc);
create index if not exists field_origination_events_object_idx
  on public.field_origination_events (object_type, object_id, occurred_at);

create or replace function public.origination_next_field_seq()
returns bigint
language sql
security definer
set search_path = public
as $$ select nextval('public.producer_field_id_seq'); $$;

create or replace function public.origination_next_case_seq()
returns bigint
language sql
security definer
set search_path = public
as $$ select nextval('public.field_case_id_seq'); $$;

create or replace function public.origination_next_submission_seq()
returns bigint
language sql
security definer
set search_path = public
as $$ select nextval('public.field_submission_id_seq'); $$;

revoke all on function public.origination_next_field_seq() from public, anon, authenticated;
revoke all on function public.origination_next_case_seq() from public, anon, authenticated;
revoke all on function public.origination_next_submission_seq() from public, anon, authenticated;

create or replace function public.origination_prevent_verified_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'VERIFIED' then
    raise exception 'verified field cannot be hard deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists producer_fields_no_verified_delete on public.producer_fields;
create trigger producer_fields_no_verified_delete
  before delete on public.producer_fields
  for each row execute function public.origination_prevent_verified_delete();

create or replace function public.origination_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'origination record is immutable';
end;
$$;

drop trigger if exists field_submissions_immutable on public.field_submissions;
create trigger field_submissions_immutable
  before update or delete on public.field_submissions
  for each row execute function public.origination_reject_mutation();

drop trigger if exists field_verification_messages_immutable on public.field_verification_messages;
create trigger field_verification_messages_immutable
  before update or delete on public.field_verification_messages
  for each row execute function public.origination_reject_mutation();

drop trigger if exists verified_field_snapshots_immutable on public.verified_field_snapshots;
create trigger verified_field_snapshots_immutable
  before update or delete on public.verified_field_snapshots
  for each row execute function public.origination_reject_mutation();

drop trigger if exists field_origination_events_immutable on public.field_origination_events;
create trigger field_origination_events_immutable
  before update or delete on public.field_origination_events
  for each row execute function public.origination_reject_mutation();

alter table public.producer_fields enable row level security;
alter table public.field_submissions enable row level security;
alter table public.field_documents enable row level security;
alter table public.field_verification_cases enable row level security;
alter table public.field_cadastre_verifications enable row level security;
alter table public.field_verification_evidence enable row level security;
alter table public.field_verification_messages enable row level security;
alter table public.verified_field_snapshots enable row level security;
alter table public.field_origination_events enable row level security;

revoke all on public.producer_fields from anon, authenticated;
revoke all on public.field_submissions from anon, authenticated;
revoke all on public.field_documents from anon, authenticated;
revoke all on public.field_verification_cases from anon, authenticated;
revoke all on public.field_cadastre_verifications from anon, authenticated;
revoke all on public.field_verification_evidence from anon, authenticated;
revoke all on public.field_verification_messages from anon, authenticated;
revoke all on public.verified_field_snapshots from anon, authenticated;
revoke all on public.field_origination_events from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'field-documents',
    'field-documents',
    false,
    20971520,
    array['application/pdf', 'image/jpeg', 'image/png']
  ),
  (
    'scas-evidence',
    'scas-evidence',
    false,
    20971520,
    array['application/pdf', 'image/jpeg', 'image/png']
  )
on conflict (id) do nothing;

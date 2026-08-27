-- Origination O1.2: upload intents, uniqueness, transactional RPCs.
-- Additive only. Does not alter market_core_*, registrar_registered_ownership,
-- identity enums, Phase 5B objects, or personal-os.

do $$ begin
  create type public.field_upload_intent_status as enum ('PREPARED', 'COMMITTED', 'EXPIRED');
exception when duplicate_object then null;
end $$;

create table if not exists public.field_upload_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  field_id uuid not null references public.producer_fields (id),
  document_id uuid not null,
  document_type public.field_document_type not null,
  object_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  expected_size_bytes bigint not null,
  version integer not null,
  replaces_document_id uuid references public.field_documents (id),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status public.field_upload_intent_status not null default 'PREPARED'
);

create index if not exists field_upload_intents_field_status_idx
  on public.field_upload_intents (field_id, status, expires_at);

create unique index if not exists field_documents_one_current_lineage
  on public.field_documents (field_id, document_type)
  where is_current;

create unique index if not exists field_documents_lineage_version
  on public.field_documents (field_id, document_type, version);

create unique index if not exists field_documents_object_path
  on public.field_documents (bucket, object_path);

create unique index if not exists field_submissions_field_version
  on public.field_submissions (field_id, version);

create unique index if not exists field_upload_intents_one_prepared_lineage
  on public.field_upload_intents (field_id, document_type)
  where status = 'PREPARED';

alter table public.field_upload_intents enable row level security;
revoke all on public.field_upload_intents from anon, authenticated;

create or replace function public.origination_commit_document(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  intent public.field_upload_intents%rowtype;
  doc jsonb := payload->'document';
  existing jsonb;
  intent_id uuid := nullif(payload->>'intent_id', '')::uuid;
  superseded uuid := nullif(payload->>'superseded_id', '')::uuid;
begin
  if intent_id is not null then
    select * into intent
    from public.field_upload_intents
    where id = intent_id
    for update;
    if not found then
      raise exception 'origination intent not found' using errcode = 'P0002';
    end if;
    if intent.status = 'COMMITTED' then
      select to_jsonb(d) into existing from public.field_documents d where d.id = intent.document_id;
      return jsonb_build_object('idempotent', true, 'document', existing);
    end if;
    if intent.status <> 'PREPARED' or intent.expires_at <= now() then
      if intent.status = 'PREPARED' then
        update public.field_upload_intents set status = 'EXPIRED' where id = intent.id;
      end if;
      raise exception 'origination intent is not usable' using errcode = 'P0001';
    end if;
  end if;

  if superseded is not null then
    update public.field_documents
    set is_current = false, status = 'SUPERSEDED'
    where id = superseded;
  end if;

  insert into public.field_documents (
    id, field_id, submission_id, document_type, bucket, object_path,
    original_filename, mime_type, size_bytes, sha256, version, status,
    classification, retention_status, malware_scan_status,
    uploaded_by_user_id, uploaded_at, replaces_document_id, is_current
  ) values (
    (doc->>'id')::uuid,
    (doc->>'field_id')::uuid,
    nullif(doc->>'submission_id', '')::uuid,
    (doc->>'document_type')::public.field_document_type,
    doc->>'bucket',
    doc->>'object_path',
    doc->>'original_filename',
    doc->>'mime_type',
    (doc->>'size_bytes')::bigint,
    doc->>'sha256',
    (doc->>'version')::integer,
    (doc->>'status')::public.field_document_status,
    (doc->>'classification')::public.field_classification,
    (doc->>'retention_status')::public.field_retention_status,
    (doc->>'malware_scan_status')::public.malware_scan_status,
    doc->>'uploaded_by_user_id',
    (doc->>'uploaded_at')::timestamptz,
    nullif(doc->>'replaces_document_id', '')::uuid,
    coalesce((doc->>'is_current')::boolean, true)
  );

  if intent_id is not null then
    update public.field_upload_intents
    set status = 'COMMITTED'
    where id = intent_id
      and status = 'PREPARED';
  end if;

  insert into public.field_origination_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    (payload#>>'{event,id}')::uuid,
    (payload#>>'{event,occurred_at}')::timestamptz,
    payload#>>'{event,actor_user_id}',
    payload#>>'{event,effective_role}',
    nullif(payload#>>'{event,persona_id}', ''),
    nullif(payload#>>'{event,organization_id}', '')::uuid,
    payload#>>'{event,event_type}',
    payload#>>'{event,object_type}',
    payload#>>'{event,object_id}',
    coalesce(payload#>>'{event,result}', 'ok'),
    coalesce(payload#>'{event,metadata}', '{}'::jsonb)
  );

  if jsonb_typeof(payload->'message') = 'object' then
    insert into public.field_verification_messages (
      id, case_id, field_id, sender_user_id, sender_role, sender_persona_id,
      body, message_type, linked_document_id, created_at
    ) values (
      (payload#>>'{message,id}')::uuid,
      (payload#>>'{message,case_id}')::uuid,
      (payload#>>'{message,field_id}')::uuid,
      payload#>>'{message,sender_user_id}',
      payload#>>'{message,sender_role}',
      nullif(payload#>>'{message,sender_persona_id}', ''),
      payload#>>'{message,body}',
      (payload#>>'{message,message_type}')::public.field_message_type,
      nullif(payload#>>'{message,linked_document_id}', '')::uuid,
      (payload#>>'{message,created_at}')::timestamptz
    );
  end if;

  select to_jsonb(d) into existing from public.field_documents d where d.id = (doc->>'id')::uuid;
  return jsonb_build_object('idempotent', false, 'document', existing);
end;
$$;

create or replace function public.origination_apply_submission(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  field_row public.producer_fields%rowtype;
  expected text := payload->>'expected_field_status';
  field jsonb := payload->'field';
  submission jsonb := payload->'submission';
  vcase jsonb := payload->'verification_case';
begin
  select * into field_row
  from public.producer_fields
  where id = (field->>'id')::uuid
  for update;
  if not found then
    raise exception 'origination field not found' using errcode = 'P0002';
  end if;
  if field_row.status::text <> expected then
    raise exception 'origination field is not in the expected state' using errcode = 'P0001';
  end if;

  insert into public.field_submissions (
    id, public_id, field_id, organization_id, version, declared_data, document_ids,
    submitted_by_user_id, submitted_by_role, submitted_by_persona_id, submitted_at
  ) values (
    (submission->>'id')::uuid,
    submission->>'public_id',
    (submission->>'field_id')::uuid,
    (submission->>'organization_id')::uuid,
    (submission->>'version')::integer,
    coalesce(submission->'declared_data', submission->'declared'),
    coalesce(array(select jsonb_array_elements_text(submission->'document_ids'))::uuid[], '{}'::uuid[]),
    submission->>'submitted_by_user_id',
    submission->>'submitted_by_role',
    nullif(submission->>'submitted_by_persona_id', ''),
    (submission->>'submitted_at')::timestamptz
  );

  if coalesce((payload->>'case_is_new')::boolean, false) then
    insert into public.field_verification_cases (
      id, public_id, field_id, organization_id, current_submission_id, status,
      assigned_reviewer_user_id, assigned_reviewer_persona_id, created_at, updated_at
    ) values (
      (vcase->>'id')::uuid,
      vcase->>'public_id',
      (vcase->>'field_id')::uuid,
      (vcase->>'organization_id')::uuid,
      (vcase->>'current_submission_id')::uuid,
      (vcase->>'status')::public.field_verification_case_status,
      nullif(vcase->>'assigned_reviewer_user_id', ''),
      nullif(vcase->>'assigned_reviewer_persona_id', ''),
      (vcase->>'created_at')::timestamptz,
      (vcase->>'updated_at')::timestamptz
    );
  else
    update public.field_verification_cases
    set current_submission_id = (vcase->>'current_submission_id')::uuid,
        status = (vcase->>'status')::public.field_verification_case_status,
        updated_at = (vcase->>'updated_at')::timestamptz
    where id = (vcase->>'id')::uuid;
  end if;

  update public.producer_fields
  set status = (field->>'status')::public.field_lifecycle_status,
      current_submission_id = (field->>'current_submission_id')::uuid,
      updated_at = (field->>'updated_at')::timestamptz
  where id = field_row.id;

  insert into public.field_origination_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    (payload#>>'{event,id}')::uuid,
    (payload#>>'{event,occurred_at}')::timestamptz,
    payload#>>'{event,actor_user_id}',
    payload#>>'{event,effective_role}',
    nullif(payload#>>'{event,persona_id}', ''),
    nullif(payload#>>'{event,organization_id}', '')::uuid,
    payload#>>'{event,event_type}',
    payload#>>'{event,object_type}',
    payload#>>'{event,object_id}',
    coalesce(payload#>>'{event,result}', 'ok'),
    coalesce(payload#>'{event,metadata}', '{}'::jsonb)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.origination_apply_change_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  field jsonb := payload->'field';
  vcase jsonb := payload->'verification_case';
  doc jsonb := payload->'document';
  ev jsonb;
begin
  perform 1 from public.producer_fields where id = (field->>'id')::uuid for update;
  perform 1 from public.field_verification_cases where id = (vcase->>'id')::uuid for update;

  update public.producer_fields
  set status = (field->>'status')::public.field_lifecycle_status,
      updated_at = (field->>'updated_at')::timestamptz
  where id = (field->>'id')::uuid;

  update public.field_verification_cases
  set status = (vcase->>'status')::public.field_verification_case_status,
      updated_at = (vcase->>'updated_at')::timestamptz
  where id = (vcase->>'id')::uuid;

  if jsonb_typeof(doc) = 'object' then
    update public.field_documents
    set status = (doc->>'status')::public.field_document_status
    where id = (doc->>'id')::uuid;
  end if;

  insert into public.field_verification_messages (
    id, case_id, field_id, sender_user_id, sender_role, sender_persona_id,
    body, message_type, linked_document_id, created_at
  ) values (
    (payload#>>'{message,id}')::uuid,
    (payload#>>'{message,case_id}')::uuid,
    (payload#>>'{message,field_id}')::uuid,
    payload#>>'{message,sender_user_id}',
    payload#>>'{message,sender_role}',
    nullif(payload#>>'{message,sender_persona_id}', ''),
    payload#>>'{message,body}',
    (payload#>>'{message,message_type}')::public.field_message_type,
    nullif(payload#>>'{message,linked_document_id}', '')::uuid,
    (payload#>>'{message,created_at}')::timestamptz
  );

  for ev in select * from jsonb_array_elements(coalesce(payload->'events', '[]'::jsonb))
  loop
    insert into public.field_origination_events (
      id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
      event_type, object_type, object_id, result, metadata
    ) values (
      (ev->>'id')::uuid,
      (ev->>'occurred_at')::timestamptz,
      ev->>'actor_user_id',
      ev->>'effective_role',
      nullif(ev->>'persona_id', ''),
      nullif(ev->>'organization_id', '')::uuid,
      ev->>'event_type',
      ev->>'object_type',
      ev->>'object_id',
      coalesce(ev->>'result', 'ok'),
      coalesce(ev->'metadata', '{}'::jsonb)
    );
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.origination_apply_approval(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  field jsonb := payload->'field';
  vcase jsonb := payload->'verification_case';
  snap jsonb := payload->'snapshot';
begin
  perform 1 from public.producer_fields where id = (field->>'id')::uuid for update;
  perform 1 from public.field_verification_cases where id = (vcase->>'id')::uuid for update;

  if exists (
    select 1 from public.verified_field_snapshots where field_id = (field->>'id')::uuid
  ) then
    raise exception 'origination field is already verified' using errcode = 'P0001';
  end if;

  insert into public.verified_field_snapshots (
    id, field_id, case_id, submission_id, payload,
    approved_by_user_id, approved_by_role, approved_by_persona_id, approved_at
  ) values (
    (snap->>'id')::uuid,
    (snap->>'field_id')::uuid,
    (snap->>'case_id')::uuid,
    (snap->>'submission_id')::uuid,
    snap->'payload',
    snap->>'approved_by_user_id',
    snap->>'approved_by_role',
    nullif(snap->>'approved_by_persona_id', ''),
    (snap->>'approved_at')::timestamptz
  );

  update public.producer_fields
  set status = 'VERIFIED',
      verified_snapshot_id = (snap->>'id')::uuid,
      updated_at = (field->>'updated_at')::timestamptz
  where id = (field->>'id')::uuid;

  update public.field_verification_cases
  set status = 'VERIFIED',
      updated_at = (vcase->>'updated_at')::timestamptz
  where id = (vcase->>'id')::uuid;

  insert into public.field_verification_messages (
    id, case_id, field_id, sender_user_id, sender_role, sender_persona_id,
    body, message_type, linked_document_id, created_at
  ) values (
    (payload#>>'{message,id}')::uuid,
    (payload#>>'{message,case_id}')::uuid,
    (payload#>>'{message,field_id}')::uuid,
    payload#>>'{message,sender_user_id}',
    payload#>>'{message,sender_role}',
    nullif(payload#>>'{message,sender_persona_id}', ''),
    payload#>>'{message,body}',
    (payload#>>'{message,message_type}')::public.field_message_type,
    nullif(payload#>>'{message,linked_document_id}', '')::uuid,
    (payload#>>'{message,created_at}')::timestamptz
  );

  insert into public.field_origination_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    (payload#>>'{event,id}')::uuid,
    (payload#>>'{event,occurred_at}')::timestamptz,
    payload#>>'{event,actor_user_id}',
    payload#>>'{event,effective_role}',
    nullif(payload#>>'{event,persona_id}', ''),
    nullif(payload#>>'{event,organization_id}', '')::uuid,
    payload#>>'{event,event_type}',
    payload#>>'{event,object_type}',
    payload#>>'{event,object_id}',
    coalesce(payload#>>'{event,result}', 'ok'),
    coalesce(payload#>'{event,metadata}', '{}'::jsonb)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.origination_apply_rejection(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  field jsonb := payload->'field';
  vcase jsonb := payload->'verification_case';
begin
  perform 1 from public.producer_fields where id = (field->>'id')::uuid for update;
  perform 1 from public.field_verification_cases where id = (vcase->>'id')::uuid for update;

  update public.producer_fields
  set status = 'REJECTED',
      updated_at = (field->>'updated_at')::timestamptz
  where id = (field->>'id')::uuid;

  update public.field_verification_cases
  set status = 'REJECTED',
      updated_at = (vcase->>'updated_at')::timestamptz
  where id = (vcase->>'id')::uuid;

  insert into public.field_verification_messages (
    id, case_id, field_id, sender_user_id, sender_role, sender_persona_id,
    body, message_type, linked_document_id, created_at
  ) values (
    (payload#>>'{message,id}')::uuid,
    (payload#>>'{message,case_id}')::uuid,
    (payload#>>'{message,field_id}')::uuid,
    payload#>>'{message,sender_user_id}',
    payload#>>'{message,sender_role}',
    nullif(payload#>>'{message,sender_persona_id}', ''),
    payload#>>'{message,body}',
    (payload#>>'{message,message_type}')::public.field_message_type,
    nullif(payload#>>'{message,linked_document_id}', '')::uuid,
    (payload#>>'{message,created_at}')::timestamptz
  );

  insert into public.field_origination_events (
    id, occurred_at, actor_user_id, effective_role, persona_id, organization_id,
    event_type, object_type, object_id, result, metadata
  ) values (
    (payload#>>'{event,id}')::uuid,
    (payload#>>'{event,occurred_at}')::timestamptz,
    payload#>>'{event,actor_user_id}',
    payload#>>'{event,effective_role}',
    nullif(payload#>>'{event,persona_id}', ''),
    nullif(payload#>>'{event,organization_id}', '')::uuid,
    payload#>>'{event,event_type}',
    payload#>>'{event,object_type}',
    payload#>>'{event,object_id}',
    coalesce(payload#>>'{event,result}', 'ok'),
    coalesce(payload#>'{event,metadata}', '{}'::jsonb)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.origination_commit_document(jsonb) from public, anon, authenticated;
revoke all on function public.origination_apply_submission(jsonb) from public, anon, authenticated;
revoke all on function public.origination_apply_change_request(jsonb) from public, anon, authenticated;
revoke all on function public.origination_apply_approval(jsonb) from public, anon, authenticated;
revoke all on function public.origination_apply_rejection(jsonb) from public, anon, authenticated;

grant execute on function public.origination_commit_document(jsonb) to service_role;
grant execute on function public.origination_apply_submission(jsonb) to service_role;
grant execute on function public.origination_apply_change_request(jsonb) to service_role;
grant execute on function public.origination_apply_approval(jsonb) to service_role;
grant execute on function public.origination_apply_rejection(jsonb) to service_role;

-- Origination O1.2.1: transactional upload-intent prepare and RPC state guards.
-- Additive. Does not rewrite 20260828030000. Does not alter market_core_*,
-- registrar_registered_ownership, identity enums, Phase 5B, or personal-os.

create or replace function public.origination_prepare_upload_intent(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  intent jsonb := payload->'intent';
  field_row public.producer_fields%rowtype;
  existing public.field_upload_intents%rowtype;
  inserted public.field_upload_intents%rowtype;
begin
  select * into field_row
  from public.producer_fields
  where id = (intent->>'field_id')::uuid
  for update;
  if not found then
    raise exception 'origination field not found' using errcode = 'P0002';
  end if;
  if field_row.organization_id <> (intent->>'organization_id')::uuid then
    raise exception 'origination intent does not belong to this field' using errcode = 'P0001';
  end if;
  if field_row.status::text not in ('DRAFT', 'CHANGES_REQUESTED') then
    raise exception 'origination upload window is closed' using errcode = 'P0001';
  end if;

  update public.field_upload_intents
  set status = 'EXPIRED'
  where field_id = field_row.id
    and document_type = (intent->>'document_type')::public.field_document_type
    and status = 'PREPARED'
    and expires_at <= now();

  select * into existing
  from public.field_upload_intents
  where field_id = field_row.id
    and document_type = (intent->>'document_type')::public.field_document_type
    and status = 'PREPARED'
  for update;

  if found then
    if existing.original_filename = intent->>'original_filename'
      and existing.mime_type = intent->>'mime_type'
      and existing.expected_size_bytes = (intent->>'expected_size_bytes')::bigint
      and existing.replaces_document_id is not distinct from nullif(intent->>'replaces_document_id', '')::uuid
    then
      return jsonb_build_object('idempotent', true, 'intent', to_jsonb(existing));
    end if;
    raise exception 'origination upload is already in progress' using errcode = 'P0001';
  end if;

  insert into public.field_upload_intents (
    id, organization_id, field_id, document_id, document_type, object_path,
    original_filename, mime_type, expected_size_bytes, version, replaces_document_id,
    created_by_user_id, created_at, expires_at, status
  ) values (
    (intent->>'id')::uuid,
    (intent->>'organization_id')::uuid,
    (intent->>'field_id')::uuid,
    (intent->>'document_id')::uuid,
    (intent->>'document_type')::public.field_document_type,
    intent->>'object_path',
    intent->>'original_filename',
    intent->>'mime_type',
    (intent->>'expected_size_bytes')::bigint,
    (intent->>'version')::integer,
    nullif(intent->>'replaces_document_id', '')::uuid,
    intent->>'created_by_user_id',
    (intent->>'created_at')::timestamptz,
    (intent->>'expires_at')::timestamptz,
    'PREPARED'
  )
  returning * into inserted;

  return jsonb_build_object('idempotent', false, 'intent', to_jsonb(inserted));
end;
$$;

create or replace function public.origination_commit_document(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  intent public.field_upload_intents%rowtype;
  field_row public.producer_fields%rowtype;
  doc jsonb := payload->'document';
  existing jsonb;
  intent_id uuid := nullif(payload->>'intent_id', '')::uuid;
  superseded uuid := nullif(payload->>'superseded_id', '')::uuid;
  field_id uuid;
begin
  field_id := (doc->>'field_id')::uuid;

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
    field_id := intent.field_id;
  end if;

  select * into field_row
  from public.producer_fields
  where id = field_id
  for update;
  if not found then
    raise exception 'origination field not found' using errcode = 'P0002';
  end if;

  if intent_id is not null then
    if intent.organization_id <> field_row.organization_id
      or intent.field_id <> field_row.id
      or intent.field_id <> (doc->>'field_id')::uuid
    then
      raise exception 'origination intent does not belong to this field' using errcode = 'P0001';
    end if;
    if intent.status <> 'PREPARED' or intent.expires_at <= now() then
      if intent.status = 'PREPARED' then
        update public.field_upload_intents set status = 'EXPIRED' where id = intent.id;
      end if;
      raise exception 'origination intent is not usable' using errcode = 'P0001';
    end if;
  end if;

  if field_row.status::text not in ('DRAFT', 'CHANGES_REQUESTED') then
    raise exception 'origination upload window is closed' using errcode = 'P0001';
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
  case_row public.field_verification_cases%rowtype;
  expected text := payload->>'expected_field_status';
  field jsonb := payload->'field';
  submission jsonb := payload->'submission';
  vcase jsonb := payload->'verification_case';
  case_is_new boolean := coalesce((payload->>'case_is_new')::boolean, false);
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

  if case_is_new then
    if expected <> 'DRAFT' then
      raise exception 'origination field is not in the expected state' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.field_verification_cases where field_id = field_row.id
    ) then
      raise exception 'origination case already exists' using errcode = 'P0001';
    end if;
  else
    if expected <> 'CHANGES_REQUESTED' then
      raise exception 'origination field is not in the expected state' using errcode = 'P0001';
    end if;
    select * into case_row
    from public.field_verification_cases
    where id = (vcase->>'id')::uuid
    for update;
    if not found then
      raise exception 'origination case not found' using errcode = 'P0002';
    end if;
    if case_row.field_id <> field_row.id
      or case_row.status::text <> 'CHANGES_REQUESTED'
    then
      raise exception 'origination case is not in the expected state' using errcode = 'P0001';
    end if;
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

  if case_is_new then
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

  update public.field_upload_intents
  set status = 'EXPIRED'
  where field_id = field_row.id
    and status = 'PREPARED';

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
  field_row public.producer_fields%rowtype;
  case_row public.field_verification_cases%rowtype;
  ev jsonb;
begin
  select * into field_row
  from public.producer_fields
  where id = (field->>'id')::uuid
  for update;
  select * into case_row
  from public.field_verification_cases
  where id = (vcase->>'id')::uuid
  for update;
  if field_row.id is null or case_row.id is null then
    raise exception 'origination case not found' using errcode = 'P0002';
  end if;
  if field_row.status::text in ('VERIFIED', 'REJECTED', 'ARCHIVED')
    or case_row.status::text in ('VERIFIED', 'REJECTED')
  then
    raise exception 'origination terminal state cannot be overwritten' using errcode = 'P0001';
  end if;
  if field_row.status::text not in ('SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'CHANGES_REQUESTED')
    or case_row.status::text not in ('NEW', 'UNDER_REVIEW', 'RESUBMITTED', 'CHANGES_REQUESTED')
    or case_row.field_id <> field_row.id
  then
    raise exception 'origination is not in an allowed source state' using errcode = 'P0001';
  end if;

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
  field_row public.producer_fields%rowtype;
  case_row public.field_verification_cases%rowtype;
begin
  select * into field_row
  from public.producer_fields
  where id = (field->>'id')::uuid
  for update;
  select * into case_row
  from public.field_verification_cases
  where id = (vcase->>'id')::uuid
  for update;
  if field_row.id is null or case_row.id is null then
    raise exception 'origination case not found' using errcode = 'P0002';
  end if;
  if field_row.status::text in ('VERIFIED', 'REJECTED')
    or case_row.status::text in ('VERIFIED', 'REJECTED')
    or exists (
      select 1 from public.verified_field_snapshots where field_id = field_row.id
    )
  then
    raise exception 'origination field is already verified' using errcode = 'P0001';
  end if;
  if field_row.status::text <> 'UNDER_REVIEW' or case_row.status::text <> 'UNDER_REVIEW' then
    raise exception 'origination approval requires under review' using errcode = 'P0001';
  end if;
  if case_row.current_submission_id <> (snap->>'submission_id')::uuid
    or field_row.current_submission_id <> (snap->>'submission_id')::uuid
    or (snap->>'field_id')::uuid <> field_row.id
    or (snap->>'case_id')::uuid <> case_row.id
  then
    raise exception 'origination approval is not bound to the current submission' using errcode = 'P0001';
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
  field_row public.producer_fields%rowtype;
  case_row public.field_verification_cases%rowtype;
begin
  select * into field_row
  from public.producer_fields
  where id = (field->>'id')::uuid
  for update;
  select * into case_row
  from public.field_verification_cases
  where id = (vcase->>'id')::uuid
  for update;
  if field_row.id is null or case_row.id is null then
    raise exception 'origination case not found' using errcode = 'P0002';
  end if;
  if field_row.status::text in ('VERIFIED', 'REJECTED')
    or case_row.status::text in ('VERIFIED', 'REJECTED')
  then
    raise exception 'origination terminal state cannot be overwritten' using errcode = 'P0001';
  end if;
  if field_row.status::text not in ('SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'CHANGES_REQUESTED')
    or case_row.status::text not in ('NEW', 'UNDER_REVIEW', 'RESUBMITTED', 'CHANGES_REQUESTED')
    or case_row.field_id <> field_row.id
  then
    raise exception 'origination is not in an allowed source state' using errcode = 'P0001';
  end if;

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

revoke all on function public.origination_prepare_upload_intent(jsonb) from public, anon, authenticated;
revoke all on function public.origination_commit_document(jsonb) from public, anon, authenticated;
revoke all on function public.origination_apply_submission(jsonb) from public, anon, authenticated;
revoke all on function public.origination_apply_change_request(jsonb) from public, anon, authenticated;
revoke all on function public.origination_apply_approval(jsonb) from public, anon, authenticated;
revoke all on function public.origination_apply_rejection(jsonb) from public, anon, authenticated;

grant execute on function public.origination_prepare_upload_intent(jsonb) to service_role;
grant execute on function public.origination_commit_document(jsonb) to service_role;
grant execute on function public.origination_apply_submission(jsonb) to service_role;
grant execute on function public.origination_apply_change_request(jsonb) to service_role;
grant execute on function public.origination_apply_approval(jsonb) to service_role;
grant execute on function public.origination_apply_rejection(jsonb) to service_role;

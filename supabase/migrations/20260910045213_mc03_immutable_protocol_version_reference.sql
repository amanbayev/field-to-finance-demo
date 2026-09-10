-- MC-03 shared immutable references only. No seed, instrument, admission or engine.
begin;

-- Closed v1 JSON contract; no coercion, missing keys, extra keys or empty rules.
create function private.protocol_version_snapshot_valid(s jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare k text; v jsonb; r jsonb;
begin
  if s is null or jsonb_typeof(s) <> 'object' then return false; end if;
  if not (s ?& array['id','protocolId','displayVersion','state','frozen','activatedAt',
    'frozenAt','supersedesVersionId','supersededByVersionId','governanceNote','rules'])
    or s - array['id','protocolId','displayVersion','state','frozen','activatedAt',
    'frozenAt','supersedesVersionId','supersededByVersionId','governanceNote','rules'] <> '{}'::jsonb
    then return false; end if;
  foreach k in array array['id','protocolId','displayVersion','state','governanceNote'] loop
    if jsonb_typeof(s->k) <> 'string' or btrim(s->>k) = '' then return false; end if;
  end loop;
  if (s->>'id') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    or (s->>'protocolId') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    or s->>'state' not in ('DRAFT','ACTIVE','SUPERSEDED','RETIRED')
    or s->'frozen' <> 'true'::jsonb then return false; end if;
  foreach k in array array['supersedesVersionId','supersededByVersionId'] loop
    if s->k <> 'null'::jsonb and (jsonb_typeof(s->k) <> 'string'
      or (s->>k) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') then return false; end if;
  end loop;
  foreach k in array array['activatedAt','frozenAt'] loop
    if s->k <> 'null'::jsonb then
      if jsonb_typeof(s->k) <> 'string' or (s->>k) !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
        then return false; end if;
      -- Validate the calendar/time without rewriting the source string.
      perform (s->>k)::timestamptz;
      if substring(s->>k from 12 for 2)::integer > 23
        or substring(s->>k from 15 for 2)::integer > 59
        or substring(s->>k from 18 for 2)::integer > 59 then return false; end if;
    end if;
  end loop;
  r := s->'rules';
  if jsonb_typeof(r) <> 'object' then return false; end if;
  if not (r ?& array['verificationModel','riskModel','coverageModel','issuanceModel',
    'redemptionModel','lifecycle','modules']) or r - array['verificationModel','riskModel',
    'coverageModel','issuanceModel','redemptionModel','lifecycle','modules'] <> '{}'::jsonb
    then return false; end if;
  foreach k in array array['verificationModel','riskModel','coverageModel','issuanceModel','redemptionModel'] loop
    if jsonb_typeof(r->k) <> 'string' or btrim(r->>k) = '' then return false; end if;
  end loop;
  foreach k in array array['lifecycle','modules'] loop
    if jsonb_typeof(r->k) <> 'array' then return false; end if;
    for v in select value from jsonb_array_elements(r->k) loop
      if jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = '' then return false; end if;
    end loop;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

create function private.protocol_version_provenance_valid(s jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_typeof(s) = 'object'
    and s ?& array['kind','repository','commit','path','exportName']
    and s - array['kind','repository','commit','path','exportName'] = '{}'::jsonb
    and s->>'kind' = 'GIT_CATALOG_REFERENCE'
    and jsonb_typeof(s->'repository') = 'string' and btrim(s->>'repository') <> ''
    and jsonb_typeof(s->'commit') = 'string' and s->>'commit' ~ '^[0-9a-f]{40}$'
    and jsonb_typeof(s->'path') = 'string' and btrim(s->>'path') <> ''
    and jsonb_typeof(s->'exportName') = 'string' and btrim(s->>'exportName') <> '', false);
$$;

create table public.protocol_version_records (
  id text primary key,
  protocol_id text not null,
  snapshot jsonb not null,
  -- Text deliberately retains the exact nullable source dates without timezone normalization.
  activated_at text,
  frozen_at text,
  provenance jsonb not null,
  recorded_at timestamptz not null default clock_timestamp() check (isfinite(recorded_at)),
  recorded_by text not null default current_user check (btrim(recorded_by) <> ''),
  constraint protocol_version_snapshot_contract check (private.protocol_version_snapshot_valid(snapshot)),
  constraint protocol_version_identity_consistent check
    (id = snapshot->>'id' and protocol_id = snapshot->>'protocolId'),
  constraint protocol_version_governance_consistent check
    (activated_at is not distinct from snapshot->>'activatedAt'
      and frozen_at is not distinct from snapshot->>'frozenAt'),
  constraint protocol_version_provenance_contract check (private.protocol_version_provenance_valid(provenance))
);
comment on table public.protocol_version_records is
  'Shared append-only full frozen references. ACTIVE is demonstrator state, not approval/admission. Future exact instrument FKs must use RESTRICT/NO ACTION, never deletion cascade.';
comment on column public.protocol_version_records.recorded_at is
  'Database recording event only, never a legal activation or governance freeze date.';

create function private.protocol_version_record_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new is distinct from old then raise exception 'protocol_version_record_immutable'; end if;
  return new;
end;
$$;
-- Whole-row AFTER guard observes every final BEFORE-trigger value, including no-op UPDATE targets.
create trigger protocol_version_record_guard after update on public.protocol_version_records
  for each row execute function private.protocol_version_record_guard();

create function private.protocol_version_record_preserve()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'protocol_version_record_preserved';
end;
$$;
create trigger protocol_version_record_preserve before delete or truncate on public.protocol_version_records
  for each statement execute function private.protocol_version_record_preserve();

-- Owner-context primitive; not a Data API endpoint or an external command contract.
create function private.record_protocol_version(p_id text, p_protocol_id text, p_snapshot jsonb, p_provenance jsonb)
returns public.protocol_version_records
language plpgsql volatile security invoker set search_path = '' as $$
declare
  result public.protocol_version_records%rowtype;
  recording_time timestamptz := clock_timestamp();
  recording_role text := current_user;
begin
  if not private.protocol_version_snapshot_valid(p_snapshot)
    or p_id is distinct from p_snapshot->>'id'
    or p_protocol_id is distinct from p_snapshot->>'protocolId'
    or not private.protocol_version_provenance_valid(p_provenance) then
    raise exception 'protocol_version_import_invalid';
  end if;
  insert into public.protocol_version_records(id,protocol_id,snapshot,activated_at,frozen_at,
    provenance,recorded_at,recorded_by)
    values(p_id,p_protocol_id,p_snapshot,p_snapshot->>'activatedAt',p_snapshot->>'frozenAt',
      p_provenance,recording_time,recording_role)
    on conflict (id) do nothing returning * into result;
  if found then
    if result.id is distinct from p_id or result.protocol_id is distinct from p_protocol_id
      or result.snapshot is distinct from p_snapshot or result.provenance is distinct from p_provenance
      or result.recorded_at is distinct from recording_time or result.recorded_by is distinct from recording_role then
      raise exception 'protocol_version_import_redirected';
    end if;
  else
    -- A separate READ COMMITTED statement sees the winner after unique-index waiting.
    -- Higher isolation may raise 40001; never catch/adopt that failure as success.
    select * into result from public.protocol_version_records where id = p_id;
    if not found then raise sqlstate '40001' using message = 'protocol_version_import_not_visible'; end if;
    if result.protocol_id is distinct from p_protocol_id or result.snapshot is distinct from p_snapshot then
      raise exception 'protocol_version_import_conflict';
    end if;
  end if;
  return result;
end;
$$;

-- Sole established source; immutable copy of all 11 version fields and 7 rule fields.
create function private.import_known_protocol_version(p_id text)
returns public.protocol_version_records
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if p_id is distinct from 'F2F-V1.1' then raise exception 'protocol_version_source_not_established'; end if;
  return private.record_protocol_version(p_id, 'F2F',
    $mc03_snapshot${
  "id": "F2F-V1.1",
  "protocolId": "F2F",
  "displayVersion": "1.1",
  "state": "ACTIVE",
  "frozen": true,
  "activatedAt": null,
  "frozenAt": null,
  "supersedesVersionId": null,
  "supersededByVersionId": null,
  "governanceNote": "First recorded version of the Field to Finance demonstrator protocol. No formal legal or governance activation date has been established, and none is claimed: activation and freeze dates are deliberately unset rather than assumed. Immutability is asserted by the frozen marker — instruments issued under this version keep this exact reference and do not follow later versions.",
  "rules": {
    "verificationModel": "SCAS / fields / DAC / coverage",
    "riskModel": "Off-chain risk haircut on pooled contracts",
    "coverageModel": "Eligible coverage as issuance capacity, not a legal pledge",
    "issuanceModel": "Token-2022 ASSET_TOKEN against issuer claim",
    "redemptionModel": "Working hypothesis · grain delivery window",
    "lifecycle": [
      "field",
      "dac",
      "verification",
      "pool",
      "coverage",
      "instrument",
      "issuance",
      "placement",
      "market",
      "redemption"
    ],
    "modules": [
      "fields",
      "dacs",
      "scas",
      "pools",
      "coverage",
      "monitoring"
    ]
  }
}$mc03_snapshot$::jsonb,
    $mc03_provenance${
  "kind": "GIT_CATALOG_REFERENCE",
  "repository": "https://github.com/amanbayev/field-to-finance-demo.git",
  "commit": "1d9e16b363336756032824bcb1946fd1b57f7e53",
  "path": "src/data/market-core/catalog.ts",
  "exportName": "protocolVersions"
}$mc03_provenance$::jsonb);
end;
$$;
revoke all on function private.import_known_protocol_version(text)
  from public, anon, authenticated, service_role;
comment on function private.import_known_protocol_version(text) is
  'Explicit privileged import of F2F-V1.1 from the complete catalog object at 1d9e16b363336756032824bcb1946fd1b57f7e53. Never invoked by migrations, seed, reset, reads, login, build or app startup.';


alter table public.protocol_version_records enable row level security;
revoke all on table public.protocol_version_records from public, anon, authenticated, service_role;
-- Shared reference content is readable by authenticated sessions, independent of organization.
-- UI permissions and instrument eligibility remain separate, unchanged contracts.
grant select on table public.protocol_version_records to authenticated;
create policy protocol_version_reference_read on public.protocol_version_records
  for select to authenticated using (true);

revoke all on function private.protocol_version_snapshot_valid(jsonb),
  private.protocol_version_provenance_valid(jsonb), private.protocol_version_record_guard(),
  private.protocol_version_record_preserve(), private.record_protocol_version(text,text,jsonb,jsonb)
  from public, anon, authenticated, service_role;

commit;

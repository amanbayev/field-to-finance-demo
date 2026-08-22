-- Phase 4.5 admin capabilities: unique org slugs, create organization,
-- add/remove membership, demo persona activate/deactivate.
-- Application tables only. Does not alter Solana / WHEAT-2027 state.

create index if not exists memberships_organization_id_idx
  on public.memberships (organization_id);
create index if not exists role_requests_user_id_idx
  on public.role_requests (user_id);
create index if not exists demo_personas_organization_id_idx
  on public.demo_personas (organization_id);
create index if not exists app_audit_events_principal_user_id_idx
  on public.app_audit_events (principal_user_id);

create or replace function private.unique_organization_slug(p_name text, p_salt text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  base text;
  salt text;
  candidate text;
  n int := 0;
begin
  base := lower(regexp_replace(trim(coalesce(p_name, '')), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if base = '' then
    base := 'org';
  end if;
  base := left(base, 48);
  salt := left(regexp_replace(lower(coalesce(p_salt, '')), '[^a-z0-9]+', '', 'g'), 12);
  if salt = '' then
    salt := 'x';
  end if;
  candidate := base;
  while exists (select 1 from public.organizations where slug = candidate) loop
    n := n + 1;
    candidate := left(base, 40) || '-' || salt || case when n > 1 then '-' || n::text else '' end;
  end loop;
  return candidate;
end;
$$;

create or replace function public.review_role_request(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  req public.role_requests%rowtype;
  org_id uuid;
  mem_id uuid;
  assigned_role text;
  org_type public.organization_type;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'invalid_decision';
  end if;
  select * into req from public.role_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  update public.role_requests
    set status = p_decision::public.role_request_status,
        reviewed_by = uid,
        reviewed_at = now()
    where id = p_request_id;
  if p_decision = 'APPROVED' then
    assigned_role := case req.intent
      when 'PRODUCER' then 'PRODUCER_ADMIN'
      when 'INVESTOR' then 'INVESTOR'
      when 'TRADER' then 'TRADER'
      else null
    end;
    if assigned_role is null then
      perform private.write_audit('ADMIN', 'role_request_approved_pending_org', uid, null, null, null, null, jsonb_build_object('request_id', p_request_id));
      return jsonb_build_object('ok', true, 'pending_organization', true);
    end if;
    org_type := case req.intent
      when 'PRODUCER' then 'PRODUCER'::public.organization_type
      when 'INVESTOR' then 'INVESTMENT_FUND'::public.organization_type
      when 'TRADER' then 'TRADING_FIRM'::public.organization_type
    end;
    if req.organization_name is not null and length(trim(req.organization_name)) > 0 then
      select id into org_id
      from public.organizations
      where lower(name) = lower(trim(req.organization_name))
        and type = org_type
      limit 1;
    end if;
    if org_id is null then
      insert into public.organizations (slug, name, type)
      values (
        private.unique_organization_slug(
          coalesce(nullif(trim(req.organization_name), ''), req.intent::text),
          p_request_id::text
        ),
        coalesce(nullif(trim(req.organization_name), ''), req.intent::text),
        org_type
      )
      returning id into org_id;
    end if;
    insert into public.memberships (user_id, organization_id, status)
    values (req.user_id, org_id, 'ACTIVE')
    on conflict (user_id, organization_id) do update
      set status = 'ACTIVE'
    returning id into mem_id;
    if not exists (
      select 1
      from public.membership_roles
      where membership_id = mem_id
        and role_id = assigned_role
        and revoked_at is null
    ) then
      insert into public.membership_roles (membership_id, role_id, assigned_by)
      values (mem_id, assigned_role, uid);
    end if;
  end if;
  perform private.write_audit(
    'ADMIN',
    case when p_decision = 'APPROVED' then 'role_request_approved' else 'role_request_rejected' end,
    uid, null, null, null, org_id,
    jsonb_build_object('request_id', p_request_id, 'subject_user_id', req.user_id)
  );
  return jsonb_build_object('ok', true, 'organization_id', org_id);
end;
$$;

create or replace function public.create_organization(
  p_name text,
  p_type public.organization_type,
  p_external_producer_ref text default null,
  p_external_investor_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  org_id uuid;
  slug text;
begin
  if uid is null or not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid_name';
  end if;
  slug := private.unique_organization_slug(p_name, gen_random_uuid()::text);
  insert into public.organizations (
    slug, name, type, status, external_producer_ref, external_investor_ref
  ) values (
    slug, trim(p_name), p_type, 'ACTIVE',
    nullif(trim(p_external_producer_ref), ''),
    nullif(trim(p_external_investor_ref), '')
  )
  returning id into org_id;
  perform private.write_audit(
    'ADMIN',
    'organization_created',
    uid, null, null, null, org_id,
    jsonb_build_object('slug', slug, 'type', p_type::text)
  );
  return jsonb_build_object('ok', true, 'organization_id', org_id, 'slug', slug);
end;
$$;

create or replace function public.add_membership(
  p_user_id uuid,
  p_organization_id uuid,
  p_role_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mem_id uuid;
begin
  if uid is null or not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'user_not_found';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then
    raise exception 'organization_not_found';
  end if;
  insert into public.memberships (user_id, organization_id, status)
  values (p_user_id, p_organization_id, 'ACTIVE')
  on conflict (user_id, organization_id) do update
    set status = 'ACTIVE'
  returning id into mem_id;
  if p_role_id is not null then
    if p_role_id not in (
      'SYSTEM_ADMIN','REGULATOR','REGISTRAR_OPERATOR','SCAS_OPERATOR',
      'ISSUER_OPERATOR','PRODUCER_ADMIN','INVESTOR','TRADER','COMPLIANCE_OFFICER'
    ) then
      raise exception 'unknown_role';
    end if;
    if not exists (
      select 1
      from public.membership_roles
      where membership_id = mem_id
        and role_id = p_role_id
        and revoked_at is null
    ) then
      insert into public.membership_roles (membership_id, role_id, assigned_by)
      values (mem_id, p_role_id, uid);
    end if;
  end if;
  perform private.write_audit(
    'ADMIN',
    'membership_added',
    uid, null, null, null, p_organization_id,
    jsonb_build_object('subject_user_id', p_user_id, 'role_id', p_role_id)
  );
  return jsonb_build_object('ok', true, 'membership_id', mem_id);
end;
$$;

create or replace function public.remove_membership(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mem public.memberships%rowtype;
begin
  if uid is null or not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  select * into mem from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'not_found';
  end if;
  update public.membership_roles
    set revoked_at = now()
    where membership_id = p_membership_id and revoked_at is null;
  update public.memberships
    set status = 'INACTIVE'
    where id = p_membership_id;
  perform private.write_audit(
    'ADMIN',
    'membership_removed',
    uid, null, null, null, mem.organization_id,
    jsonb_build_object('subject_user_id', mem.user_id, 'membership_id', p_membership_id)
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.set_demo_persona_status(
  p_persona_id text,
  p_status public.persona_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not private.is_system_admin(uid) then
    raise exception 'forbidden';
  end if;
  update public.demo_personas
    set status = p_status
    where id = p_persona_id;
  if not found then
    raise exception 'persona_not_found';
  end if;
  perform private.write_audit(
    'ADMIN',
    'demo_persona_status_changed',
    uid, p_persona_id, null, null, null,
    jsonb_build_object('persona_id', p_persona_id, 'status', p_status::text)
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.create_organization(text, public.organization_type, text, text) from public, anon;
revoke all on function public.add_membership(uuid, uuid, text) from public, anon;
revoke all on function public.remove_membership(uuid) from public, anon;
revoke all on function public.set_demo_persona_status(text, public.persona_status) from public, anon;
revoke all on function public.review_role_request(uuid, text) from public, anon;

grant execute on function public.create_organization(text, public.organization_type, text, text) to authenticated;
grant execute on function public.add_membership(uuid, uuid, text) to authenticated;
grant execute on function public.remove_membership(uuid) to authenticated;
grant execute on function public.set_demo_persona_status(text, public.persona_status) to authenticated;
grant execute on function public.review_role_request(uuid, text) to authenticated;

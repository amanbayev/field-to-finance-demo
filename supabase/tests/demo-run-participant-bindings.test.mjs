// Disposable actual PostgreSQL, Unix socket only; no database URL or shared access.
// Minimal Auth/Storage stand-ins exist only to load the real repository migrations.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (!process.env.GP01_EMBEDDED_POSTGRES_MODULE?.startsWith('/')) {
  throw new Error('Set GP01_EMBEDDED_POSTGRES_MODULE to an absolute embedded-postgres dist/index.js path.');
}
const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.GP01_EMBEDDED_POSTGRES_MODULE).href);
const directory = await mkdtemp('/private/tmp/gp01-participants-postgres-');
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), user: 'postgres', password: randomUUID(),
  port: 5432, persistent: true, createPostgresUser: false, postgresFlags: ['-h', '', '-k', directory],
  onLog() {}, onError(message) { console.error(message); },
});
const clients = [];
let db;
let service;
const operator = randomUUID();
const outsider = randomUUID();
const platformOrg = randomUUID();
const users = { producer: randomUUID(), issuer: randomUUID(), investor: randomUUID() };
const roles = { producer: 'PRODUCER_ADMIN', issuer: 'ISSUER_OPERATOR', investor: 'INVESTOR' };
const types = { producer: 'PRODUCER', issuer: 'ISSUER', investor: 'INVESTMENT_FUND' };
const names = { producer: 'Producer', issuer: 'Issuer', investor: 'Investor' };
const signature = 'public.demo_reset_bind_run_participants(uuid,text,text,text,uuid,uuid,uuid,uuid)';
const migrationDirectory = new URL('../migrations/', import.meta.url);
const bindingMigration = '20260908081019_demo_run_participant_bindings.sql';
const tablePrivileges = ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
let privilegesBefore;
let legacyMembership;
let legacyRole;
let genericDefinitions;
const genericNames = ['add_membership','remove_membership','create_organization','review_role_request','assign_membership_role','revoke_membership_role','grant_system_admin_if_none','switch_active_organization'];
async function connection(role) {
  const client = pg.getPgClient('postgres', directory);
  await client.connect(); clients.push(client);
  await client.query("set statement_timeout='15s'");
  if (role) await client.query(`set role ${role}`); // Closed test-owned literals.
  return client;
}
function context(overrides = {}) {
  return { operator, environment: 'approved-demo-qa', dataset: `sql-${randomUUID()}`, database: 'examplerefabcdefghij', ...overrides };
}
async function issue(ctx, client = service, key = randomUUID()) {
  return (await client.query('select public.demo_reset_issue_run($1,$2,$3,$4,$5,$6) as receipt',
    [ctx.operator,ctx.environment,ctx.dataset,ctx.database,key,names])).rows[0].receipt;
}
async function bind(ctx, key = randomUUID(), participants = users, client = service) {
  return (await client.query('select public.demo_reset_bind_run_participants($1,$2,$3,$4,$5,$6,$7,$8) as receipt',
    [ctx.operator,ctx.environment,ctx.dataset,ctx.database,key,participants.producer,participants.issuer,participants.investor])).rows[0].receipt;
}
async function snapshot() {
  return (await db.query(`select
    (select jsonb_agg(to_jsonb(t) order by id) from auth.users t) as auth,
    (select jsonb_agg(to_jsonb(t) order by user_id) from public.profiles t) as profiles,
    (select jsonb_agg(to_jsonb(t) order by id) from public.organizations t) as orgs,
    (select jsonb_agg(to_jsonb(t) order by id) from public.memberships t) as memberships,
    (select jsonb_agg(to_jsonb(t) order by id) from public.membership_roles t) as roles,
    (select jsonb_agg(to_jsonb(t) order by id) from public.demo_personas t) as personas,
    (select jsonb_agg(to_jsonb(t) order by principal_user_id) from public.session_contexts t) as sessions,
    (select jsonb_agg(to_jsonb(t) order by id) from public.role_requests t) as requests,
    (select jsonb_agg(to_jsonb(t) order by id) from public.app_audit_events t) as audit,
    (select jsonb_agg(to_jsonb(t) order by id) from public.demo_reset_run_instances t) as runs,
    (select jsonb_agg(to_jsonb(t) order by run_id,request_id) from private.demo_run_participant_commands t) as commands
  `)).rows[0];
}
async function participation(runId) {
  return (await db.query(`select m.*, to_jsonb(mr) as role from public.memberships m
    join public.organizations o on o.id=m.organization_id join public.membership_roles mr on mr.membership_id=m.id
    where o.run_id=$1 order by m.id,mr.id`, [runId])).rows;
}
async function definitions() {
  return (await db.query(`select p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1) order by p.proname`, [genericNames])).rows;
}
async function privileges() {
  return (await db.query(`select t, privilege,has_table_privilege('service_role',t,privilege) as allowed
    from unnest(array['public.memberships','public.membership_roles']) t cross join unnest($1::text[]) privilege order by t,privilege`, [tablePrivileges])).rows;
}
async function noEffect(fn, error) {
  const baseline = await snapshot();
  await assert.rejects(fn, error);
  assert.deepEqual(await snapshot(), baseline);
}
async function waitForAdvisory(client) {
  for (let attempt=0; attempt<300; attempt++) {
    const row = (await db.query('select wait_event from pg_stat_activity where pid=$1', [client.processID])).rows[0];
    if (row?.wait_event === 'advisory') return;
    await delay(10);
  }
  assert.fail('competing connection did not wait on the context advisory lock');
}
async function syntheticRun(ctx, receipt) {
  const id = receipt?.runId ?? randomUUID();
  await db.query(`insert into public.demo_reset_run_instances(id,operator_principal_user_id,environment_name,dataset_id,database_ref,lifecycle_status,
    issuance_request_id,issuance_request,issuance_result) values($1,$2,$3,$4,$5,'CURRENT',$6,$7,$8)`,
  [id,ctx.operator,ctx.environment,ctx.dataset,ctx.database,receipt?.issuanceRequestId ?? null,receipt ? names : null,receipt]);
  return id;
}

before(async () => {
  await pg.initialise(); await pg.start(); db = await connection();
  const settings=(await db.query("select current_setting('server_version') as version,current_setting('listen_addresses') as listen,current_setting('unix_socket_directories') as socket")).rows[0];
  assert.match(settings.version,/^18\./); assert.equal(settings.listen,''); assert.equal(settings.socket,directory);
  console.log('GP binding disposable PostgreSQL:',settings);
  await db.query(`create role anon; create role authenticated; create role service_role inherit nosuperuser bypassrls;
    alter default privileges for role postgres in schema public grant all on tables to service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text);
  `);
  // Optional full-chain compatibility mode; historical default remains pinned.
  const fullFiles = process.env.MC02_FULL_SCHEMA === '1'
    ? (await readdir(migrationDirectory)).filter(f => f.endsWith('.sql')).sort() : null;
  const baselineFiles = ['20260822120000_identity.sql','20260822231500_identity_security_hardening.sql',
    '20260822233000_identity_admin_capabilities.sql','20260828010000_origination_o1.sql',
    '20260828020000_origination_o1_storage_restrict.sql','20260828030000_origination_o12_hardening.sql',
    '20260828040000_origination_o121_state_guards.sql','20260828050000_origination_create_idempotency.sql',
    '20260828120000_origination_dac_foundation.sql','20260907090000_demo_reset_run_registry.sql',
    '20260908055133_demo_reset_ownership_guards.sql','20260908070350_demo_run_issuance.sql'];
  for (const file of fullFiles ? fullFiles.filter(f => f < '20260908081019_demo_run_participant_bindings.sql') : baselineFiles) {
    await db.query(await readFile(new URL(file, migrationDirectory), 'utf8'));
  }
  // Synthetic existing reusable logins. The operation itself may never create them.
  await db.query(`insert into auth.users(id,email) select id,case when id=$2 then 'bootstrap@example.invalid' end
    from unnest($1::uuid[]) id`, [[operator,outsider,...Object.values(users)],operator]);
  await db.query("insert into public.organizations(id,slug,name,type) values($1,'operator','Operator','PLATFORM')", [platformOrg]);
  const adminMembership = (await db.query('insert into public.memberships(user_id,organization_id) values($1,$2) returning id', [operator,platformOrg])).rows[0].id;
  await db.query("insert into public.membership_roles(membership_id,role_id) values($1,'SYSTEM_ADMIN')", [adminMembership]);
  legacyMembership = (await db.query('insert into public.memberships(user_id,organization_id) values($1,$2) returning id', [outsider,platformOrg])).rows[0].id;
  legacyRole = (await db.query("insert into public.membership_roles(membership_id,role_id) values($1,'PRODUCER_ADMIN') returning id", [legacyMembership])).rows[0].id;
  privilegesBefore = await privileges(); genericDefinitions = await definitions();
  await db.query(await readFile(new URL(bindingMigration,migrationDirectory),'utf8'));
  if (fullFiles) {
    assert.equal(fullFiles.at(-1), '20260908133317_mc02_institutional_participant_root.sql');
    for (const file of fullFiles.filter(f => f > '20260908081019_demo_run_participant_bindings.sql')) {
      await db.query(await readFile(new URL(file, migrationDirectory), 'utf8'));
    }
    console.log('GP compatibility: full ordered MC-02 migration chain', fullFiles.length);
  }
  service = await connection('service_role');
  await db.query(`create function private.gp01_test_role_failure() returns trigger language plpgsql as $$
    begin if new.role_id=current_setting('gp01.fail_role',true) then raise exception 'test: late participant failure'; end if; return new; end; $$;
    create trigger gp01_test_role_failure before insert on public.membership_roles for each row execute function private.gp01_test_role_failure();`);
  // Synthetic definers exercise owner-level writes without modifying generic RPCs.
  await db.query(`
    create function private.gp01_test_membership_identity(m uuid,u uuid,o uuid,s public.membership_status)
    returns void language sql security definer set search_path='' as $$
      update public.memberships set user_id=u,organization_id=o,status=s where id=m
    $$;
    create function private.gp01_test_role_identity(r uuid,m uuid,role text,revoked timestamptz)
    returns void language sql security definer set search_path='' as $$
      update public.membership_roles set membership_id=m,role_id=role,revoked_at=revoked where id=r
    $$;
    create function private.gp01_test_identity_smuggle() returns trigger language plpgsql as $$
    begin
      if tg_table_name='memberships' then new.user_id:=current_setting('gp01.new_user')::uuid;
      else new.role_id:='INVESTOR'; end if;
      return new;
    end; $$;
  `);
}, { timeout: 60000 });
after(async () => {
  try { await Promise.all(clients.map(c=>c.end())); }
  finally {
    await pg.stop();
    await rm(directory,{recursive:true,force:true});
    console.log('GP binding cluster stopped and removed:',directory);
  }
});

test('authorized binding resolves the exact receipt roots and creates three generated memberships/fixed roles only', async () => {
  const ctx=context(); const run=await issue(ctx); const baseline=await snapshot(); const key=randomUUID();
  const receipt=await bind(ctx,key);
  assert.equal(receipt.runId,run.runId); assert.equal(receipt.requestId,key);
  for (const who of Object.keys(users)) {
    const part=receipt[who];
    assert.equal(part.userId,users[who]); assert.equal(part.organizationId,run[`${who}OrganizationId`]); assert.equal(part.roleId,roles[who]);
    const row=(await db.query(`select m.status,m.user_id,m.organization_id,mr.membership_id,mr.role_id,mr.revoked_at,mr.assigned_by
      from public.memberships m join public.membership_roles mr on mr.membership_id=m.id where m.id=$1 and mr.id=$2`, [part.membershipId,part.membershipRoleId])).rows[0];
    assert.deepEqual(row,{status:'ACTIVE',user_id:users[who],organization_id:part.organizationId,membership_id:part.membershipId,role_id:roles[who],revoked_at:null,assigned_by:operator});
  }
  const ids=[key,run.runId,...Object.values(users),...Object.keys(users).flatMap(w=>[receipt[w].organizationId,receipt[w].membershipId,receipt[w].membershipRoleId])];
  assert.equal(new Set(ids).size,ids.length);
  const after=await snapshot();
  assert.equal(after.memberships.length,baseline.memberships.length+3); assert.equal(after.roles.length,baseline.roles.length+3);
  for (const key of ['auth','profiles','orgs','personas','sessions','requests','audit','runs']) assert.deepEqual(after[key],baseline[key],key);
  assert.equal(after.commands.length,(baseline.commands?.length??0)+1);
});

test('one CURRENT context is server/DB derived; another operator/context cannot bind it', async () => {
  const ctx=context(); await issue(ctx);
  await noEffect(()=>bind({...ctx,operator:outsider}),/demo_participant_forbidden/);
  await noEffect(()=>bind({...ctx,dataset:'different'}),/demo_participant_current_run_missing/);
  await noEffect(()=>bind({...ctx,database:'differentrefabcdefgh'}),/demo_participant_current_run_missing/);
});
for (const environment of ['production','unknown',null]) test(`SQL denies ${environment} environment with zero writes`, async()=> {
  const ctx=context(); await issue(ctx);
  await noEffect(()=>bind({...ctx,environment}),/demo_participant_invalid_context/);
});

test('anonymous/authenticated including admin cannot execute the privileged binding RPC or directly insert participation', async()=> {
  const ctx=context(); const run=await issue(ctx);
  for (const role of ['anon','authenticated']) {
    const client=await connection(role); await client.query("select set_config('request.jwt.claim.sub',$1,false)",[operator]);
    assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role,signature])).rows[0].allowed,false);
    await noEffect(()=>bind(ctx,randomUUID(),users,client),{code:'42501'});
    await noEffect(()=>client.query('insert into public.memberships(user_id,organization_id) values($1,$2)',[users.producer,run.producerOrganizationId]),{code:'42501'});
  }
});

test('Supabase default service grants become SELECT-only on exactly two identity tables; command table is private', async()=> {
  assert.ok(privilegesBefore.every(p=>p.allowed));
  assert.ok((await privileges()).every(p=>p.allowed===(p.privilege==='SELECT')));
  assert.equal((await db.query("select has_table_privilege('service_role','public.organizations','INSERT') as allowed")).rows[0].allowed,true);
  const ctx=context(); const run=await issue(ctx); const receipt=await bind(ctx);
  for (const query of [
    ['insert into public.memberships(user_id,organization_id) values($1,$2)',[outsider,run.producerOrganizationId]],
    ["update public.memberships set status='INACTIVE' where id=$1",[receipt.producer.membershipId]],
    ['delete from public.memberships where id=$1',[receipt.producer.membershipId]],
    ["insert into public.membership_roles(membership_id,role_id) values($1,'TRADER')",[receipt.producer.membershipId]],
    ['update public.membership_roles set revoked_at=now() where id=$1',[receipt.producer.membershipRoleId]],
    ['delete from public.membership_roles where id=$1',[receipt.producer.membershipRoleId]],
    ['select * from private.demo_run_participant_commands',[]],
  ]) await noEffect(()=>service.query(...query),{code:'42501'});
  const fn=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  assert.equal(fn.prosecdef,true); assert.deepEqual(fn.proconfig,['search_path=""']);
});

test('generic admin RPC bodies are byte-for-byte unchanged by the additive migration', async()=> {
  assert.deepEqual(await definitions(),genericDefinitions);
});

test('missing or suspended existing profiles fail closed without identity creation', async()=> {
  const ctx=context(); await issue(ctx);
  await noEffect(()=>bind(ctx,randomUUID(),{...users,investor:randomUUID()}),/demo_participant_profile_unavailable/);
  await db.query("update public.profiles set status='SUSPENDED' where user_id=$1",[users.investor]);
  try { await noEffect(()=>bind(ctx),/demo_participant_profile_unavailable/); }
  finally { await db.query("update public.profiles set status='ACTIVE' where user_id=$1",[users.investor]); }
});

test('three distinct profiles and separate request identity are required by SQL', async()=> {
  const ctx=context(); const run=await issue(ctx);
  for (const participants of [{...users,issuer:users.producer},{...users,investor:users.issuer},{...users,producer:null}]) {
    await noEffect(()=>bind(ctx,randomUUID(),participants),/demo_participant_invalid_request/);
  }
  for (const key of [null,users.producer,run.runId,run.issuanceRequestId,run.producerOrganizationId]) await noEffect(()=>bind(ctx,key),/demo_participant_invalid_request/);
});

test('legacy CURRENT without an immutable issuance receipt is refused', async()=> {
  const ctx=context(); await syntheticRun(ctx,null);
  await noEffect(()=>bind(ctx),/demo_participant_run_mismatch/);
});
for (const mismatch of ['missing-org','wrong-type','wrong-run','wrong-run-id','wrong-request-id','duplicate-org','malformed-id']) {
  test(`receipt ${mismatch} fails closed with no repair`,async()=> {
    const source=await issue(context()); const ctx=context();
    const run={...source,runId:randomUUID(),issuanceRequestId:randomUUID()};
    if (mismatch==='missing-org') run.producerOrganizationId=randomUUID();
    if (mismatch==='wrong-type') run.producerOrganizationId=source.issuerOrganizationId;
    if (mismatch==='duplicate-org') run.investorOrganizationId=run.issuerOrganizationId;
    if (mismatch==='malformed-id') run.producerOrganizationId='not-a-uuid';
    await syntheticRun(ctx,run);
    // For exact ID mismatch, create the malformed row initially (never disable historical guards).
    if (mismatch==='wrong-run-id' || mismatch==='wrong-request-id') {
      const other=context(); const id=randomUUID();
      await db.query(`insert into public.demo_reset_run_instances(id,operator_principal_user_id,environment_name,dataset_id,database_ref,lifecycle_status,
        issuance_request_id,issuance_request,issuance_result) values($1,$2,$3,$4,$5,'CURRENT',$6,$7,$8)`,
      [id,other.operator,other.environment,other.dataset,other.database,mismatch==='wrong-request-id'?randomUUID():run.issuanceRequestId,names,
        {...run,runId:mismatch==='wrong-run-id'?run.runId:id}]);
      await noEffect(()=>bind(other),/demo_participant_run_mismatch/);
    } else await noEffect(()=>bind(ctx),/demo_participant_run_mismatch/);
  });
}

test('issued root type/status drift is refused even on same-request retries', async()=> {
  const ctx=context(); const run=await issue(ctx); const key=randomUUID(); await bind(ctx,key);
  await db.query("update public.organizations set type='TRADING_FIRM' where id=$1",[run.investorOrganizationId]);
  await noEffect(()=>bind(ctx,key),/demo_participant_run_mismatch/);
  await db.query("update public.organizations set type='INVESTMENT_FUND',status='SUSPENDED' where id=$1",[run.investorOrganizationId]);
  await noEffect(()=>bind(ctx),/demo_participant_run_mismatch/);
});

test('retry has the same receipt and zero second effect; changed payload conflicts', async()=> {
  const ctx=context(); await issue(ctx); const key=randomUUID(); const receipt=await bind(ctx,key); const baseline=await snapshot();
  assert.deepEqual(await bind(ctx,key),receipt); assert.deepEqual(await snapshot(),baseline);
  await noEffect(()=>bind(ctx,key,{...users,investor:outsider}),/demo_participant_request_conflict/);
  assert.equal((await participation(receipt.runId)).length,3);
});

test('Run A -> genuinely new Run B uses the same three profiles without moving any participation', async()=> {
  const ctx=context(); const a=await issue(ctx); const aKey=randomUUID(); const ar=await bind(ctx,aKey); const aRows=await participation(a.runId);
  const profilesBefore=(await snapshot()).profiles; const b=await issue(ctx); const br=await bind(ctx);
  assert.notEqual(a.runId,b.runId); assert.deepEqual((await snapshot()).profiles,profilesBefore);
  assert.deepEqual(await participation(a.runId),aRows); assert.equal((await participation(b.runId)).length,3);
  for (const who of Object.keys(users)) {
    assert.equal(ar[who].userId,br[who].userId); assert.notEqual(ar[who].membershipId,br[who].membershipId);
    assert.notEqual(ar[who].membershipRoleId,br[who].membershipRoleId); assert.notEqual(ar[who].organizationId,br[who].organizationId);
    assert.equal(profilesBefore.filter(p=>p.user_id===users[who]).length,1);
    const historical=aRows.find(row=>row.id===ar[who].membershipId);
    assert.equal(historical.user_id,users[who]);
    assert.equal(historical.organization_id,a[`${who}OrganizationId`]);
    assert.equal(historical.role.id,ar[who].membershipRoleId);
    assert.equal(historical.role.membership_id,ar[who].membershipId);
    assert.equal(historical.role.role_id,roles[who]);
    const other=br[who==='issuer'?'investor':'issuer'];
    await noEffect(()=>db.query('update public.memberships set user_id=$1 where id=$2',[outsider,ar[who].membershipId]),/membership identity is immutable/);
    await noEffect(()=>db.query('update public.memberships set organization_id=$1 where id=$2',[other.organizationId,ar[who].membershipId]),/membership identity is immutable/);
    await noEffect(()=>db.query('update public.membership_roles set role_id=$1 where id=$2',[who==='investor'?'PRODUCER_ADMIN':'INVESTOR',ar[who].membershipRoleId]),/membership role identity is immutable/);
    await noEffect(()=>db.query('update public.membership_roles set membership_id=$1 where id=$2',[other.membershipId,ar[who].membershipRoleId]),/membership role identity is immutable/);
  }
  assert.deepEqual(await participation(a.runId),aRows);
  await noEffect(()=>bind(ctx,aKey),/demo_participant_run_changed/);
});

test('membership organization is historical for owner and definer DML, including legacy memberships', async()=> {
  const ctx=context(); const run=await issue(ctx); const receipt=await bind(ctx);
  await noEffect(()=>db.query('update public.memberships set organization_id=$1 where id=$2',[run.issuerOrganizationId,receipt.producer.membershipId]),/membership identity is immutable/);
  await noEffect(()=>db.query('update public.memberships set organization_id=$1 where id=$2',[run.producerOrganizationId,legacyMembership]),/membership identity is immutable/);
  await db.query(`create function private.gp01_test_move_membership(m uuid,o uuid) returns void language sql security definer set search_path='' as
    $$ update public.memberships set organization_id=o where id=m $$;`);
  await noEffect(()=>db.query('select private.gp01_test_move_membership($1,$2)',[receipt.producer.membershipId,run.investorOrganizationId]),/membership identity is immutable/);
});

test('role parent is historical for owner and definer DML, including revoked/legacy roles', async()=> {
  const ctx=context(); await issue(ctx); const receipt=await bind(ctx);
  await noEffect(()=>db.query('update public.membership_roles set membership_id=$1 where id=$2',[receipt.issuer.membershipId,receipt.producer.membershipRoleId]),/membership role identity is immutable/);
  await db.query('update public.membership_roles set revoked_at=now() where id=$1',[legacyRole]);
  await noEffect(()=>db.query('update public.membership_roles set membership_id=$1 where id=$2',[receipt.issuer.membershipId,legacyRole]),/membership role identity is immutable/);
  await db.query(`create function private.gp01_test_move_role(r uuid,m uuid) returns void language sql security definer set search_path='' as
    $$ update public.membership_roles set membership_id=m where id=r $$;`);
  await noEffect(()=>db.query('select private.gp01_test_move_role($1,$2)',[receipt.producer.membershipRoleId,receipt.investor.membershipId]),/membership role identity is immutable/);
});

test('AFTER guards reject parent changes made by an earlier BEFORE trigger',async()=> {
  const ctx=context(); const run=await issue(ctx); const receipt=await bind(ctx);
  await db.query(`create function private.gp01_test_reparent() returns trigger language plpgsql as $$
    begin if tg_table_name='memberships' then new.organization_id:=current_setting('gp01.new_parent')::uuid;
    else new.membership_id:=current_setting('gp01.new_parent')::uuid; end if; return new; end; $$;
    create trigger gp01_test_reparent before update on public.memberships for each row execute function private.gp01_test_reparent();`);
  try {
    await db.query("select set_config('gp01.new_parent',$1,false)",[run.issuerOrganizationId]);
    await noEffect(()=>db.query("update public.memberships set status='INACTIVE' where id=$1",[receipt.producer.membershipId]),/membership identity is immutable/);
  } finally { await db.query('drop trigger gp01_test_reparent on public.memberships'); }
  await db.query('create trigger gp01_test_reparent before update on public.membership_roles for each row execute function private.gp01_test_reparent()');
  try {
    await db.query("select set_config('gp01.new_parent',$1,false)",[receipt.issuer.membershipId]);
    await noEffect(()=>db.query('update public.membership_roles set revoked_at=now() where id=$1',[receipt.producer.membershipRoleId]),/membership role identity is immutable/);
  } finally { await db.query('drop trigger gp01_test_reparent on public.membership_roles'); }
});

test('normal status/revocation lifecycle works; retries do not reactivate revoked participation, new commands do',async()=> {
  const ctx=context(); const run=await issue(ctx); const key=randomUUID(); const receipt=await bind(ctx,key);
  await db.query('update public.memberships set organization_id=organization_id where id=$1',[receipt.producer.membershipId]);
  await db.query('update public.membership_roles set membership_id=membership_id where id=$1',[receipt.producer.membershipRoleId]);
  for (const status of ['SUSPENDED','INVITED','INACTIVE','ACTIVE']) await db.query('update public.memberships set status=$1 where id=$2',[status,receipt.producer.membershipId]);
  const admin=await connection('authenticated'); await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[operator]);
  await admin.query('select public.remove_membership($1)',[receipt.producer.membershipId]);
  const revoked=await snapshot(); assert.deepEqual(await bind(ctx,key),receipt); assert.deepEqual(await snapshot(),revoked);
  const next=await bind(ctx); assert.equal(next.producer.membershipId,receipt.producer.membershipId);
  assert.notEqual(next.producer.membershipRoleId,receipt.producer.membershipRoleId);
  assert.equal((await participation(run.runId)).filter(r=>r.role.revoked_at===null).length,3);
  assert.equal((await db.query('select revoked_at is not null as revoked from public.membership_roles where id=$1',[receipt.producer.membershipRoleId])).rows[0].revoked,true);
});

test('late Investor role failure rolls back all participant writes, activation, receipt and preserves issuance/unrelated rows',async()=> {
  const ctx=context(); const run=await issue(ctx);
  await db.query("insert into public.memberships(user_id,organization_id,status) values($1,$2,'INACTIVE')",[users.producer,run.producerOrganizationId]);
  await service.query("set gp01.fail_role='INVESTOR'");
  try { await noEffect(()=>bind(ctx),/test: late participant failure/); }
  finally { await service.query('reset gp01.fail_role'); }
  assert.equal((await participation(run.runId)).length,0);
  const success=await bind(ctx); assert.equal((await participation(success.runId)).length,3);
});

test('failure during final command receipt insert also rolls back all six participation rows',async()=> {
  const ctx=context(); const run=await issue(ctx);
  await db.query(`create function private.gp01_test_command_failure() returns trigger language plpgsql as $$ begin raise exception 'test: receipt failure'; end; $$;
    create trigger gp01_test_command_failure before insert on private.demo_run_participant_commands for each row execute function private.gp01_test_command_failure();`);
  try { await noEffect(()=>bind(ctx),/test: receipt failure/); }
  finally { await db.query('drop trigger gp01_test_command_failure on private.demo_run_participant_commands'); }
  assert.equal((await participation(run.runId)).length,0);
});

test('command payload/result/run/key/timestamp cannot change after creation',async()=> {
  const ctx=context(); await issue(ctx); const receipt=await bind(ctx);
  for (const set of ["request='{}'::jsonb","result='{}'::jsonb","request_id=gen_random_uuid()","created_at=now()+interval '1 second'"]) {
    await noEffect(()=>db.query(`update private.demo_run_participant_commands set ${set} where run_id=$1`,[receipt.runId]),/demo participant command is immutable/);
  }
  const other=await issue(context());
  await noEffect(()=>db.query('update private.demo_run_participant_commands set run_id=$1 where run_id=$2',[other.runId,receipt.runId]),/demo participant command is immutable/);
});

test('generic admin create/add/remove/review still work without CURRENT run coupling and allow multi-org users',async()=> {
  const admin=await connection('authenticated'); await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[operator]);
  const ctx=context(); await issue(ctx); const originalRuns=(await snapshot()).runs;
  for (const who of Object.keys(users)) {
    const org=(await admin.query('select public.create_organization($1,$2) as r',[`Ordinary ${randomUUID()}`,types[who]])).rows[0].r.organization_id;
    const first=(await admin.query('select public.add_membership($1,$2,$3) as r',[outsider,org,roles[who]])).rows[0].r;
    const repeat=(await admin.query('select public.add_membership($1,$2,$3) as r',[outsider,org,roles[who]])).rows[0].r;
    assert.equal(first.membership_id,repeat.membership_id);
    assert.equal((await db.query('select run_id from public.organizations where id=$1',[org])).rows[0].run_id,null);
    await admin.query('select public.remove_membership($1)',[first.membership_id]);
    const removed=await membershipRow(first.membership_id);
    assert.equal(removed.status,'INACTIVE');
    const revoked=await assignments(first.membership_id);
    assert.equal(revoked.length,1); assert.ok(revoked[0].revoked_at);
    const reactivated=(await admin.query('select public.add_membership($1,$2,$3) as r',[outsider,org,roles[who]])).rows[0].r;
    assert.equal(reactivated.membership_id,first.membership_id);
    assert.deepEqual(await membershipRow(first.membership_id),{...removed,status:'ACTIVE'});
    const after=await assignments(first.membership_id);
    assert.deepEqual(after.find(r=>r.id===revoked[0].id),revoked[0]);
    assert.equal(after.filter(r=>r.revoked_at===null).length,1);
  }
  const requestId=(await db.query("insert into public.role_requests(user_id,intent,organization_name) values($1,'PRODUCER',$2) returning id",[outsider,`Requested ${randomUUID()}`])).rows[0].id;
  const reviewed=(await admin.query("select public.review_role_request($1,'APPROVED') as r",[requestId])).rows[0].r;
  assert.equal((await db.query('select run_id from public.organizations where id=$1',[reviewed.organization_id])).rows[0].run_id,null);
  const approved=(await db.query('select * from public.memberships where user_id=$1 and organization_id=$2',[outsider,reviewed.organization_id])).rows[0];
  assert.equal(approved.status,'ACTIVE');
  const approvedRoles=await assignments(approved.id);
  assert.equal(approvedRoles.length,1); assert.equal(approvedRoles[0].role_id,'PRODUCER_ADMIN');
  assert.equal(approvedRoles[0].revoked_at,null);
  assert.deepEqual((await snapshot()).runs,originalRuns);
});

test('catalog proves cascade ownership, NO ACTION session/persona blockers and no new participation FK blockers',async()=> {
  const fk=(await db.query(`select conrelid::regclass::text as child,confrelid::regclass::text as parent,confdeltype,confupdtype
    from pg_constraint where contype='f' and conrelid in ('public.memberships'::regclass,'public.membership_roles'::regclass,
    'public.session_contexts'::regclass,'public.demo_personas'::regclass,'private.demo_run_participant_commands'::regclass)`)).rows;
  for (const [child,parent,action] of [['memberships','organizations','c'],['membership_roles','memberships','c'],
    ['session_contexts','organizations','a'],['demo_personas','organizations','a'],['session_contexts','demo_personas','a'],
    ['private.demo_run_participant_commands','demo_reset_run_instances','r']]) {
    assert.ok(fk.some(f=>f.child===child&&f.parent===parent&&f.confdeltype===action&&f.confupdtype==='a'),`${child} -> ${parent}`);
  }
  assert.equal(fk.filter(f=>f.child==='private.demo_run_participant_commands').length,1);
});

test('synthetic organization deletion cascades participation while reusable users/profiles and historical receipt survive',async()=> {
  const ctx=context(); const run=await issue(ctx); await bind(ctx); const before=await snapshot();
  // Local FK semantics proof only. No reset function or application deletion path.
  await db.query('delete from public.organizations where run_id=$1',[run.runId]);
  assert.equal((await participation(run.runId)).length,0);
  const after=await snapshot();
  for (const key of ['auth','profiles','commands','runs']) assert.deepEqual(after[key],before[key]);
});

test('surviving session/persona organization references block deletion; binding does not write or require either',async()=> {
  const ctx=context(); const run=await issue(ctx); const receipt=await bind(ctx);
  await db.query('insert into public.session_contexts(principal_user_id,active_organization_id) values($1,$2)',[users.producer,run.producerOrganizationId]);
  await noEffect(()=>db.query('delete from public.organizations where id=$1',[run.producerOrganizationId]),{code:'23503',constraint:'session_contexts_active_organization_id_fkey'});
  await db.query("insert into public.demo_personas(id,display_name,group_key,organization_id,role_id,status) values($1,'Synthetic','agro',$2,'ISSUER_OPERATOR','INACTIVE')",[randomUUID(),run.issuerOrganizationId]);
  await noEffect(()=>db.query('delete from public.organizations where id=$1',[run.issuerOrganizationId]),{code:'23503',constraint:'demo_personas_organization_id_fkey'});
  assert.equal((await participation(receipt.runId)).length,3);
});

test('real existing organization switching selects Run B membership without rewriting Run A',async()=> {
  const ctx=context(); const a=await issue(ctx); await bind(ctx); const aRows=await participation(a.runId);
  const b=await issue(ctx); await bind(ctx);
  const user=await connection('authenticated'); await user.query("select set_config('request.jwt.claim.sub',$1,false)",[users.producer]);
  await user.query('select public.switch_active_organization($1)',[b.producerOrganizationId]);
  assert.equal((await db.query('select active_organization_id from public.session_contexts where principal_user_id=$1',[users.producer])).rows[0].active_organization_id,b.producerOrganizationId);
  assert.deepEqual(await participation(a.runId),aRows);
  const own=(await user.query('select user_id from public.memberships')).rows;
  assert.ok(own.length>1&&own.every(m=>m.user_id===users.producer));
});

test('concurrent same-key binding serializes and produces one receipt/effect',async()=> {
  const ctx=context(); const run=await issue(ctx); const key=randomUUID();
  const first=await connection('service_role'); const second=await connection('service_role');
  await first.query('begin');
  try {
    const a=await bind(ctx,key,users,first);
    const pending=bind(ctx,key,users,second); const outcome=pending.then(value=>({value}),error=>({error}));
    await waitForAdvisory(second); await first.query('commit');
    const result=await outcome; assert.ifError(result.error); assert.deepEqual(result.value,a);
    assert.equal((await participation(run.runId)).length,3);
    assert.equal((await db.query('select count(*)::int as n from private.demo_run_participant_commands where run_id=$1',[run.runId])).rows[0].n,1);
  } finally { await first.query('rollback'); }
});

test('concurrent changed payload under one key conflicts after waiting without partial writes',async()=> {
  const ctx=context(); const run=await issue(ctx); const key=randomUUID();
  const first=await connection('service_role'); const second=await connection('service_role'); await first.query('begin');
  try {
    await bind(ctx,key,users,first);
    const outcome=bind(ctx,key,{...users,investor:outsider},second).then(value=>({value}),error=>({error}));
    await waitForAdvisory(second); await first.query('commit');
    assert.equal((await outcome).error?.message,'demo_participant_request_conflict'); assert.equal((await participation(run.runId)).length,3);
  } finally { await first.query('rollback'); }
});

test('issuance waits for binding commit; subsequent retry cannot retarget the newly CURRENT run',async()=> {
  const ctx=context(); const a=await issue(ctx); const key=randomUUID();
  const first=await connection('service_role'); const second=await connection('service_role'); await first.query('begin');
  try {
    await bind(ctx,key,users,first);
    const outcome=issue(ctx,second).then(value=>({value}),error=>({error}));
    await waitForAdvisory(second); await first.query('commit');
    const result=await outcome; assert.ifError(result.error);
    assert.equal((await participation(a.runId)).length,3); assert.equal((await participation(result.value.runId)).length,0);
    await noEffect(()=>bind(ctx,key),/demo_participant_run_changed/);
  } finally { await first.query('rollback'); }
});

test('binding waits for issuance and resolves the committed CURRENT receipt, never an earlier lookup',async()=> {
  const ctx=context(); const a=await issue(ctx);
  const first=await connection('service_role'); const second=await connection('service_role'); await first.query('begin');
  try {
    const b=await issue(ctx,first); const outcome=bind(ctx,randomUUID(),users,second).then(value=>({value}),error=>({error}));
    await waitForAdvisory(second); await first.query('commit');
    const result=await outcome; assert.ifError(result.error); assert.equal(result.value.runId,b.runId);
    assert.equal((await participation(a.runId)).length,0); assert.equal((await participation(b.runId)).length,3);
  } finally { await first.query('rollback'); }
});

async function membershipRow(id) {
  return (await db.query('select * from public.memberships where id=$1',[id])).rows[0];
}
async function roleRow(id) {
  return (await db.query('select * from public.membership_roles where id=$1',[id])).rows[0];
}
async function assignments(membershipId) {
  return (await db.query('select * from public.membership_roles where membership_id=$1 order by id',[membershipId])).rows;
}
async function mutateMembership(mode,row,changes={}) {
  const next={...row,...changes};
  const query=mode==='owner'
    ? 'update public.memberships set user_id=$2,organization_id=$3,status=$4 where id=$1'
    : 'select private.gp01_test_membership_identity($1,$2,$3,$4)';
  return db.query(query,[row.id,next.user_id,next.organization_id,next.status]);
}
async function mutateRole(mode,row,changes={}) {
  const next={...row,...changes};
  const query=mode==='owner'
    ? 'update public.membership_roles set membership_id=$2,role_id=$3,revoked_at=$4 where id=$1'
    : 'select private.gp01_test_role_identity($1,$2,$3,$4)';
  return db.query(query,[row.id,next.membership_id,next.role_id,next.revoked_at]);
}
async function identityFixture(kind) {
  const ctx=context(); const run=await issue(ctx); const receipt=await bind(ctx);
  const membershipId=kind==='legacy'?legacyMembership:receipt.producer.membershipId;
  const roleId=kind==='legacy'?legacyRole:receipt.producer.membershipRoleId;
  if (kind==='revoked') await db.query('update public.membership_roles set revoked_at=now() where id=$1',[roleId]);
  return {run,receipt,membership:await membershipRow(membershipId),role:await roleRow(roleId)};
}

for (const kind of ['legacy','bound']) for (const mode of ['owner','definer']) {
  test(`complete membership identity: ${kind} row through ${mode} permits lifecycle only`,async()=> {
    const {run,membership}=await identityFixture(kind);
    // Q exists and has no membership in this org, so uniqueness/FKs cannot mask a missing identity guard.
    const differentUser=membership.user_id===outsider?users.investor:outsider;
    await noEffect(()=>mutateMembership(mode,membership,{user_id:differentUser}),/membership identity is immutable/);
    await noEffect(()=>mutateMembership(mode,membership,{organization_id:run.issuerOrganizationId}),/membership identity is immutable/);
    await mutateMembership(mode,membership);
    assert.deepEqual(await membershipRow(membership.id),membership);
    for (const status of ['SUSPENDED','INVITED','INACTIVE','ACTIVE']) {
      await mutateMembership(mode,membership,{status});
      assert.deepEqual(await membershipRow(membership.id),{...membership,status});
    }
  });
}

for (const kind of ['legacy','active','revoked']) for (const mode of ['owner','definer']) {
  test(`complete role identity: ${kind} row through ${mode} permits revocation only`,async()=> {
    const {receipt,role}=await identityFixture(kind);
    assert.equal(role.role_id,'PRODUCER_ADMIN');
    await noEffect(()=>mutateRole(mode,role,{role_id:'INVESTOR'}),/membership role identity is immutable/);
    await noEffect(()=>mutateRole(mode,role,{membership_id:receipt.issuer.membershipId}),/membership role identity is immutable/);
    await mutateRole(mode,role);
    assert.deepEqual(await roleRow(role.id),role);
    const revokedAt=new Date('2026-09-08T12:00:00.000Z');
    await mutateRole(mode,role,{revoked_at:revokedAt});
    assert.deepEqual(await roleRow(role.id),{...role,revoked_at:revokedAt});
  });
}

for (const kind of ['legacy','bound']) test(`BEFORE trigger cannot smuggle a different human into ${kind} membership`,async()=> {
  const {membership}=await identityFixture(kind);
  await db.query("select set_config('gp01.new_user',$1,false)",[membership.user_id===outsider?users.investor:outsider]);
  await db.query('create trigger gp01_test_identity_smuggle before update on public.memberships for each row execute function private.gp01_test_identity_smuggle()');
  try {
    await noEffect(()=>db.query("update public.memberships set status='INACTIVE' where id=$1",[membership.id]),/membership identity is immutable/);
  } finally { await db.query('drop trigger gp01_test_identity_smuggle on public.memberships'); }
});

for (const kind of ['legacy','active','revoked']) test(`BEFORE trigger cannot smuggle a different role into ${kind} assignment`,async()=> {
  const {role}=await identityFixture(kind);
  await db.query('create trigger gp01_test_identity_smuggle before update on public.membership_roles for each row execute function private.gp01_test_identity_smuggle()');
  try {
    await noEffect(()=>db.query('update public.membership_roles set revoked_at=now() where id=$1',[role.id]),/membership role identity is immutable/);
  } finally { await db.query('drop trigger gp01_test_identity_smuggle on public.membership_roles'); }
});

test('assign_membership_role revokes an active assignment and INSERTs a new row without rewriting either identity',async()=> {
  const ctx=context(); await issue(ctx); const receipt=await bind(ctx);
  const id=receipt.producer.membershipId; const original=await roleRow(receipt.producer.membershipRoleId);
  const admin=await connection('authenticated'); await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[operator]);
  await admin.query("select public.assign_membership_role($1,'PRODUCER_ADMIN')",[id]);
  const after=await assignments(id); assert.equal(after.length,2);
  const revoked=after.find(r=>r.id===original.id); assert.ok(revoked.revoked_at);
  assert.deepEqual(revoked,{...original,revoked_at:revoked.revoked_at});
  const active=after.find(r=>r.revoked_at===null); assert.notEqual(active.id,original.id);
  assert.equal(active.membership_id,id); assert.equal(active.role_id,'PRODUCER_ADMIN'); assert.equal(active.assigned_by,operator);
  // A different role uses the supported revoke/create pattern, never UPDATE role_id.
  await admin.query("select public.revoke_membership_role($1,'PRODUCER_ADMIN')",[id]);
  const history=await assignments(id);
  await admin.query("select public.assign_membership_role($1,'INVESTOR')",[id]);
  const changed=await assignments(id); assert.equal(changed.length,3);
  for (const old of history) assert.deepEqual(changed.find(r=>r.id===old.id),old);
  const newRole=changed.find(r=>r.revoked_at===null); assert.equal(newRole.role_id,'INVESTOR');
  assert.equal(newRole.membership_id,id); assert.ok(!history.some(r=>r.id===newRole.id));
});

test('revoke_membership_role changes only revocation and permits a new active assignment afterward',async()=> {
  const ctx=context(); await issue(ctx); const receipt=await bind(ctx);
  const old=await roleRow(receipt.issuer.membershipRoleId);
  const admin=await connection('authenticated'); await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[operator]);
  await admin.query("select public.revoke_membership_role($1,'ISSUER_OPERATOR')",[old.membership_id]);
  const revoked=await roleRow(old.id); assert.ok(revoked.revoked_at);
  assert.deepEqual(revoked,{...old,revoked_at:revoked.revoked_at});
  await admin.query("select public.assign_membership_role($1,'ISSUER_OPERATOR')",[old.membership_id]);
  assert.deepEqual(await roleRow(old.id),revoked);
  const rows=await assignments(old.membership_id); assert.equal(rows.length,2);
  assert.equal(rows.filter(r=>r.revoked_at===null).length,1);
  assert.ok(rows.every(r=>r.membership_id===old.membership_id&&r.role_id===old.role_id));
});

test('system-admin bootstrap retains same-user/org upsert and creates a new role without repurposing history',async()=> {
  // Isolate the first-admin precondition and hardcoded platform fixture in this
  // disposable transaction. Roll back all probe changes, preserving the test operator.
  await db.query('begin');
  try {
    await db.query("update public.membership_roles set revoked_at=now() where role_id='SYSTEM_ADMIN' and revoked_at is null");
    const bootstrapOrg='11111111-1111-4111-8111-111111111001';
    await db.query("insert into public.organizations(id,slug,name,type) values($1,'bootstrap-test','Bootstrap','PLATFORM')",[bootstrapOrg]);
    const member=(await db.query("insert into public.memberships(user_id,organization_id,status) values($1,$2,'INACTIVE') returning *",[operator,bootstrapOrg])).rows[0];
    const result=(await db.query("select public.grant_system_admin_if_none('bootstrap@example.invalid') as r")).rows[0].r;
    assert.equal(result.user_id,operator);
    assert.deepEqual(await membershipRow(member.id),{...member,status:'ACTIVE'});
    const roles=await assignments(member.id); assert.equal(roles.length,1);
    assert.equal(roles[0].role_id,'SYSTEM_ADMIN'); assert.equal(roles[0].revoked_at,null);
    await db.query('update public.membership_roles set revoked_at=now() where id=$1',[roles[0].id]);
    const historical=await roleRow(roles[0].id);
    await db.query("update public.memberships set status='INACTIVE' where id=$1",[member.id]);
    await db.query("select public.grant_system_admin_if_none('bootstrap@example.invalid')");
    assert.deepEqual(await membershipRow(member.id),{...member,status:'ACTIVE'});
    assert.deepEqual(await roleRow(historical.id),historical);
    const after=await assignments(member.id); assert.equal(after.length,2);
    assert.equal(after.filter(r=>r.revoked_at===null).length,1);
    assert.ok(after.every(r=>r.membership_id===member.id&&r.role_id==='SYSTEM_ADMIN'));
  } finally { await db.query('rollback'); }
});

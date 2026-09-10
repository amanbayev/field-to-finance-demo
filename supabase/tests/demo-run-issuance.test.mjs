// Actual PostgreSQL, disposable local cluster, Unix socket only. No database URL,
// Supabase configuration, shared credentials, migrations CLI, or remote connection.
// Optional tooling is installed OUTSIDE the repository; see GP01_RUN_ISSUANCE.md.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

if (!process.env.GP01_EMBEDDED_POSTGRES_MODULE?.startsWith("/")) {
  throw new Error("Set GP01_EMBEDDED_POSTGRES_MODULE to an absolute embedded-postgres dist/index.js path.");
}
const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.GP01_EMBEDDED_POSTGRES_MODULE).href);
const directory = await mkdtemp("/private/tmp/gp01-issuance-postgres-");
const pg = new EmbeddedPostgres({
  databaseDir: join(directory, "data"), user: "postgres", password: randomUUID(),
  port: 5432, persistent: true, createPostgresUser: false,
  postgresFlags: ["-h", "", "-k", directory],
  onLog() {}, onError(message) { console.error(message); },
});
const clients = [];
let db;
const operator = randomUUID();
const outsider = randomUUID();
const platformOrg = randomUUID();
const names = { producer: "Same Producer", issuer: "Same Issuer", investor: "Same Investor" };
const historical = [];
const legacyContext = context();
const legacyGuardContext = context();
let legacyRunId;
let legacyGuardRunId;
let registryPrivilegesBefore;
let organizationPrivilegesBefore;
const tablePrivileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"];
const migrationDirectory = new URL("../migrations/", import.meta.url);
const signature = "public.demo_reset_issue_run(uuid,text,text,text,uuid,jsonb)";

async function connection(role) {
  const client = pg.getPgClient("postgres", directory);
  await client.connect();
  clients.push(client);
  await client.query("set statement_timeout='15s'");
  if (role) await client.query(`set role ${role}`); // Test-owned closed literals only.
  return client;
}
function context(overrides = {}) {
  return { operator, environment: "approved-demo-qa", dataset: `sql-${randomUUID()}`,
    database: "examplerefabcdefghij", ...overrides };
}
async function issue(client, ctx, requestId = randomUUID(), organizationNames = names) {
  const result = await client.query("select public.demo_reset_issue_run($1,$2,$3,$4,$5,$6) as receipt",
    [ctx.operator, ctx.environment, ctx.dataset, ctx.database, requestId, organizationNames]);
  return result.rows[0].receipt;
}
async function runs(ctx) {
  return (await db.query(`select id, lifecycle_status from public.demo_reset_run_instances
    where operator_principal_user_id = $1 and environment_name = $2 and dataset_id = $3 and database_ref = $4
    order by id`, [ctx.operator, ctx.environment, ctx.dataset, ctx.database])).rows;
}
async function organizations(runId) {
  return (await db.query("select id, type, run_id from public.organizations where run_id = $1 order by type", [runId])).rows;
}
async function totals() {
  return (await db.query(`select (select count(*)::int from public.demo_reset_run_instances) as runs,
    (select count(*)::int from public.organizations) as orgs`)).rows[0];
}
async function runRow(id) {
  return (await db.query("select * from public.demo_reset_run_instances where id=$1", [id])).rows[0];
}
async function serviceTablePrivileges(table) {
  return (await db.query(`select privilege, has_table_privilege('service_role',$1,privilege) as allowed
    from unnest($2::text[]) with ordinality as p(privilege,position) order by position`, [table, tablePrivileges])).rows;
}
async function assertImmutableRun(id, legacy = false) {
  const baseline = await runRow(id);
  const mutations = [
    ["id=gen_random_uuid()"], ["operator_principal_user_id=$2", [outsider]],
    ["environment_name='changed-environment'"], ["dataset_id='changed-dataset'"],
    ["database_ref='changed-database'"], ["created_at=created_at + interval '1 second'"],
    ["issuance_request_id=gen_random_uuid()"], ["issuance_request='{}'::jsonb"], ["issuance_result='{}'::jsonb"],
  ];
  for (const [set, values = []] of mutations) {
    // A lone receipt assignment on a legacy row fails the all-or-none CHECK.
    // The complete, otherwise-valid upgrade below must fail the UPDATE guard.
    // Issued IDs hit the existing organization FK before the AFTER guard;
    // the unreferenced legacy ID proves that the guard also freezes ID itself.
    const expected = legacy && set.startsWith("issuance_")
      ? { code: "23514", constraint: "demo_reset_run_issuance_receipt_check" }
      : !legacy && set.startsWith("id=")
        ? { code: "23503", constraint: "organizations_run_id_fkey" }
      : { code: "P0001", message: "demo_run_issuance_receipt_immutable" };
    await assert.rejects(db.query(`update public.demo_reset_run_instances set ${set} where id=$1`, [id, ...values]), expected);
    assert.deepEqual(await runRow(id), baseline, set);
  }
  await assert.rejects(db.query(`update public.demo_reset_run_instances set
    issuance_request_id=gen_random_uuid(), issuance_request=$2, issuance_result=$3 where id=$1`,
  [id, names, { issuanceRequestId: randomUUID(), runId: id, producerOrganizationId: randomUUID(),
    issuerOrganizationId: randomUUID(), investorOrganizationId: randomUUID() }]),
  { code: "P0001", message: "demo_run_issuance_receipt_immutable" });
  assert.deepEqual(await runRow(id), baseline);
}
async function current(ctx, id) {
  assert.deepEqual((await runs(ctx)).filter((row) => row.lifecycle_status === "CURRENT"), [{ id, lifecycle_status: "CURRENT" }]);
}
async function waitForAdvisory(client) {
  const pid = client.processID;
  for (let attempt = 0; attempt < 300; attempt++) {
    const result = await db.query("select wait_event from pg_stat_activity where pid = $1", [pid]);
    if (result.rows[0]?.wait_event === "advisory") return;
    await delay(10);
  }
  assert.fail("competing connection did not wait on the transaction advisory lock");
}

before(async () => {
  await pg.initialise();
  await pg.start();
  db = await connection();
  const settings=(await db.query("select current_setting('server_version') as version,current_setting('listen_addresses') as listen,current_setting('unix_socket_directories') as socket")).rows[0];
  assert.match(settings.version,/^18\./); assert.equal(settings.listen,''); assert.equal(settings.socket,directory);
  console.log('GP issuance disposable PostgreSQL:',settings);
  await db.query(`
    create role anon; create role authenticated; create role service_role inherit nosuperuser bypassrls;
    -- Match the deployed Supabase public-table defaults observed in pg_default_acl
    -- (postgres owner), not a bare synthetic role with no privileges to revoke.
    alter default privileges for role postgres in schema public grant all on tables to service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key, bucket_id text);
  `);
  // Optional full-chain compatibility mode; historical default remains pinned.
  const fullBoundary = process.env.MC03_FULL_SCHEMA === '1'
    ? '20260910045213_mc03_immutable_protocol_version_reference.sql'
    : '20260908133317_mc02_institutional_participant_root.sql';
  const fullFiles = process.env.MC02_FULL_SCHEMA === '1' || process.env.MC03_FULL_SCHEMA === '1'
    ? (await readdir(migrationDirectory)).filter(f => f.endsWith('.sql') && f <= fullBoundary).sort() : null;
  const baselineFiles = [
    "20260822120000_identity.sql", "20260822231500_identity_security_hardening.sql",
    "20260822233000_identity_admin_capabilities.sql", "20260828010000_origination_o1.sql",
    "20260828020000_origination_o1_storage_restrict.sql", "20260828030000_origination_o12_hardening.sql",
    "20260828040000_origination_o121_state_guards.sql", "20260828050000_origination_create_idempotency.sql",
    "20260828120000_origination_dac_foundation.sql", "20260907090000_demo_reset_run_registry.sql",
    "20260908055133_demo_reset_ownership_guards.sql",
  ];
  for (const file of fullFiles ? fullFiles.filter(f => f < '20260908070350_demo_run_issuance.sql') : baselineFiles) {
    await db.query(await readFile(new URL(file, migrationDirectory), 'utf8'));
  }
  await db.query("insert into auth.users (id) values ($1), ($2)", [operator, outsider]);
  await db.query("insert into public.organizations(id, slug, name, type) values ($1, 'operator', 'Operator', 'PLATFORM')", [platformOrg]);
  const membership = (await db.query("insert into public.memberships(user_id, organization_id) values ($1,$2) returning id", [operator, platformOrg])).rows[0].id;
  await db.query("insert into public.membership_roles(membership_id,role_id) values ($1, 'SYSTEM_ADMIN')", [membership]);
  for (const [key, type] of [["producer", "PRODUCER"], ["issuer", "ISSUER"], ["investor", "INVESTMENT_FUND"]]) {
    historical.push((await db.query("insert into public.organizations(slug,name,type) values ($1,$2,$3) returning id", [key, names[key], type])).rows[0].id);
  }
  legacyRunId = (await db.query(`insert into public.demo_reset_run_instances
    (operator_principal_user_id, environment_name, dataset_id, database_ref, lifecycle_status)
    values ($1,$2,$3,$4,'CURRENT') returning id`,
  [operator, legacyContext.environment, legacyContext.dataset, legacyContext.database])).rows[0].id;
  legacyGuardRunId = (await db.query(`insert into public.demo_reset_run_instances
    (operator_principal_user_id, environment_name, dataset_id, database_ref, lifecycle_status)
    values ($1,$2,$3,$4,'CURRENT') returning id`,
  [operator, legacyGuardContext.environment, legacyGuardContext.dataset, legacyGuardContext.database])).rows[0].id;
  registryPrivilegesBefore = await serviceTablePrivileges("public.demo_reset_run_instances");
  organizationPrivilegesBefore = await serviceTablePrivileges("public.organizations");
  await db.query(await readFile(new URL("20260908070350_demo_run_issuance.sql", migrationDirectory), "utf8"));
  if (fullFiles) {
    assert.equal(fullFiles.at(-1), fullBoundary);
    for (const file of fullFiles.filter(f => f > '20260908070350_demo_run_issuance.sql')) {
      await db.query(await readFile(new URL(file, migrationDirectory), 'utf8'));
    }
    console.log('GP compatibility: full ordered migration chain', fullFiles.length, fullBoundary);
  }
  // Synthetic probe/failure trigger, ONLY in this disposable cluster. It observes
  // the INSERT-time row, not the result of a later stamping UPDATE.
  await db.query(`
    create table public.gp01_test_insert_observations (organization_id uuid, run_id uuid, type public.organization_type);
    create function private.gp01_test_insert_probe() returns trigger language plpgsql as $$
    begin
      if new.slug like 'gp-%' then
        if new.run_id is null then raise exception 'test: unstamped insert'; end if;
        insert into public.gp01_test_insert_observations values (new.id, new.run_id, new.type);
        if new.type::text = current_setting('gp01.fail_org', true) then raise exception 'test: organization failure'; end if;
      end if;
      return new;
    end; $$;
    create trigger gp01_test_insert_probe before insert on public.organizations
      for each row execute function private.gp01_test_insert_probe();
  `);
}, { timeout: 60000 });
after(async () => {
  try { await Promise.all(clients.map((client) => client.end())); }
  finally {
    await pg.stop();
    await rm(directory,{recursive:true,force:true});
    console.log('GP issuance cluster stopped and removed:',directory);
  }
});

test("DB-issued opaque run and three distinct, fresh roots are stamped at INSERT; NULL history and operator stay untouched", async () => {
  const ctx = context();
  const requestId = randomUUID();
  const baseline = await totals();
  const client = await connection("service_role");
  const receipt = await issue(client, ctx, requestId);
  assert.match(receipt.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set([requestId, operator, ...Object.values(receipt).filter((id) => id !== requestId)]).size, 6);
  assert.deepEqual(await totals(), { runs: baseline.runs + 1, orgs: baseline.orgs + 3 });
  await current(ctx, receipt.runId);
  assert.deepEqual(await organizations(receipt.runId), [
    { id: receipt.producerOrganizationId, type: "PRODUCER", run_id: receipt.runId },
    { id: receipt.issuerOrganizationId, type: "ISSUER", run_id: receipt.runId },
    { id: receipt.investorOrganizationId, type: "INVESTMENT_FUND", run_id: receipt.runId },
  ]);
  assert.equal((await db.query("select count(*)::int as n from public.gp01_test_insert_observations where run_id=$1", [receipt.runId])).rows[0].n, 3);
  assert.equal((await db.query("select count(*)::int as n from public.organizations where id=any($1::uuid[]) and run_id is null", [[platformOrg, ...historical]])).rows[0].n, 4);
});

test("Run A -> Run B supersedes only A; A organizations cannot be relabelled or cleared", async () => {
  const ctx = context();
  const a = await issue(db, ctx);
  const aOrganizations = await organizations(a.runId);
  const b = await issue(db, ctx);
  assert.notEqual(a.runId, b.runId);
  await current(ctx, b.runId);
  assert.equal((await runs(ctx)).find((r) => r.id === a.runId).lifecycle_status, "SUPERSEDED");
  assert.deepEqual(await organizations(a.runId), aOrganizations);
  assert.equal((await organizations(b.runId)).length, 3);
  for (const next of [b.runId, null]) {
    await assert.rejects(db.query("update public.organizations set run_id=$1 where id=$2", [next, a.producerOrganizationId]), /organization run ownership is write-once/);
  }
});

test("retry returns exactly the original receipt, including after supersession; changed payload conflicts", async () => {
  const ctx = context();
  const requestId = randomUUID();
  const a = await issue(db, ctx, requestId);
  const afterA = await totals();
  assert.deepEqual(await issue(db, ctx, requestId, { ...names, producer: " Same\n Producer " }), a);
  assert.deepEqual(await totals(), afterA);
  await current(ctx, a.runId);
  const b = await issue(db, ctx);
  const afterB = await totals();
  assert.deepEqual(await issue(db, ctx, requestId), a);
  await current(ctx, b.runId);
  await assert.rejects(issue(db, ctx, requestId, { ...names, producer: "Different" }), /demo_run_request_conflict/);
  assert.deepEqual(await totals(), afterB);
});

test("the request key is scoped by all trusted context fields", async () => {
  const key = randomUUID();
  const ctx = context();
  const a = await issue(db, ctx, key);
  const otherOperator = randomUUID();
  await db.query("insert into auth.users(id) values ($1)", [otherOperator]);
  const membership = (await db.query("insert into public.memberships(user_id,organization_id) values ($1,$2) returning id", [otherOperator, platformOrg])).rows[0].id;
  await db.query("insert into public.membership_roles(membership_id,role_id) values ($1,'SYSTEM_ADMIN')", [membership]);
  for (const variation of [context(), { ...ctx, operator: otherOperator }, { ...ctx, environment: "local-development" }, { ...ctx, database: "differentrefabcdefgh" }]) {
    const b = await issue(db, variation, key);
    assert.notEqual(b.runId, a.runId);
    await current(variation, b.runId);
  }
  await current(ctx, a.runId);
});

test("additive migration preserves legacy registry rows; issuance can supersede a legacy CURRENT without claiming old orgs", async () => {
  const legacy = await runRow(legacyRunId);
  assert.equal(legacy.issuance_request_id, null);
  assert.equal(legacy.issuance_request, null);
  assert.equal(legacy.issuance_result, null);
  const baseline = await totals();
  const client = await connection("service_role");
  const requestId = randomUUID();
  await client.query("set gp01.fail_org='INVESTMENT_FUND'");
  await assert.rejects(issue(client, legacyContext, requestId), /test: organization failure/);
  assert.deepEqual(await runRow(legacyRunId), legacy);
  assert.deepEqual(await totals(), baseline);
  await client.query("reset gp01.fail_org");
  const issued = await issue(client, legacyContext, requestId);
  await current(legacyContext, issued.runId);
  assert.deepEqual(await runRow(legacyRunId), { ...legacy, lifecycle_status: "SUPERSEDED" });
  assert.notEqual(issued.runId, legacyRunId);
  assert.deepEqual((await runRow(issued.runId)).issuance_result, issued);
  assert.deepEqual(await totals(), { runs: baseline.runs + 1, orgs: baseline.orgs + 3 });
  assert.equal((await organizations(issued.runId)).length, 3);
  assert.equal((await db.query("select count(*)::int as n from public.organizations where id=any($1::uuid[]) and run_id is null", [historical])).rows[0].n, 3);
});

test("pre-migration legacy identity and NULL receipt stay immutable; lifecycle is monotonic without a competing CURRENT", async () => {
  const legacy = await runRow(legacyGuardRunId);
  assert.equal(legacy.lifecycle_status, "CURRENT");
  await assertImmutableRun(legacyGuardRunId, true);
  await db.query("update public.demo_reset_run_instances set lifecycle_status='CURRENT' where id=$1", [legacyGuardRunId]);
  assert.deepEqual(await runRow(legacyGuardRunId), legacy);
  await db.query("update public.demo_reset_run_instances set lifecycle_status='SUPERSEDED' where id=$1", [legacyGuardRunId]);
  await db.query("update public.demo_reset_run_instances set lifecycle_status='SUPERSEDED' where id=$1", [legacyGuardRunId]);
  assert.deepEqual(await runRow(legacyGuardRunId), { ...legacy, lifecycle_status: "SUPERSEDED" });
  await assertImmutableRun(legacyGuardRunId, true);
  assert.deepEqual(await runs(legacyGuardContext), [{ id: legacyGuardRunId, lifecycle_status: "SUPERSEDED" }]);
  await assert.rejects(db.query("update public.demo_reset_run_instances set lifecycle_status='CURRENT' where id=$1", [legacyGuardRunId]),
    { code: "P0001", message: "demo_run_issuance_receipt_immutable" });
  assert.deepEqual(await runRow(legacyGuardRunId), { ...legacy, lifecycle_status: "SUPERSEDED" });
});

test("failed first issuance leaves no current run or partial roots", async () => {
  const ctx = context();
  const baseline = await totals();
  const client = await connection("service_role");
  await client.query("set gp01.fail_org='INVESTMENT_FUND'");
  await assert.rejects(issue(client, ctx), /test: organization failure/);
  assert.deepEqual(await totals(), baseline);
  assert.deepEqual(await runs(ctx), []);
});

test("organization failure rolls back supersession, new run, all roots and probe rows", async () => {
  const ctx = context();
  const a = await issue(db, ctx);
  const beforeFailure = await totals();
  const probeCount = (await db.query("select count(*)::int as n from public.gp01_test_insert_observations")).rows[0].n;
  const client = await connection("service_role");
  await client.query("set gp01.fail_org='INVESTMENT_FUND'");
  const key = randomUUID();
  await assert.rejects(issue(client, ctx, key), /test: organization failure/);
  assert.deepEqual(await totals(), beforeFailure);
  assert.equal((await db.query("select count(*)::int as n from public.gp01_test_insert_observations")).rows[0].n, probeCount);
  await current(ctx, a.runId);
  await client.query("reset gp01.fail_org");
  const b = await issue(client, ctx, key);
  await current(ctx, b.runId);
});

test("uncommitted issuance is invisible from another connection; rollback restores the previous CURRENT", async () => {
  const ctx = context();
  const a = await issue(db, ctx);
  const baseline = await totals();
  const client = await connection("service_role");
  await client.query("begin");
  const b = await issue(client, ctx);
  await current(ctx, a.runId);
  assert.deepEqual(await organizations(b.runId), []);
  assert.deepEqual(await totals(), baseline);
  await client.query("rollback");
  assert.deepEqual(await totals(), baseline);
  await current(ctx, a.runId);
});

test("simultaneous different requests serialize across connections, including a context with no current row", async () => {
  const ctx = context();
  const first = await connection("service_role");
  const second = await connection("service_role");
  await first.query("begin");
  const a = await issue(first, ctx);
  const pending = issue(second, ctx);
  try {
    await waitForAdvisory(second);
    assert.deepEqual(await runs(ctx), []);
  } finally { await first.query("commit"); }
  const b = await pending;
  await current(ctx, b.runId);
  assert.equal((await runs(ctx)).length, 2);
  assert.equal((await runs(ctx)).find((r) => r.id === a.runId).lifecycle_status, "SUPERSEDED");
  assert.equal((await organizations(a.runId)).length, 3);
  assert.equal((await organizations(b.runId)).length, 3);
});

test("simultaneous same-key retries issue one run and one organization set", async () => {
  const ctx = context();
  const key = randomUUID();
  const baseline = await totals();
  const first = await connection("service_role");
  const second = await connection("service_role");
  await first.query("begin");
  const a = await issue(first, ctx, key);
  const pending = issue(second, ctx, key);
  try { await waitForAdvisory(second); } finally { await first.query("commit"); }
  assert.deepEqual(await pending, a);
  assert.deepEqual(await totals(), { runs: baseline.runs + 1, orgs: baseline.orgs + 3 });
  await current(ctx, a.runId);
});

test("a failed waiting competitor cannot corrupt the successfully committed run", async () => {
  const ctx = context();
  const first = await connection("service_role");
  const second = await connection("service_role");
  await first.query("begin");
  const a = await issue(first, ctx);
  await second.query("set gp01.fail_org='INVESTMENT_FUND'");
  const pending = assert.rejects(issue(second, ctx), /test: organization failure/);
  try { await waitForAdvisory(second); } finally { await first.query("commit"); }
  await pending;
  await current(ctx, a.runId);
  assert.equal((await runs(ctx)).length, 1);
  assert.equal((await organizations(a.runId)).length, 3);
});

test("a stale REPEATABLE READ snapshot aborts safely instead of committing a second CURRENT", async () => {
  const ctx = context();
  const first = await connection("service_role");
  const second = await connection("service_role");
  await first.query("begin");
  const a = await issue(first, ctx);
  await second.query("begin isolation level repeatable read");
  const pending = assert.rejects(issue(second, ctx), { code: "23505" });
  try { await waitForAdvisory(second); } finally { await first.query("commit"); }
  await pending;
  await second.query("rollback");
  await current(ctx, a.runId);
  assert.equal((await runs(ctx)).length, 1);
  assert.equal((await organizations(a.runId)).length, 3);
});

test("unique indexes are final invariants even for DML that bypasses the issuance lock", async () => {
  const ctx = context();
  const key = randomUUID();
  const a = await issue(db, ctx, key);
  await assert.rejects(db.query(`insert into public.demo_reset_run_instances
    (operator_principal_user_id,environment_name,dataset_id,database_ref,lifecycle_status)
    values ($1,$2,$3,$4,'CURRENT')`, [ctx.operator, ctx.environment, ctx.dataset, ctx.database]), { code: "23505", constraint: "demo_reset_run_instances_one_current_uidx" });
  await assert.rejects(db.query(`insert into public.demo_reset_run_instances
    (operator_principal_user_id,environment_name,dataset_id,database_ref,lifecycle_status,issuance_request_id,issuance_request,issuance_result)
    values ($1,$2,$3,$4,'SUPERSEDED',$5,$6,$7)`, [ctx.operator, ctx.environment, ctx.dataset, ctx.database, key, names, a]), { code: "23505", constraint: "demo_reset_run_issuance_request_uidx" });
  await current(ctx, a.runId);
});

test("anon and authenticated, even a real system-admin session, cannot execute issuance", async () => {
  const baseline = await totals();
  for (const role of ["anon", "authenticated"]) {
    const client = await connection(role);
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [operator]);
    await assert.rejects(issue(client, context()), { code: "42501" });
    assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, signature])).rows[0].allowed, false);
  }
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed", [signature])).rows[0].allowed, true);
  assert.deepEqual(await totals(), baseline);
});

test("Supabase-default direct registry privileges are revoked only on this table; service_role can still issue through its definer RPC", async () => {
  assert.deepEqual(registryPrivilegesBefore, tablePrivileges.map((privilege) => ({ privilege, allowed: true })));
  assert.deepEqual(await serviceTablePrivileges("public.demo_reset_run_instances"),
    tablePrivileges.map((privilege) => ({ privilege, allowed: false })));
  assert.deepEqual(await serviceTablePrivileges("public.organizations"), organizationPrivilegesBefore);
  const role = (await db.query("select rolsuper,rolinherit,rolbypassrls from pg_roles where rolname='service_role'")).rows[0];
  assert.deepEqual(role, { rolsuper: false, rolinherit: true, rolbypassrls: true });
  assert.equal((await db.query("select count(*)::int as n from pg_auth_members where member='service_role'::regrole")).rows[0].n, 0);
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed", [signature])).rows[0].allowed, true);
  const proc = (await db.query(`select p.prosecdef, p.proowner=c.relowner as runs_as_table_owner
    from pg_proc p cross join pg_class c where p.oid=$1::regprocedure and c.oid='public.demo_reset_run_instances'::regclass`, [signature])).rows[0];
  assert.deepEqual(proc, { prosecdef: true, runs_as_table_owner: true });
  const client = await connection("service_role");
  const baseline = await totals();
  const legacy = await runRow(legacyRunId);
  await assert.rejects(client.query(`insert into public.demo_reset_run_instances
    (operator_principal_user_id,environment_name,dataset_id,database_ref,lifecycle_status)
    values ($1,'approved-demo-qa',$2,'examplerefabcdefghij','CURRENT')`, [operator, randomUUID()]), { code: "42501" });
  await assert.rejects(client.query("update public.demo_reset_run_instances set lifecycle_status='SUPERSEDED' where id=$1", [legacyRunId]), { code: "42501" });
  await assert.rejects(client.query("delete from public.demo_reset_run_instances where id=$1", [legacyRunId]), { code: "42501" });
  assert.deepEqual(await totals(), baseline);
  assert.deepEqual(await runRow(legacyRunId), legacy);
  const ctx = context();
  const receipt = await issue(client, ctx);
  await current(ctx, receipt.runId);
  assert.deepEqual(await totals(), { runs: baseline.runs + 1, orgs: baseline.orgs + 3 });
});

test("registry access restriction preserves the service count RPC and authenticated own-admin reads", async () => {
  const service = await connection("service_role");
  const ctx = context();
  const receipt = await issue(service, ctx);
  const count = (await service.query("select public.demo_reset_count_rows('demo_reset_run_instances','ENVIRONMENT',null) as n")).rows[0].n;
  assert.equal(Number(count), (await totals()).runs);
  const session = await connection("authenticated");
  await session.query("select set_config('request.jwt.claim.sub',$1,false)", [operator]);
  assert.deepEqual((await session.query("select id from public.demo_reset_run_instances where id=$1", [receipt.runId])).rows, [{ id: receipt.runId }]);
  await session.query("select set_config('request.jwt.claim.sub',$1,false)", [outsider]);
  assert.deepEqual((await session.query("select id from public.demo_reset_run_instances where id=$1", [receipt.runId])).rows, []);
});

test("SQL rejects unauthorized principals, production, unknown or incomplete context before writes", async () => {
  const baseline = await totals();
  const client = await connection("service_role");
  for (const overrides of [{ operator: outsider }, { operator: null }, { environment: "production" },
    { environment: "unknown" }, { environment: null }, { dataset: "" }, { dataset: null },
    { database: "unknown" }, { database: null }]) {
    await assert.rejects(issue(client, context(overrides)), /demo_run_(forbidden|invalid_context)/);
  }
  await assert.rejects(issue(client, context(), null), /demo_run_invalid_context/);
  assert.deepEqual(await totals(), baseline);
});

test("SQL names validation rejects unknown fields, blanks, controls, wrong types and oversized names", async () => {
  const baseline = await totals();
  for (const invalid of [null, [], {}, { ...names, runId: randomUUID() }, { ...names, producer: null },
    { ...names, issuer: 12 }, { ...names, producer: " \n " }, { ...names, issuer: "a".repeat(121) },
    { ...names, investor: "a\u0001b" }]) {
    await assert.rejects(issue(db, context(), randomUUID(), invalid), /demo_run_invalid_names/);
  }
  assert.deepEqual(await totals(), baseline);
});

test("issuance RPC has no run-id input, fixed search path and no generic identity workflow changes", async () => {
  const proc = (await db.query(`select proargnames, prosecdef, provolatile, proconfig from pg_proc where oid=$1::regprocedure`, [signature])).rows[0];
  assert.deepEqual(proc.proargnames, ["p_operator_principal_user_id", "p_environment_name", "p_dataset_id", "p_database_ref", "p_request_id", "p_organization_names"]);
  assert.equal(proc.prosecdef, true);
  assert.equal(proc.provolatile, "v");
  assert.deepEqual(proc.proconfig, ['search_path=""']);
  const baseline = await totals();
  const client = await connection("authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [operator]);
  const generic = (await client.query("select public.create_organization('Generic org','ISSUER') as result")).rows[0].result;
  assert.equal((await db.query("select run_id from public.organizations where id=$1", [generic.organization_id])).rows[0].run_id, null);
  const requestId = (await db.query("insert into public.role_requests(user_id,intent,organization_name) values ($1,'PRODUCER',$2) returning id", [outsider, names.producer])).rows[0].id;
  const reviewed = (await client.query("select public.review_role_request($1,'APPROVED') as result", [requestId])).rows[0].result;
  assert.equal(reviewed.organization_id, historical[0]);
  assert.equal((await db.query("select run_id from public.organizations where id=$1", [reviewed.organization_id])).rows[0].run_id, null);
  assert.deepEqual(await totals(), { runs: baseline.runs, orgs: baseline.orgs + 1 });
});

test("issuance creates no personas, profiles, memberships, roles, sessions, application audit or Auth/Storage rows", async () => {
  const tables = ["public.profiles", "public.memberships", "public.membership_roles", "public.demo_personas",
    "public.session_contexts", "public.role_requests", "public.app_audit_events", "auth.users", "storage.objects", "storage.buckets"];
  const counts = async () => {
    const values = [];
    for (const table of tables) values.push((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n);
    return values;
  };
  const baseline = await counts();
  await issue(db, context());
  assert.deepEqual(await counts(), baseline);
});

test("issued receipt/context cannot change and a superseded issued run cannot be resurrected", async () => {
  const ctx = context();
  const a = await issue(db, ctx);
  const original = await runRow(a.runId);
  await assertImmutableRun(a.runId);
  await db.query("update public.demo_reset_run_instances set lifecycle_status='CURRENT' where id=$1", [a.runId]);
  assert.deepEqual(await runRow(a.runId), original);
  const b = await issue(db, ctx);
  await assertImmutableRun(a.runId);
  await db.query("update public.demo_reset_run_instances set lifecycle_status='SUPERSEDED' where id=$1", [a.runId]);
  assert.deepEqual(await runRow(a.runId), { ...original, lifecycle_status: "SUPERSEDED" });
  await db.query("begin");
  try {
    // Remove the unique-index obstacle inside a rolled-back test transaction,
    // proving the receipt guard itself prevents historical resurrection.
    await db.query("update public.demo_reset_run_instances set lifecycle_status='SUPERSEDED' where dataset_id=$1", [ctx.dataset]);
    await assert.rejects(db.query("update public.demo_reset_run_instances set lifecycle_status='CURRENT' where id=$1", [a.runId]),
      { code: "P0001", message: "demo_run_issuance_receipt_immutable" });
  } finally { await db.query("rollback"); }
  assert.deepEqual(await issue(db, ctx, a.issuanceRequestId), a);
  await current(ctx, b.runId);
  assert.deepEqual(await runRow(a.runId), { ...original, lifecycle_status: "SUPERSEDED" });
});

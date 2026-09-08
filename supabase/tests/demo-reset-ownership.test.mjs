// Offline PostgreSQL semantics, using the actual repository migrations.
// PGlite is supplied externally; no project dependency or database URL is used.
// See docs/GP01_OWNERSHIP_REVIEW.md for the reproducible command and limitations.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";

if (!process.env.GP01_PGLITE_MODULE?.startsWith("/")) {
  throw new Error("Set GP01_PGLITE_MODULE to an absolute PGlite dist/index.js path.");
}
const { PGlite } = await import(pathToFileURL(process.env.GP01_PGLITE_MODULE).href);
const db = new PGlite(); // In memory only. Cannot connect to Supabase.
const migrations = new URL("../migrations/", import.meta.url);
const ownershipMigration = "20260908055133_demo_reset_ownership_guards.sql";
const runA = randomUUID();
const runB = randomUUID();
const actor = randomUUID();
const historicalOrg = randomUUID();
const fixtures = [];

// Every edge is checked against PostgreSQL's actual FK catalog below.
const edges = [
  ["organizations", "run_id", "demo_reset_run_instances", "id", false],
  ["memberships", "organization_id", "organizations", "id", true],
  ["membership_roles", "membership_id", "memberships", "id", true],
  ["demo_personas", "organization_id", "organizations", "id", true],
  ["producer_fields", "organization_id", "organizations", "id", true],
  ...[
    "field_submissions", "field_documents", "field_upload_intents",
    "field_verification_cases", "field_cadastre_verifications",
    "field_verification_evidence", "field_verification_messages",
    "verified_field_snapshots", "origination_dacs",
  ].map((table) => [table, "field_id", "producer_fields", "id", true]),
  ["origination_dac_messages", "dac_id", "origination_dacs", "id", true],
];

async function insert(table, row) {
  const keys = Object.keys(row);
  const result = await db.query(
    `insert into public.${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
    Object.values(row),
  );
  return result.rows[0];
}

async function count(table, scope, run = null) {
  const result = await db.query(
    "select public.demo_reset_count_rows($1, $2, $3) as n", [table, scope, run],
  );
  return Number(result.rows[0].n);
}

async function rejected(sql, params, message) {
  await assert.rejects(db.query(sql, params), (error) => {
    assert.equal(error.code, "P0001");
    assert.equal(error.message, message);
    return true;
  });
}

async function fixture(label, run) {
  const org = randomUUID();
  const field = randomUUID();
  const submission = randomUUID();
  const vcase = randomUUID();
  const snapshot = randomUUID();
  const dac = randomUUID();
  const membership = randomUUID();
  await insert("organizations", { id: org, slug: label, name: label, type: "PRODUCER", run_id: run });
  await insert("memberships", { id: membership, organization_id: org, user_id: actor });
  await insert("membership_roles", { membership_id: membership, role_id: "PRODUCER_ADMIN" });
  await insert("demo_personas", {
    id: label, display_name: label, group_key: "test", organization_id: org, role_id: "PRODUCER_ADMIN",
  });
  await insert("producer_fields", {
    id: field, public_id: label, organization_id: org, name: label, season: 2027,
    crop: "wheat", cadastre_number: label, created_by_user_id: actor, created_by_role: "PRODUCER_ADMIN",
  });
  await insert("field_submissions", {
    id: submission, public_id: label, field_id: field, organization_id: org,
    version: 1, declared_data: {}, submitted_by_user_id: actor,
    submitted_by_role: "PRODUCER_ADMIN", submitted_at: "2026-09-08T00:00:00Z",
  });
  const doc = await insert("field_documents", {
    field_id: field, submission_id: submission, document_type: "LAND_OWNERSHIP",
    bucket: "field-documents", object_path: label, original_filename: "test.pdf",
    mime_type: "application/pdf", size_bytes: 1, sha256: "test-only", version: 1,
    uploaded_by_user_id: actor,
  });
  await insert("field_upload_intents", {
    organization_id: org, field_id: field, document_id: randomUUID(),
    document_type: "CADASTRE_EXTRACT", object_path: `${label}-intent`, original_filename: "test.pdf",
    mime_type: "application/pdf", expected_size_bytes: 1, version: 1,
    created_by_user_id: actor, expires_at: "2026-09-09T00:00:00Z",
  });
  await insert("field_verification_cases", {
    id: vcase, public_id: label, field_id: field, organization_id: org, current_submission_id: submission,
  });
  await insert("field_cadastre_verifications", {
    case_id: vcase, field_id: field, cadastre_number: label, right_holder: label,
    right_type: "test", validity_status: "test", checked_by_user_id: actor, checked_by_role: "SCAS_OPERATOR",
  });
  await insert("field_verification_evidence", {
    case_id: vcase, field_id: field, kind: "REVIEWER_NOTE", uploaded_by_user_id: actor,
  });
  const message = await insert("field_verification_messages", {
    case_id: vcase, field_id: field, sender_user_id: actor, sender_role: "SCAS_OPERATOR", body: label,
  });
  await insert("verified_field_snapshots", {
    id: snapshot, field_id: field, case_id: vcase, submission_id: submission,
    payload: { evidence: label }, approved_by_user_id: actor, approved_by_role: "SCAS_OPERATOR",
  });
  await insert("origination_dacs", {
    id: dac, public_id: label, field_id: field, verified_snapshot_id: snapshot,
    scas_case_id: vcase, producer_organization_id: org, crop: "wheat", harvest_year: 2027,
    cadastre_number: label, land_right_holder: label, land_right_type: "test", current_terms_hash: label,
    created_by_user_id: actor, updated_by_user_id: actor,
  });
  const dacMessage = await insert("origination_dac_messages", {
    dac_id: dac, sender_user_id: actor, sender_role: "PRODUCER_ADMIN", body: label,
  });
  return { org, field, submission, vcase, snapshot, dac, doc: doc.id, message: message.id, dacMessage: dacMessage.id };
}

before(async () => {
  // Minimal stand-ins for Supabase-owned schemas, never application tables.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (id uuid primary key, bucket_id text);
  `);
  for (const file of [
    "20260822120000_identity.sql",
    "20260822231500_identity_security_hardening.sql",
    "20260822233000_identity_admin_capabilities.sql",
    "20260828010000_origination_o1.sql",
    "20260828020000_origination_o1_storage_restrict.sql",
    "20260828030000_origination_o12_hardening.sql",
    "20260828040000_origination_o121_state_guards.sql",
    "20260828050000_origination_create_idempotency.sql",
    "20260828120000_origination_dac_foundation.sql",
    "20260907090000_demo_reset_run_registry.sql",
  ]) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  await db.query("insert into auth.users (id, email) values ($1, 'offline@example.invalid')", [actor]);
  // Rows and immutable descendants exist BEFORE the new migration.
  for (const [id, status] of [[runA, "SUPERSEDED"], [runB, "CURRENT"]]) {
    await insert("demo_reset_run_instances", {
      id, operator_principal_user_id: actor, environment_name: "offline-test",
      dataset_id: "test", database_ref: "memory-only", lifecycle_status: status,
    });
  }
  fixtures.push(await fixture("run-a", runA), await fixture("run-b", runB), await fixture("non-run", null));
  await insert("organizations", { id: historicalOrg, slug: "historical", name: "historical", type: "PRODUCER" });
  await db.exec(await readFile(new URL(ownershipMigration, migrations), "utf8"));
  // Supabase service_role normally has DML privileges. These grants exist ONLY in this memory database.
  await db.exec(`
    grant usage on schema public to service_role;
    grant select, insert, update on all tables in schema public to service_role;
    grant usage on all sequences in schema public to service_role;
  `);
}, { timeout: 30000 });
after(async () => { await db.close(); });

test("migration leaves pre-existing NULL organizations valid and unassigned", async () => {
  const result = await db.query("select run_id from public.organizations where id = $1", [historicalOrg]);
  assert.equal(result.rows[0].run_id, null);
  await db.query("update public.organizations set name = 'still historical', run_id = null where id = $1", [historicalOrg]);
});

test("NULL to Run A and Run A to itself work; subsequent reassignment/clearing fail", async () => {
  await db.query("update public.organizations set run_id = $1 where id = $2", [runA, historicalOrg]);
  await db.query("update public.organizations set run_id = $1, name = 'assigned' where id = $2", [runA, historicalOrg]);
  for (const next of [runB, null]) {
    await rejected("update public.organizations set run_id = $1 where id = $2", [next, historicalOrg], "organization run ownership is write-once");
  }
  const result = await db.query("select run_id, name from public.organizations where id = $1", [historicalOrg]);
  assert.deepEqual(result.rows[0], { run_id: runA, name: "assigned" });
});

test("direct INSERT, same-parent data/lifecycle UPDATE and idempotent create RPC still work", async () => {
  const field = randomUUID();
  await insert("producer_fields", {
    id: field, public_id: "post-guard", organization_id: fixtures[0].org,
    name: "test", season: 2027, crop: "wheat", cadastre_number: "test",
    created_by_user_id: actor, created_by_role: "PRODUCER_ADMIN",
  });
  const result = await db.query(
    "update public.producer_fields set organization_id = $1, name = 'edited', status = 'SUBMITTED' where id = $2 returning organization_id, name, status",
    [fixtures[0].org, field],
  );
  assert.deepEqual(result.rows[0], { organization_id: fixtures[0].org, name: "edited", status: "SUBMITTED" });
  await rejected("update public.producer_fields set organization_id = $1 where id = $2", [fixtures[1].org, field], "field organization is immutable");
  const payload = { field: {
    id: randomUUID(), organization_id: fixtures[0].org, client_create_request_id: randomUUID(),
    name: "RPC test", season: 2027, crop: "wheat", cadastre_number: "test",
    created_by_user_id: actor, created_by_role: "PRODUCER_ADMIN",
  } };
  const first = await db.query("select public.origination_create_field($1) as result", [payload]);
  const repeat = await db.query("select public.origination_create_field($1) as result", [payload]);
  assert.equal(first.rows[0].result.created, true);
  assert.equal(repeat.rows[0].result.created, false);
  assert.equal(repeat.rows[0].result.field.organization_id, fixtures[0].org);
  assert.equal(first.rows[0].result.field.id, repeat.rows[0].result.field.id);
});

test("owner and RLS-bypassing service_role cannot move existing immutable descendants", async () => {
  const a = fixtures[0];
  const b = fixtures[1];
  for (const role of [null, "service_role"]) {
    if (role) await db.exec("set role service_role");
    try {
      for (const next of [runB, null]) {
        await rejected("update public.organizations set run_id = $1 where id = $2", [next, a.org], "organization run ownership is write-once");
      }
      for (const next of [b.org, fixtures[2].org]) {
        await rejected("update public.producer_fields set organization_id = $1 where id = $2", [next, a.field], "field organization is immutable");
      }
      // NOT NULL fires before an AFTER guard and must still reject clearing.
      await assert.rejects(db.query("update public.producer_fields set organization_id = null where id = $1", [a.field]), { code: "23502" });
      await rejected("update public.origination_dacs set field_id = $1 where id = $2", [b.field, a.dac], "DAC field is immutable");
      await db.query("update public.origination_dacs set field_id = $1, scas_notes = 'normal draft update' where id = $2", [a.field, a.dac]);
      for (const table of ["field_submissions", "field_verification_messages", "verified_field_snapshots", "origination_dac_messages"]) {
        assert.equal(await count(table, "RUN", runA), 1, `${role ?? "owner"}: ${table} stays in A`);
        assert.equal(await count(table, "RUN", runB), 1, `${role ?? "owner"}: ${table} does not move to B`);
      }
    } finally {
      await db.exec("reset role");
    }
  }
});

test("SECURITY DEFINER does not bypass any ownership guard", async () => {
  // Synthetic privileged caller exists only in this disposable test database.
  await db.exec(`
    create function public.gp01_test_reassign(kind text, target uuid, parent uuid)
    returns void language plpgsql security definer set search_path = public as $$
    begin
      case kind
        when 'organization' then update public.organizations set run_id = parent where id = target;
        when 'field' then update public.producer_fields set organization_id = parent where id = target;
        when 'dac' then update public.origination_dacs set field_id = parent where id = target;
      end case;
    end;
    $$;
    revoke all on function public.gp01_test_reassign(text, uuid, uuid) from public;
    grant execute on function public.gp01_test_reassign(text, uuid, uuid) to service_role;
    set role service_role;
  `);
  try {
    for (const [kind, target, parent, message] of [
      ["organization", fixtures[0].org, runB, "organization run ownership is write-once"],
      ["field", fixtures[0].field, fixtures[1].org, "field organization is immutable"],
      ["dac", fixtures[0].dac, fixtures[1].field, "DAC field is immutable"],
    ]) {
      await rejected("select public.gp01_test_reassign($1, $2, $3)", [kind, target, parent], message);
    }
  } finally {
    await db.exec("reset role");
  }
});

test("existing immutable descendants still reject direct UPDATE", async () => {
  for (const [table, column, id, parent] of [
    ["field_submissions", "field_id", fixtures[0].submission, fixtures[1].field],
    ["field_verification_messages", "field_id", fixtures[0].message, fixtures[1].field],
    ["verified_field_snapshots", "field_id", fixtures[0].snapshot, fixtures[1].field],
    ["origination_dac_messages", "dac_id", fixtures[0].dacMessage, fixtures[1].dac],
  ]) {
    await rejected(`update public.${table} set ${column} = $1 where id = $2`, [parent, id], "origination record is immutable");
  }
});

test("a mixed-row reassignment rolls back allowed writes as well as forbidden ones", async () => {
  await rejected(
    "update public.organizations set run_id = $1 where id in ($2, $3)",
    [runB, fixtures[2].org, fixtures[0].org], "organization run ownership is write-once",
  );
  const result = await db.query("select run_id from public.organizations where id = $1", [fixtures[2].org]);
  assert.equal(result.rows[0].run_id, null);
});

test("a BEFORE trigger cannot smuggle a reassignment through an unrelated column update", async () => {
  await db.exec("begin");
  try {
    await db.exec(`
      create function public.gp01_test_before_update() returns trigger language plpgsql as $$
      begin
        new.organization_id := new.declared_snapshot->>'test_reparent';
        return new;
      end;
      $$;
      create trigger gp01_test_before_update before update on public.producer_fields
        for each row execute function public.gp01_test_before_update();
    `);
    await rejected(
      "update public.producer_fields set declared_snapshot = $1 where id = $2",
      [{ test_reparent: fixtures[1].org }, fixtures[0].field], "field organization is immutable",
    );
  } finally {
    await db.exec("rollback");
  }
});

test("every counted ownership edge is a real, validated FK with the documented nullability", async () => {
  for (const [table, column, parent, parentColumn, required] of edges) {
    const result = await db.query(`
      select a.attnotnull, c.convalidated, c.confupdtype
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute p on p.attrelid = c.confrelid and p.attnum = c.confkey[1]
      where c.contype = 'f' and c.conrelid = $1::regclass and c.confrelid = $2::regclass
        and a.attname = $3 and p.attname = $4
        and array_length(c.conkey, 1) = 1 and array_length(c.confkey, 1) = 1
    `, [`public.${table}`, `public.${parent}`, column, parentColumn]);
    assert.deepEqual(result.rows, [{ attnotnull: required, convalidated: true, confupdtype: "a" }], `${table}.${column}`);
  }
});

test("all actual SQL inventory paths isolate A, B and non-run rows without losing rows", async () => {
  for (const table of edges.map(([table]) => table)) {
    const a = await count(table, "RUN", runA);
    const b = await count(table, "RUN", runB);
    const nonRun = await count(table, "NON_RUN");
    const all = await count(table, "ENVIRONMENT");
    assert.equal(a, table === "organizations" ? 2 : table === "producer_fields" ? 3 : 1, table);
    assert.equal(b, 1, table);
    assert.equal(nonRun, 1, table);
    assert.equal(a + b + nonRun, all, `${table}: partition is exhaustive and disjoint`);
  }
  await assert.rejects(db.query("select public.demo_reset_count_rows('profiles', 'RUN', $1)", [runA]), /object_not_countable/);
  assert.equal(await count("profiles", "NON_RUN"), 1);
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_DATASET_V2_RESET_MANIFEST } from "@/lib/demo-reset/manifest";

const dir = "supabase/migrations";
const migrations = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort()
  .map((file) => readFileSync(join(dir, file), "utf8").replace(/--[^\n]*/g, " "));
const schema = migrations.join("\n");
const countSql = readFileSync(join(dir, "20260907090000_demo_reset_run_registry.sql"), "utf8");

// These are historical identity paths, not convenience joins through duplicated
// organization columns or textual object ids. PostgreSQL execution is separately
// covered in supabase/tests/demo-reset-ownership.test.mjs.
const paths: Record<string, readonly string[]> = {
  organizations: ["organizations"],
  memberships: ["memberships", "organizations"],
  membership_roles: ["membership_roles", "memberships", "organizations"],
  producer_fields: ["producer_fields", "organizations"],
  ...Object.fromEntries([
    "field_submissions", "field_documents", "field_upload_intents",
    "field_verification_cases", "field_cadastre_verifications",
    "field_verification_evidence", "field_verification_messages",
    "verified_field_snapshots", "origination_dacs",
  ].map((table) => [table, [table, "producer_fields", "organizations"]])),
  origination_dac_messages: ["origination_dac_messages", "origination_dacs", "producer_fields", "organizations"],
};

describe("RUN_OWNED inventory paths", () => {
  it("covers exactly the manifest's RUN_OWNED objects", () => {
    const objects = DEMO_DATASET_V2_RESET_MANIFEST.categories
      .filter((category) => category.scopeBasis === "RUN_OWNED")
      .flatMap((category) => [...category.objects]);
    expect(objects.sort()).toEqual(Object.keys(paths).sort());
  });

  it.each(Object.entries(paths))("%s counts follow real required FK edges to the nullable run root", (table, path) => {
    const arm = countSql.split(`when '${table}' then`)[1]?.split(/\n\s*when |\n\s*else/)[0];
    expect(arm).toBeDefined();
    const relations = [...arm.matchAll(/(?:from|inner join) public\.(\w+) (\w+)/g)];
    expect(relations.map((match) => match[1])).toEqual(path);
    for (let index = 0; index < path.length - 1; index++) {
      const child = path[index];
      const parent = path[index + 1];
      const column = parent === "organizations" ? "organization_id"
        : parent === "memberships" ? "membership_id"
          : parent === "origination_dacs" ? "dac_id" : "field_id";
      const definition = schema.match(new RegExp(`create table (?:if not exists )?public\\.${child} \\(([\\s\\S]*?)\\n\\);`))?.[1];
      expect(definition, child).toMatch(new RegExp(`\\b${column} uuid not null (?:unique )?references public\\.${parent} \\(id\\)`));
      expect(arm).toContain(`on ${relations[index + 1][2]}.id = ${relations[index][2]}.${column}`);
    }
    expect(arm).toContain("private.demo_reset_matches_run_scope(p_scope, p_run_id, o.run_id)");
    expect(schema).toContain("add column run_id uuid references public.demo_reset_run_instances (id)");
  });

  it("the correction adds only trigger enforcement, without row mutations or new privileged APIs", () => {
    const sql = readFileSync(join(dir, "20260908055133_demo_reset_ownership_guards.sql"), "utf8")
      .replace(/--[^\n]*/g, " ").replace(/'[^']*'/g, "''");
    expect(sql).not.toMatch(/\b(?:insert into|update public\.|delete from|truncate|drop table|security definer)\b/i);
    expect(sql).not.toMatch(/\b(?:grant|disable trigger|enable row level security|disable row level security)\b/i);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_RESET_COUNTABLE_OBJECTS } from "@/data/demo-reset/postgres-row-count-source";

const MIGRATION = "supabase/migrations/20260907090000_demo_reset_run_registry.sql";
const DATA_DIR = "src/data/demo-reset";

function executableSource(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""');
}

describe("demo reset run registry migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("creates the registry and a nullable organisations.run_id only", () => {
    expect(sql).toContain("create table public.demo_reset_run_instances");
    expect(sql).toContain(
      "add column run_id uuid references public.demo_reset_run_instances",
    );
    expect(sql).toContain("demo_reset_run_instances_one_current_uidx");
    expect(sql).toContain("where lifecycle_status = 'CURRENT'");
    expect(sql).not.toMatch(
      /create unique index[\s\S]*order by created_at/i,
    );
    expect(sql).not.toMatch(
      /from public\.demo_reset_run_instances[\s\S]*limit 1/i,
    );
  });

  it("does not backfill, drop, truncate or delete", () => {
    const executable = sql
      .replace(/--[^\n]*/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(executable).not.toMatch(/\bdrop table\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bdelete from\b/i);
    expect(executable).not.toMatch(/\bupdate public\./i);
    expect(sql).not.toContain("insert into public.organizations");
    expect(sql).not.toContain("insert into public.demo_reset_run_instances");
  });

  it("keeps the count RPC read-only and allowlisted", () => {
    expect(sql).toContain("create or replace function public.demo_reset_count_rows");
    expect(sql).toContain("language plpgsql");
    expect(sql).toContain("stable");
    expect(sql).toContain(
      "grant execute on function public.demo_reset_count_rows",
    );
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
    for (const object of DEMO_RESET_COUNTABLE_OBJECTS) {
      expect(sql, object).toContain(`when '${object}' then`);
    }
    expect(sql).not.toContain("when 'market_core_orders' then");
    expect(sql).not.toContain("when 'field_origination_events' then");
    expect(sql).not.toContain("when 'role_requests' then");
    expect(sql).not.toMatch(/execute\s+'/i);
    expect(sql).not.toMatch(/format\s*\(\s*'select/i);
  });
});

describe("demo reset data modules stay non-destructive", () => {
  it("contains no mutation verb in executable source", () => {
    const files = readdirSync(DATA_DIR)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => join(DATA_DIR, file));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = executableSource(file);
      for (const token of [
        "truncate",
        "\\bdelete\\b",
        "\\bdrop\\b",
        "\\binsert\\b",
        "\\bupsert\\b",
        "\\.update\\(\\s*\\{",
        "removeUser",
        "deleteUser",
      ]) {
        expect(new RegExp(token, "i").test(source), `${token} in ${file}`).toBe(
          false,
        );
      }
    }
  });
});

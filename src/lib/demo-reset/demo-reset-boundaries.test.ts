import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LIB_DIR = "src/lib/demo-reset";
const SERVICE = "src/services/demo-reset-service.ts";

/**
 * Comments and string literals legitimately discuss deletion, so the scan
 * runs against executable source only.
 */
function executableSource(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, '""');
}


function libSources(): string[] {
  return readdirSync(LIB_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => join(LIB_DIR, file));
}

/**
 * Mutation verbs that would indicate a real clearing path.
 *
 * A bare `update` is not on this list because `createHash().update()` is a
 * hash write; the mutation shape `.update({ … })` is matched instead.
 */
const MUTATION_TOKENS = [
  "truncate",
  "\\bdelete\\b",
  "\\bdrop\\b",
  "\\binsert\\b",
  "\\bupsert\\b",
  "\\.update\\(\\s*\\{",
  "\\.remove\\(",
  "removeUser",
  "deleteUser",
  "signOut",
];


const CLIENT_FACTORIES = [
  "createServiceRoleClient",
  "createServerSupabaseClient",
  "createBrowserSupabaseClient",
  "createClient",
  "@supabase/supabase-js",
  "@supabase/ssr",
];


describe("demo reset has no executing deletion path", () => {
  it("ships the expected pure modules", () => {
    expect(
      libSources()
        .map((file) => file.replace(`${LIB_DIR}/`, ""))
        .sort(),
    ).toEqual([
      "environment.ts",
      "index.ts",
      "inventory.ts",
      "legacy-fixture-fallback.ts",
      "manifest.ts",
      "plan.ts",
      "policy.ts",
    ]);
    expect(existsSync(SERVICE)).toBe(true);
  });

  it("contains no mutation verb in executable source", () => {
    for (const file of [...libSources(), SERVICE]) {
      const source = executableSource(file);
      for (const token of MUTATION_TOKENS) {
        expect(
          new RegExp(token, "i").test(source),
          `${token} appears in ${file}`,
        ).toBe(false);
      }
    }
  });

  it("constructs no database, Auth or Storage client", () => {
    for (const file of [...libSources(), SERVICE]) {
      const source = readFileSync(file, "utf8");
      for (const factory of CLIENT_FACTORIES) {
        expect(source, `${factory} in ${file}`).not.toContain(factory);
      }
      expect(source, `storage access in ${file}`).not.toContain(".storage");
      expect(source, `rpc call in ${file}`).not.toContain(".rpc(");
      expect(source, `network call in ${file}`).not.toContain("fetch(");
    }
  });

  it("keeps the pure modules free of any asynchronous boundary", () => {
    for (const file of libSources()) {
      const source = executableSource(file);
      expect(source, `async in ${file}`).not.toMatch(/\basync\b/);
      expect(source, `await in ${file}`).not.toMatch(/\bawait\b/);
    }
  });

  it("exposes no server action, route handler or page", () => {
    for (const file of [...libSources(), SERVICE]) {
      const source = readFileSync(file, "utf8");
      expect(source, `use server in ${file}`).not.toContain('"use server"');
      expect(source, `use client in ${file}`).not.toContain('"use client"');
    }
    const appEntries = readdirSync("src/app", { recursive: true }) as string[];
    const resetRoutes = appEntries.filter((entry) =>
      entry.replace(/\\/g, "/").includes("demo-reset"),
    );
    expect(resetRoutes).toEqual([]);
  });

  it("keeps the service as the only reader of process.env for reset policy", () => {
    for (const file of libSources()) {
      expect(executableSource(file), `process.env in ${file}`).not.toContain(
        "process.env",
      );
    }
    expect(readFileSync(SERVICE, "utf8")).toContain(
      "process.env.DEMO_RESET_ENVIRONMENT",
    );
  });

  it("checks both the effective persona and the real principal server-side", () => {
    const source = readFileSync(SERVICE, "utf8");
    expect(source).toContain("actorCan(actor, DEMO_RESET_PERMISSION)");
    expect(source).toContain("principalCan(actor, DEMO_RESET_PERMISSION)");
    expect(source).toContain("isDesignPreviewActor(actor)");
  });

  it("defaults the production inventory to unavailable rather than empty", () => {
    expect(readFileSync(SERVICE, "utf8")).toContain(
      'unavailableDemoResetInventory("RUN_SCOPED_INVENTORY_SOURCE_ABSENT")',
    );
  });
});

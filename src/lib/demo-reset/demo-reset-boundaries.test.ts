/**
 * Source-level guard for the demo-reset modules.
 *
 * This is a *supporting* check on the shipped source, not proof that the
 * modules have no side effect. It cannot see through dynamic dispatch or a
 * dependency's behaviour. The behavioural guarantees live in the policy,
 * inventory and planner tests; this file only makes an accidental deletion or
 * client construction hard to introduce unnoticed.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LIB_DIR = "src/lib/demo-reset";
const SERVICE = "src/services/demo-reset-service.ts";

/**
 * Observing an environment is an I/O boundary, so the inventory reader is the
 * one module allowed to be asynchronous. Every other module stays synchronous,
 * which is what keeps `await` — and therefore any client call — out of them.
 */
const READER = `${LIB_DIR}/inventory-reader.ts`;

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
      "inventory-reader.ts",
      "inventory.ts",
      "legacy-fixture-fallback.ts",
      "manifest.ts",
      "plan.ts",
      "policy.ts",
      "run-ownership.ts",
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

  it("keeps every module but the inventory reader free of an asynchronous boundary", () => {
    const pure = libSources().filter((file) => file !== READER);
    expect(pure).not.toContain(READER);
    for (const file of pure) {
      const source = executableSource(file);
      expect(source, `async in ${file}`).not.toMatch(/\basync\b/);
      expect(source, `await in ${file}`).not.toMatch(/\bawait\b/);
    }
  });

  it("gives the inventory reader one injected read capability and no other", () => {
    const source = readFileSync(READER, "utf8");
    // The source is a parameter, so the reader cannot reach ambient state and
    // a test can prove it was never invoked.
    expect(source).toContain("source?: DemoResetRowCountSource | null");
    expect(source).toContain("countRows(object: string)");
    expect(source, "table access in the reader").not.toContain(".from(");
    expect(source, "query builder in the reader").not.toContain(".select(");
  });

  it("derives run ownership server-side and never looks a run up", () => {
    const source = readFileSync(`${LIB_DIR}/run-ownership.ts`, "utf8");
    // The claim is typed `unknown` and only ever compared, never used as a key.
    expect(source).toContain("claimedRunId?: unknown");
    expect(source).toContain('return notEstablished("RUN_NOT_OWNED_BY_ACTOR")');
    expect(source, "run lookup").not.toContain(".from(");
    expect(source, "run lookup").not.toContain(".eq(");
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
    // Whitespace-insensitive so that reformatting the call cannot silently
    // retire the guard.
    expect(readFileSync(SERVICE, "utf8").replace(/\s/g, "")).toContain(
      'unavailableDemoResetInventory("RUN_SCOPED_INVENTORY_SOURCE_ABSENT"',
    );
  });

  it("denies before reading, and hands the planner an already-read inventory", () => {
    const source = executableSource(SERVICE);
    const ownership = source.indexOf("resolveDemoResetRunScope(");
    const read = source.indexOf("readDemoResetInventory(");
    expect(ownership, "ownership is resolved").toBeGreaterThan(-1);
    expect(read, "inventory is read").toBeGreaterThan(-1);
    // Ownership is established before any read is attempted.
    expect(ownership).toBeLessThan(read);
    expect(source).toContain("if (runScope.kind !== ");
    // The planner is given the observed inventory; it never reaches for one.
    expect(source.replace(/\s/g, "")).toContain("inventory:read.inventory,");
  });
});

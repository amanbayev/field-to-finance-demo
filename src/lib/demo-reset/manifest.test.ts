import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_DATASET_V2_RESET_MANIFEST,
  categoriesByDisposition,
  manifestCategoryIds,
  overlappingManifestObjects,
  provablyDisjointRowScopes,
  unscopedClearedCategories,
  type DemoResetManifest,
  type DemoResetRowScope,
} from "@/lib/demo-reset/manifest";

const MIGRATIONS_DIR = "supabase/migrations";
const STORAGE_BUCKETS = ["field-documents", "scas-evidence"];

function migratedTableNames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith(".sql")) {
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const pattern = /create table (?:if not exists )?(?:(?:public|private)\.)?([a-z_0-9]+)/gi;
    for (const match of sql.matchAll(pattern)) {
      names.add(match[1]);
    }
  }
  return names;
}

describe("Dataset V2 reset manifest", () => {
  it("preserves the modern participant root without reclassifying legacy tables or organizations", () => {
    const categories = DEMO_DATASET_V2_RESET_MANIFEST.categories;
    expect(categories.filter(c => c.objects.includes("market_core_participants"))).toEqual([
      expect.objectContaining({ id: "market-core-participant-identity", disposition: "PRESERVED",
        scopeBasis: "ENVIRONMENT_WIDE", objects: ["market_core_participants"] }),
    ]);
    const root = categories.find(c => c.id === "market-core-participant-identity")!;
    expect(root.note).toMatch(/restrictive FK prevents deleting a referenced organization/);
    expect(root.note).toContain("MC-13");
    expect(root.note).toContain("INCOMPLETE");
    expect(categories.find(c => c.id === "market-core-business")?.objects).toHaveLength(14);
    expect(categories.find(c => c.id === "run-created-identity")).toMatchObject({
      disposition: "CLEARED", objects: ["organizations", "memberships", "membership_roles"],
    });
  });
  it("has unique category ids", () => {
    const ids = manifestCategoryIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names only tables that a migration actually creates", () => {
    const migrated = migratedTableNames();
    expect(migrated.size).toBeGreaterThan(0);
    for (const category of DEMO_DATASET_V2_RESET_MANIFEST.categories) {
      if (category.subsystem !== "DATABASE") {
        continue;
      }
      for (const object of category.objects) {
        expect(
          migrated.has(object),
          `${object} in ${category.id} is not created by any migration`,
        ).toBe(true);
      }
    }
  });

  it("names storage buckets that match the origination bucket constants", () => {
    const originationTypes = readFileSync(
      "src/domain/origination/types.ts",
      "utf8",
    );
    for (const bucket of STORAGE_BUCKETS) {
      expect(originationTypes).toContain(`"${bucket}"`);
    }
    const storage = DEMO_DATASET_V2_RESET_MANIFEST.categories.filter(
      (category) => category.subsystem === "STORAGE",
    );
    expect(storage.flatMap((category) => [...category.objects]).sort()).toEqual(
      [...STORAGE_BUCKETS].sort(),
    );
  });

  it("preserves roles, protocol definitions, operator identity and reset audit", () => {
    const preserved = categoriesByDisposition("PRESERVED").map(
      (category) => category.id,
    );
    expect(preserved).toEqual(
      expect.arrayContaining([
        "system-roles-and-permissions",
        "protocol-definitions-and-frozen-versions",
        "run-registry",
        "platform-operator-identity",
        "reset-audit",
      ]),
    );
  });

  it("clears every business subsystem of the new scenario", () => {
    const cleared = categoriesByDisposition("CLEARED").map(
      (category) => category.id,
    );
    expect(cleared).toEqual(
      expect.arrayContaining([
        "run-created-identity",
        "onboarding-role-requests",
        "origination-business",
        "origination-events",
        "market-core-business",
        "registrar-book-of-record",
        "application-audit",
        "origination-storage-objects",
        "run-auth-sessions",
      ]),
    );
  });

  it("clears the immutable origination tables and the registrar book explicitly", () => {
    const origination = DEMO_DATASET_V2_RESET_MANIFEST.categories.find(
      (category) => category.id === "origination-business",
    );
    expect(origination?.objects).toContain("verified_field_snapshots");
    expect(origination?.objects).toContain("origination_dacs");

    const registrar = DEMO_DATASET_V2_RESET_MANIFEST.categories.find(
      (category) => category.id === "registrar-book-of-record",
    );
    expect(registrar?.objects).toEqual(["registrar_registered_ownership"]);
  });

  it("never clears Devnet execution history", () => {
    const chain = DEMO_DATASET_V2_RESET_MANIFEST.categories.filter(
      (category) => category.subsystem === "CHAIN",
    );
    expect(chain).not.toHaveLength(0);
    for (const category of chain) {
      expect(category.disposition).toBe("PRESERVED");
    }
  });

  it("marks only the islands that still cannot name their rows as unscoped", () => {
    const unscoped = unscopedClearedCategories().map((category) => category.id);
    expect(unscoped).toEqual([
      "onboarding-role-requests",
      "origination-events",
      "market-core-business",
      "registrar-book-of-record",
      "application-audit",
      "origination-storage-objects",
      "run-auth-sessions",
    ]);
    expect(unscoped).not.toContain("run-created-identity");
    expect(unscoped).not.toContain("origination-business");
  });

  it("retires the shared-identity overlap because the row sets are disjoint", () => {
    const preserved = DEMO_DATASET_V2_RESET_MANIFEST.categories.find(
      (category) => category.id === "platform-operator-identity",
    );
    const cleared = DEMO_DATASET_V2_RESET_MANIFEST.categories.find(
      (category) => category.id === "run-created-identity",
    );
    expect(preserved?.rowScope).toBe("NON_RUN_ROWS");
    expect(cleared?.rowScope).toBe("RUN_OWNED_ROWS");
    expect(preserved?.objects).toEqual(
      expect.arrayContaining(["organizations", "memberships", "membership_roles"]),
    );
    expect(cleared?.objects).toEqual([
      "organizations",
      "memberships",
      "membership_roles",
    ]);
    expect(overlappingManifestObjects()).toEqual([]);
  });

  it("does not treat profiles as run-owned identity", () => {
    const preserved = DEMO_DATASET_V2_RESET_MANIFEST.categories.find(
      (category) => category.id === "platform-operator-identity",
    );
    const cleared = DEMO_DATASET_V2_RESET_MANIFEST.categories.find(
      (category) => category.id === "run-created-identity",
    );
    expect(preserved?.objects).toContain("profiles");
    expect(cleared?.objects).not.toContain("profiles");
  });

  it("preserves participant command retry history with the run registry only", () => {
    const history = DEMO_DATASET_V2_RESET_MANIFEST.categories.filter(
      (category) => category.objects.includes("demo_run_participant_commands"),
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: "run-registry",
      subsystem: "DATABASE",
      disposition: "PRESERVED",
      scopeBasis: "ENVIRONMENT_WIDE",
      objects: ["demo_reset_run_instances", "demo_run_participant_commands"],
    });
    expect(
      categoriesByDisposition("CLEARED").flatMap((category) => category.objects),
    ).not.toContain("demo_run_participant_commands");
    expect(
      DEMO_DATASET_V2_RESET_MANIFEST.categories.find(
        (category) => category.id === "run-created-identity",
      )?.objects,
    ).not.toContain("demo_run_participant_commands");
  });

  it("flags an overlap if preserved command history is also claimed for clearing", () => {
    const manifest: DemoResetManifest = {
      ...DEMO_DATASET_V2_RESET_MANIFEST,
      categories: DEMO_DATASET_V2_RESET_MANIFEST.categories.map((category) =>
        category.id === "run-created-identity"
          ? {
              ...category,
              objects: [...category.objects, "demo_run_participant_commands"],
            }
          : category,
      ),
    };
    expect(overlappingManifestObjects()).toEqual([]);
    expect(overlappingManifestObjects(manifest)).toEqual([
      "demo_run_participant_commands",
    ]);
  });

  it("keeps unsupported islands blocking", () => {
    for (const id of [
      "onboarding-role-requests",
      "origination-events",
      "market-core-business",
      "registrar-book-of-record",
      "application-audit",
    ]) {
      const category = DEMO_DATASET_V2_RESET_MANIFEST.categories.find(
        (candidate) => candidate.id === id,
      );
      expect(category?.scopeBasis, id).toBe("NOT_SCOPABLE");
      expect(category?.rowScope, id).toBe("NOT_EXPRESSIBLE");
    }
  });
});

describe("preserved and cleared row scopes", () => {
  const shared = (
    preserved: DemoResetRowScope,
    cleared: DemoResetRowScope,
  ): DemoResetManifest => ({
    datasetContract: "synthetic-overlap",
    categories: [
      {
        id: "kept",
        subsystem: "DATABASE",
        disposition: "PRESERVED",
        scopeBasis: "NOT_SCOPABLE",
        rowScope: preserved,
        objects: ["organizations"],
        note: "operator identity",
      },
      {
        id: "run-rows",
        subsystem: "DATABASE",
        disposition: "CLEARED",
        scopeBasis: "RUN_OWNED",
        rowScope: cleared,
        objects: ["organizations"],
        note: "identity created for the run",
      },
    ],
  });

  it("retires the overlap only when the two sides are disjoint row sets", () => {
    expect(
      overlappingManifestObjects(shared("NON_RUN_ROWS", "RUN_OWNED_ROWS")),
    ).toEqual([]);
  });

  it("keeps the overlap when either side cannot name its rows", () => {
    // The trap this guards: declaring the cleared side `RUN_OWNED` while the
    // preserved side still means "every row of this table". That is not
    // isolation, and flipping a scope basis must not be able to fake it.
    expect(
      overlappingManifestObjects(shared("NOT_EXPRESSIBLE", "RUN_OWNED_ROWS")),
    ).toEqual(["organizations"]);
    expect(
      overlappingManifestObjects(shared("NON_RUN_ROWS", "NOT_EXPRESSIBLE")),
    ).toEqual(["organizations"]);
    expect(
      overlappingManifestObjects(shared("RUN_OWNED_ROWS", "RUN_OWNED_ROWS")),
    ).toEqual(["organizations"]);
  });

  it("treats a cleared category as unscoped until it names the run's rows", () => {
    const unproven = shared("NON_RUN_ROWS", "NOT_EXPRESSIBLE");
    expect(unproven.categories[1].scopeBasis).toBe("RUN_OWNED");
    expect(unscopedClearedCategories(unproven)).toHaveLength(1);
    expect(
      unscopedClearedCategories(shared("NON_RUN_ROWS", "RUN_OWNED_ROWS")),
    ).toHaveLength(0);
  });

  it("proves disjointness only for the run against the non-run rows", () => {
    expect(provablyDisjointRowScopes("RUN_OWNED_ROWS", "NON_RUN_ROWS")).toBe(
      true,
    );
    expect(provablyDisjointRowScopes("NON_RUN_ROWS", "RUN_OWNED_ROWS")).toBe(
      true,
    );
    for (const scope of [
      "RUN_OWNED_ROWS",
      "NON_RUN_ROWS",
      "NOT_EXPRESSIBLE",
      "NOT_APPLICABLE",
    ] as const) {
      expect(provablyDisjointRowScopes(scope, "NOT_EXPRESSIBLE")).toBe(false);
      expect(provablyDisjointRowScopes("NOT_EXPRESSIBLE", scope)).toBe(false);
    }
  });

  it("carries a note for every category", () => {
    for (const category of DEMO_DATASET_V2_RESET_MANIFEST.categories) {
      expect(category.note.trim().length).toBeGreaterThan(0);
    }
  });
});

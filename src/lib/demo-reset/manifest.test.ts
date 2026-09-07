import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEMO_DATASET_V2_RESET_MANIFEST,
  categoriesByDisposition,
  manifestCategoryIds,
  overlappingManifestObjects,
  unscopedClearedCategories,
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
    const pattern = /create table (?:if not exists )?(?:public\.)?([a-z_0-9]+)/gi;
    for (const match of sql.matchAll(pattern)) {
      names.add(match[1]);
    }
  }
  return names;
}

describe("Dataset V2 reset manifest", () => {
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
        "origination-business",
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

  it("records that no cleared category is run-owned at this baseline", () => {
    const unscoped = unscopedClearedCategories();
    expect(unscoped).toEqual(categoriesByDisposition("CLEARED"));
    for (const category of unscoped) {
      expect(category.scopeBasis).toBe("NOT_SCOPABLE");
    }
  });

  it("reports the identity tables that are both preserved and cleared", () => {
    expect(overlappingManifestObjects()).toEqual([
      "membership_roles",
      "memberships",
      "organizations",
      "profiles",
    ]);
  });

  it("carries a note for every category", () => {
    for (const category of DEMO_DATASET_V2_RESET_MANIFEST.categories) {
      expect(category.note.trim().length).toBeGreaterThan(0);
    }
  });
});

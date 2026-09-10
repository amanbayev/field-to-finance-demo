import { describe, expect, it } from "vitest";
import {
  countedRows,
  inventoryGaps,
  unavailableDemoResetInventory,
  type CategoryObservation,
  type DemoResetInventory,
} from "@/lib/demo-reset/inventory";
import {
  DEMO_DATASET_V2_RESET_MANIFEST,
  manifestCategoryIds,
  type DemoResetManifest,
} from "@/lib/demo-reset/manifest";
import { demoResetPlanHash, planDemoResetDryRun } from "@/lib/demo-reset/plan";
import {
  evaluateDemoResetDryRunPolicy,
  type DemoResetDryRunAuthorization,
} from "@/lib/demo-reset/policy";

const APPROVED_REF = "examplerefabcdefghij";
const OBSERVED_AT = "2026-09-07T00:00:00.000Z";
const GENERATED_AT = "2026-09-07T12:00:00.000Z";

function allowedAuthorization(): DemoResetDryRunAuthorization {
  const authorization = evaluateDemoResetDryRunPolicy({
    signals: {
      nodeEnv: "production",
      vercel: "1",
      vercelEnv: "preview",
      publicAppEnv: "demo",
      declaredEnvironment: "approved-demo-qa",
      declaredDatasetId: "demo-dataset-v2",
      declaredDatabaseRef: APPROVED_REF,
      observedSupabaseUrl: `https://${APPROVED_REF}.supabase.co`,
    },
    actor: {
      principalUserId: "operator-1",
      effectiveHoldsPermission: true,
      principalHoldsPermission: true,
      isImpersonating: false,
      isDesignPreviewActor: false,
    },
  });
  expect(authorization.decision).toBe("ALLOWED");
  return authorization;
}

function deniedAuthorization(): DemoResetDryRunAuthorization {
  return evaluateDemoResetDryRunPolicy({
    signals: { vercelEnv: "production" },
    actor: {
      principalUserId: "operator-1",
      effectiveHoldsPermission: true,
      principalHoldsPermission: true,
      isImpersonating: false,
      isDesignPreviewActor: false,
    },
  });
}

/** A manifest where every category is run-owned and nothing overlaps. */
const RUN_OWNED_MANIFEST: DemoResetManifest = {
  datasetContract: "synthetic-run-owned",
  categories: [
    {
      id: "kept",
      subsystem: "DATABASE",
      disposition: "PRESERVED",
      scopeBasis: "ENVIRONMENT_WIDE",
      rowScope: "NON_RUN_ROWS",
      objects: ["organizations"],
      note: "operator identity",
    },
    {
      id: "run-rows",
      subsystem: "DATABASE",
      disposition: "CLEARED",
      scopeBasis: "RUN_OWNED",
      rowScope: "RUN_OWNED_ROWS",
      objects: ["producer_fields"],
      note: "run-owned business rows",
    },
  ],
};

function observedInventory(
  categories: Record<string, CategoryObservation>,
): DemoResetInventory {
  return {
    source: "OBSERVED",
    observedAt: OBSERVED_AT,
    categories,
  };
}

describe("demo reset inventory", () => {
  it("keeps the MC-03 preserved reference unavailable and the full planner INCOMPLETE", () => {
    const inventory = observedInventory(Object.fromEntries(manifestCategoryIds().map(id => [id,
      id === "protocol-definitions-and-frozen-versions"
        ? { kind: "UNAVAILABLE" as const, reason: "SUBSYSTEM_NOT_READABLE" as const }
        : { kind: "COUNTED" as const, rows: 0 },
    ])));
    expect(countedRows(inventory, "protocol-definitions-and-frozen-versions")).toBeNull();
    const plan = planDemoResetDryRun({ authorization: allowedAuthorization(),
      runId: "RUN-1", inventory, manifest: DEMO_DATASET_V2_RESET_MANIFEST });
    expect(plan.status).toBe("INCOMPLETE");
    expect(inventoryGaps(inventory)).toContainEqual({
      categoryId: "protocol-definitions-and-frozen-versions", reason: "SUBSYSTEM_NOT_READABLE",
    });
  });
  it("marks every category unavailable rather than zero when no reader exists", () => {
    const inventory = unavailableDemoResetInventory(
      "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
    );
    for (const categoryId of manifestCategoryIds()) {
      expect(inventory.categories[categoryId]).toEqual({
        kind: "UNAVAILABLE",
        reason: "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
      });
      expect(countedRows(inventory, categoryId)).toBeNull();
    }
    expect(inventory.observedAt).toBeNull();
    expect(inventoryGaps(inventory)).toHaveLength(manifestCategoryIds().length);
  });

  it("reports a category the reader never enumerated", () => {
    const gaps = inventoryGaps(observedInventory({}));
    expect(gaps.every((gap) => gap.reason === "CATEGORY_NOT_ENUMERATED")).toBe(
      true,
    );
  });

  it("distinguishes a counted zero from an unavailable category", () => {
    const inventory = observedInventory({
      "origination-business": { kind: "COUNTED", rows: 0 },
      "market-core-business": {
        kind: "UNAVAILABLE",
        reason: "SUBSYSTEM_NOT_READABLE",
      },
    });
    expect(countedRows(inventory, "origination-business")).toBe(0);
    expect(countedRows(inventory, "market-core-business")).toBeNull();
    const gapIds = inventoryGaps(inventory).map((gap) => gap.categoryId);
    expect(gapIds).toContain("market-core-business");
    expect(gapIds).not.toContain("origination-business");
  });
});

describe("demo reset dry-run planner", () => {
  it("reports INCOMPLETE for the production default at this baseline", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      inventory: unavailableDemoResetInventory(
        "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
      ),
      generatedAt: GENERATED_AT,
    });
    expect(plan.status).toBe("INCOMPLETE");
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        "RUN_SCOPE_NOT_ESTABLISHED",
        "CLEARED_SCOPE_NOT_RUN_OWNED",
        "INVENTORY_INCOMPLETE",
      ]),
    );
    expect(plan.blockers).not.toContain("PRESERVED_AND_CLEARED_OVERLAP");
  });

  it("records that a dry-run has no side effects", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      inventory: unavailableDemoResetInventory(
        "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
      ),
    });
    expect(plan.sideEffects).toBe("NONE");
  });

  it("BLOCKS an unauthorized request and carries its refusals", () => {
    const plan = planDemoResetDryRun({
      authorization: deniedAuthorization(),
      inventory: unavailableDemoResetInventory("SUBSYSTEM_NOT_READABLE"),
    });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockers).toContain("NOT_AUTHORIZED");
    expect(plan.refusals).toContain("PRODUCTION_ENVIRONMENT_DENIED");
    expect(plan.environmentName).toBeNull();
    expect(plan.databaseRef).toBeNull();
  });

  it("BLOCKS a declared test inventory instead of treating it as observed", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      inventory: {
        source: "DECLARED_TEST",
        observedAt: OBSERVED_AT,
        categories: Object.fromEntries(
          manifestCategoryIds().map((id) => [
            id,
            { kind: "COUNTED", rows: 0 } as CategoryObservation,
          ]),
        ),
      },
      runId: "RUN-0001",
    });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockers).toContain("INVENTORY_NOT_OBSERVED");
  });

  it("stays INCOMPLETE when scope is proven but a category is unreadable", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-0001",
      inventory: observedInventory({
        kept: { kind: "COUNTED", rows: 12 },
        "run-rows": { kind: "UNAVAILABLE", reason: "SUBSYSTEM_NOT_READABLE" },
      }),
    });
    expect(plan.status).toBe("INCOMPLETE");
    expect(plan.blockers).toEqual(["INVENTORY_INCOMPLETE"]);
  });

  it("stays INCOMPLETE when inventory is complete but no run is identified", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: null,
      inventory: observedInventory({
        kept: { kind: "COUNTED", rows: 12 },
        "run-rows": { kind: "COUNTED", rows: 3 },
      }),
    });
    expect(plan.status).toBe("INCOMPLETE");
    expect(plan.blockers).toEqual(["RUN_SCOPE_NOT_ESTABLISHED"]);
  });

  it("reaches READY_FOR_CONFIRMATION only with authority, run scope and full inventory", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-0001",
      inventory: observedInventory({
        kept: { kind: "COUNTED", rows: 12 },
        "run-rows": { kind: "COUNTED", rows: 3 },
      }),
      generatedAt: GENERATED_AT,
    });
    expect(plan.status).toBe("READY_FOR_CONFIRMATION");
    expect(plan.blockers).toEqual([]);
    expect(plan.runId).toBe("RUN-0001");
    expect(plan.datasetId).toBe("demo-dataset-v2");
    expect(plan.databaseRef).toBe(APPROVED_REF);
    expect(plan.sideEffects).toBe("NONE");
  });

  it("refuses a run-owned inventory whose counts are not real numbers", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-1",
      inventory: {
        source: "OBSERVED",
        observedAt: OBSERVED_AT,
        categories: {
          kept: { kind: "COUNTED", rows: 12 },
          "run-rows": { kind: "COUNTED", rows: Number.NaN },
        },
      },
    });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockers).toContain("INVENTORY_OBSERVATION_INVALID");
    expect(plan.inventoryGaps).toEqual([
      { categoryId: "run-rows", reason: "OBSERVATION_COUNT_INVALID" },
    ]);
    const runRows = plan.cleared.find(
      (category) => category.categoryId === "run-rows",
    );
    expect(runRows?.rows).toBeNull();
  });

  it("refuses a counted inventory that reports no observation time", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-1",
      inventory: {
        source: "OBSERVED",
        observedAt: null,
        categories: {
          kept: { kind: "COUNTED", rows: 12 },
          "run-rows": { kind: "COUNTED", rows: 3 },
        },
      },
    });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockers).toContain("INVENTORY_TIME_NOT_ESTABLISHED");
    expect(plan.inventoryObservedAt).toBeNull();
  });

  it("refuses the exact reviewed combination of null time and NaN counts", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-1",
      inventory: {
        source: "OBSERVED",
        observedAt: null,
        categories: {
          kept: { kind: "COUNTED", rows: Number.NaN },
          "run-rows": { kind: "COUNTED", rows: Number.NaN },
        },
      },
    });
    expect(plan.status).not.toBe("READY_FOR_CONFIRMATION");
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        "INVENTORY_OBSERVATION_INVALID",
        "INVENTORY_TIME_NOT_ESTABLISHED",
      ]),
    );
  });

  it("refuses a non-existent calendar date as the observation time", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-1",
      inventory: {
        source: "OBSERVED",
        observedAt: "2026-02-30T00:00:00Z",
        categories: {
          kept: { kind: "COUNTED", rows: 12 },
          "run-rows": { kind: "COUNTED", rows: 3 },
        },
      },
    });
    expect(plan.status).not.toBe("READY_FOR_CONFIRMATION");
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockers).toContain("INVENTORY_TIME_NOT_ESTABLISHED");
    expect(plan.inventoryObservedAt).toBeNull();
  });

  it("refuses an observation time that is not a real instant", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-1",
      inventory: {
        source: "OBSERVED",
        observedAt: "yesterday",
        categories: {
          kept: { kind: "COUNTED", rows: 12 },
          "run-rows": { kind: "COUNTED", rows: 3 },
        },
      },
    });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockers).toContain("INVENTORY_TIME_NOT_ESTABLISHED");
  });

  it("refuses an observation kind it cannot interpret", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-1",
      inventory: {
        source: "OBSERVED",
        observedAt: OBSERVED_AT,
        categories: {
          kept: { kind: "COUNTED", rows: 12 },
          "run-rows": { kind: "ESTIMATED", rows: 3 } as unknown as CategoryObservation,
        },
      },
    });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockers).toContain("INVENTORY_OBSERVATION_INVALID");
    expect(plan.inventoryGaps).toEqual([
      { categoryId: "run-rows", reason: "OBSERVATION_NOT_INTERPRETABLE" },
    ]);
  });

  it("does not accept a blank run id as an established scope", () => {
    for (const runId of ["", "   ", "\t\n"]) {
      const plan = planDemoResetDryRun({
        authorization: allowedAuthorization(),
        manifest: RUN_OWNED_MANIFEST,
        runId,
        inventory: observedInventory({
          kept: { kind: "COUNTED", rows: 12 },
          "run-rows": { kind: "COUNTED", rows: 3 },
        }),
      });
      expect(plan.status).toBe("INCOMPLETE");
      expect(plan.blockers).toEqual(["RUN_SCOPE_NOT_ESTABLISHED"]);
      expect(plan.runId).toBeNull();
    }
  });

  it("trims a run id rather than carrying padding into the scope", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      manifest: RUN_OWNED_MANIFEST,
      runId: "  RUN-0001  ",
      inventory: observedInventory({
        kept: { kind: "COUNTED", rows: 12 },
        "run-rows": { kind: "COUNTED", rows: 3 },
      }),
    });
    expect(plan.status).toBe("READY_FOR_CONFIRMATION");
    expect(plan.runId).toBe("RUN-0001");
  });

  it("keeps an unavailable category as null rows in the plan, not zero", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      inventory: unavailableDemoResetInventory("SUBSYSTEM_NOT_READABLE"),
    });
    for (const category of [...plan.preserved, ...plan.cleared]) {
      expect(category.rows).toBeNull();
    }
  });

  it("no longer names identity tables as an unproven overlap", () => {
    const plan = planDemoResetDryRun({
      authorization: allowedAuthorization(),
      inventory: unavailableDemoResetInventory(
        "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
      ),
    });
    expect(plan.overlappingObjects).toEqual([]);
  });
});

describe("demo reset plan hash", () => {
  const base = {
    environmentName: "approved-demo-qa",
    datasetId: "demo-dataset-v2",
    databaseRef: APPROVED_REF,
    runId: "RUN-0001",
    datasetContract: "demo-dataset-v2",
    inventorySource: "OBSERVED" as const,
    status: "READY_FOR_CONFIRMATION" as const,
    preserved: [
      {
        categoryId: "kept",
        subsystem: "DATABASE" as const,
        scopeBasis: "ENVIRONMENT_WIDE" as const,
        rowScope: "NON_RUN_ROWS" as const,
        objects: ["organizations"],
        rows: 12,
        note: "operator identity",
      },
    ],
    cleared: [
      {
        categoryId: "run-rows",
        subsystem: "DATABASE" as const,
        scopeBasis: "RUN_OWNED" as const,
        rowScope: "RUN_OWNED_ROWS" as const,
        objects: ["producer_fields"],
        rows: 3,
        note: "run-owned business rows",
      },
    ],
  };

  it("is stable for identical inputs", () => {
    expect(demoResetPlanHash(base)).toBe(demoResetPlanHash(base));
  });

  it("changes when the run, dataset, database or counts change", () => {
    const original = demoResetPlanHash(base);
    expect(demoResetPlanHash({ ...base, runId: "RUN-0002" })).not.toBe(original);
    expect(demoResetPlanHash({ ...base, datasetId: "other" })).not.toBe(
      original,
    );
    expect(demoResetPlanHash({ ...base, databaseRef: "otherref" })).not.toBe(
      original,
    );
    expect(
      demoResetPlanHash({
        ...base,
        cleared: [{ ...base.cleared[0], rows: 4 }],
      }),
    ).not.toBe(original);
    expect(
      demoResetPlanHash({
        ...base,
        cleared: [{ ...base.cleared[0], objects: ["producer_fields", "extra"] }],
      }),
    ).not.toBe(original);
  });

  it("changes when a category subsystem changes", () => {
    const original = demoResetPlanHash(base);
    expect(
      demoResetPlanHash({
        ...base,
        cleared: [{ ...base.cleared[0], subsystem: "STORAGE" as const }],
      }),
    ).not.toBe(original);
    expect(
      demoResetPlanHash({
        ...base,
        preserved: [{ ...base.preserved[0], subsystem: "AUTH" as const }],
      }),
    ).not.toBe(original);
  });

  it("changes when the dataset contract version changes", () => {
    const original = demoResetPlanHash(base);
    expect(
      demoResetPlanHash({ ...base, datasetContract: "demo-dataset-v3" }),
    ).not.toBe(original);
  });

  it("changes when a category row scope changes", () => {
    // Which rows are in scope decides what a confirmation would authorise, so
    // a plan reviewed for the run's rows must not match one for every row.
    expect(
      demoResetPlanHash({
        ...base,
        cleared: [
          { ...base.cleared[0], rowScope: "NOT_EXPRESSIBLE" as const },
        ],
      }),
    ).not.toBe(demoResetPlanHash(base));
  });

  it("changes when a category scope basis or status changes", () => {
    const original = demoResetPlanHash(base);
    expect(
      demoResetPlanHash({
        ...base,
        cleared: [{ ...base.cleared[0], scopeBasis: "NOT_SCOPABLE" as const }],
      }),
    ).not.toBe(original);
    expect(demoResetPlanHash({ ...base, status: "INCOMPLETE" })).not.toBe(
      original,
    );
  });

  it("does not change when only a reviewer note changes", () => {
    expect(
      demoResetPlanHash({
        ...base,
        cleared: [{ ...base.cleared[0], note: "reworded for review" }],
      }),
    ).toBe(demoResetPlanHash(base));
  });

  it("changes the plan hash when a manifest subsystem changes", () => {
    const authorization = allowedAuthorization();
    const inventory = observedInventory({
      kept: { kind: "COUNTED", rows: 12 },
      "run-rows": { kind: "COUNTED", rows: 3 },
    });
    const asDatabase = planDemoResetDryRun({
      authorization,
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-0001",
      inventory,
    });
    const asStorage = planDemoResetDryRun({
      authorization,
      manifest: {
        ...RUN_OWNED_MANIFEST,
        categories: [
          RUN_OWNED_MANIFEST.categories[0],
          { ...RUN_OWNED_MANIFEST.categories[1], subsystem: "STORAGE" },
        ],
      },
      runId: "RUN-0001",
      inventory,
    });
    expect(asStorage.planHash).not.toBe(asDatabase.planHash);
  });

  it("changes the plan hash when only the dataset contract changes", () => {
    const authorization = allowedAuthorization();
    const inventory = observedInventory({
      kept: { kind: "COUNTED", rows: 12 },
      "run-rows": { kind: "COUNTED", rows: 3 },
    });
    const first = planDemoResetDryRun({
      authorization,
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-0001",
      inventory,
    });
    const revised = planDemoResetDryRun({
      authorization,
      manifest: {
        ...RUN_OWNED_MANIFEST,
        datasetContract: "synthetic-run-owned-v2",
      },
      runId: "RUN-0001",
      inventory,
    });
    expect(revised.planHash).not.toBe(first.planHash);
    expect(revised.datasetContract).toBe("synthetic-run-owned-v2");
  });

  it("does not treat equal counts as proof that the row set is unchanged", () => {
    // Recorded limitation: only the count enters the hash, so a same-size row
    // set with different members is not detected. Inventory revision or
    // fingerprint per category is a prerequisite before any confirmation.
    const withThreeRows = demoResetPlanHash(base);
    expect(
      demoResetPlanHash({
        ...base,
        cleared: [{ ...base.cleared[0], rows: 3 }],
      }),
    ).toBe(withThreeRows);
  });

  it("does not depend on generation time, so an unchanged plan keeps its hash", () => {
    const authorization = allowedAuthorization();
    const inventory = unavailableDemoResetInventory(
      "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
    );
    const first = planDemoResetDryRun({
      authorization,
      inventory,
      generatedAt: GENERATED_AT,
    });
    const second = planDemoResetDryRun({
      authorization,
      inventory,
      generatedAt: "2026-09-08T09:30:00.000Z",
    });
    expect(second.planHash).toBe(first.planHash);
    expect(second.generatedAt).not.toBe(first.generatedAt);
  });

  it("differs between the shipped manifest and a run-owned manifest", () => {
    const authorization = allowedAuthorization();
    const shipped = planDemoResetDryRun({
      authorization,
      manifest: DEMO_DATASET_V2_RESET_MANIFEST,
      inventory: unavailableDemoResetInventory("SUBSYSTEM_NOT_READABLE"),
    });
    const synthetic = planDemoResetDryRun({
      authorization,
      manifest: RUN_OWNED_MANIFEST,
      runId: "RUN-0001",
      inventory: observedInventory({
        kept: { kind: "COUNTED", rows: 12 },
        "run-rows": { kind: "COUNTED", rows: 3 },
      }),
    });
    expect(synthetic.planHash).not.toBe(shipped.planHash);
  });
});

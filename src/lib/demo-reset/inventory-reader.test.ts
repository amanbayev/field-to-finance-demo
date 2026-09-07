import { describe, expect, it, vi } from "vitest";
import type { DemoResetEnvironmentSignals } from "@/lib/demo-reset/environment";
import {
  countedRows,
  inventoryGaps,
  invalidObservations,
} from "@/lib/demo-reset/inventory";
import {
  readDemoResetInventory,
  type DemoResetRowCount,
  type DemoResetRowCountSource,
} from "@/lib/demo-reset/inventory-reader";
import {
  DEMO_DATASET_V2_RESET_MANIFEST,
  type DemoResetManifest,
} from "@/lib/demo-reset/manifest";
import {
  evaluateDemoResetDryRunPolicy,
  type DemoResetActorFacts,
} from "@/lib/demo-reset/policy";
import {
  resolveDemoResetRunScope,
  type DemoResetRunScope,
} from "@/lib/demo-reset/run-ownership";

const APPROVED_REF = "examplerefabcdefghij";
const OBSERVED_AT = "2026-09-07T12:00:00.000Z";
const now = () => OBSERVED_AT;

const ELIGIBLE_SIGNALS: DemoResetEnvironmentSignals = {
  nodeEnv: "production",
  vercel: "1",
  vercelEnv: "preview",
  publicAppEnv: "demo",
  declaredEnvironment: "approved-demo-qa",
  declaredDatasetId: "demo-dataset-v2",
  declaredDatabaseRef: APPROVED_REF,
  observedSupabaseUrl: `https://${APPROVED_REF}.supabase.co`,
};

const AUTHORIZED_ACTOR: DemoResetActorFacts = {
  principalUserId: "operator-1",
  effectiveHoldsPermission: true,
  principalHoldsPermission: true,
  isImpersonating: false,
  isDesignPreviewActor: false,
};

function scopeFor(overrides?: {
  signals?: Partial<DemoResetEnvironmentSignals>;
  actor?: Partial<DemoResetActorFacts>;
  claimedRunId?: unknown;
}): DemoResetRunScope {
  return resolveDemoResetRunScope({
    authorization: evaluateDemoResetDryRunPolicy({
      signals: { ...ELIGIBLE_SIGNALS, ...overrides?.signals },
      actor: { ...AUTHORIZED_ACTOR, ...overrides?.actor },
    }),
    claimedRunId: overrides?.claimedRunId,
  });
}

const ALLOWED_SCOPE = scopeFor();

/**
 * A manifest built to exercise every branch of the reader. The shipped
 * manifest has no countable database category, which is itself asserted below.
 */
const MIXED_MANIFEST: DemoResetManifest = {
  datasetContract: "test-contract",
  categories: [
    {
      id: "environment-wide-tables",
      subsystem: "DATABASE",
      disposition: "PRESERVED",
      scopeBasis: "ENVIRONMENT_WIDE",
      objects: ["alpha", "beta"],
      note: "Two countable objects.",
    },
    {
      id: "declares-no-objects",
      subsystem: "DATABASE",
      disposition: "PRESERVED",
      scopeBasis: "ENVIRONMENT_WIDE",
      objects: [],
      note: "Covers no database rows by declaration.",
    },
    {
      id: "not-scopable",
      subsystem: "DATABASE",
      disposition: "CLEARED",
      scopeBasis: "NOT_SCOPABLE",
      objects: ["gamma"],
      note: "Needs run isolation that does not exist.",
    },
    {
      id: "claims-run-ownership",
      subsystem: "DATABASE",
      disposition: "CLEARED",
      scopeBasis: "RUN_OWNED",
      objects: ["delta"],
      note: "Claims run ownership without a run-scoped source.",
    },
    {
      id: "storage-objects",
      subsystem: "STORAGE",
      disposition: "CLEARED",
      scopeBasis: "ENVIRONMENT_WIDE",
      objects: ["a-bucket"],
      note: "Not observable by a row count.",
    },
  ],
};

/**
 * A source that records every object it was asked for and refuses every other
 * property access, so a test proves not only which reads happened but that the
 * reader reached for no other capability.
 */
function recordingSource(
  answers: Readonly<Record<string, DemoResetRowCount>>,
): { source: DemoResetRowCountSource; asked: string[] } {
  const asked: string[] = [];
  const target = {
    async countRows(object: string): Promise<DemoResetRowCount> {
      asked.push(object);
      return answers[object] ?? { kind: "UNREADABLE" };
    },
  };
  const source = new Proxy(target, {
    get(receiver, property, self) {
      if (typeof property === "string" && property !== "countRows") {
        throw new Error(`the reader reached for "${property}"`);
      }
      return Reflect.get(receiver, property, self);
    },
  });
  return { source, asked };
}

/** A source that fails the test if it is invoked at all. */
function forbiddenSource(): DemoResetRowCountSource & {
  countRows: ReturnType<typeof vi.fn>;
} {
  return {
    countRows: vi.fn(async () => {
      throw new Error("the reader queried the database on a denied path");
    }),
  };
}

describe("demo reset inventory reader on an allowed context", () => {
  it("counts environment-wide categories and refuses to guess the rest", async () => {
    const { source, asked } = recordingSource({
      alpha: { kind: "COUNTED", rows: 7 },
      beta: { kind: "COUNTED", rows: 5 },
    });

    const read = await readDemoResetInventory({
      scope: ALLOWED_SCOPE,
      source,
      manifest: MIXED_MANIFEST,
      now,
    });

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;

    expect(read.inventory).toEqual({
      source: "OBSERVED",
      observedAt: OBSERVED_AT,
      categories: {
        "environment-wide-tables": { kind: "COUNTED", rows: 12 },
        "declares-no-objects": { kind: "COUNTED", rows: 0 },
        "not-scopable": {
          kind: "UNAVAILABLE",
          reason: "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
        },
        "claims-run-ownership": {
          kind: "UNAVAILABLE",
          reason: "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
        },
        "storage-objects": {
          kind: "UNAVAILABLE",
          reason: "SUBSYSTEM_NOT_READABLE",
        },
      },
    });

    // Only the environment-wide database objects were touched. A run-scoped
    // category is never counted environment-wide, and a storage bucket is
    // never counted at all.
    expect(asked).toEqual(["alpha", "beta"]);
    expect(read.objectsRead).toEqual(["alpha", "beta"]);
  });

  it("reads nothing against the shipped manifest, because nothing is run-scoped yet", async () => {
    const source = forbiddenSource();
    const read = await readDemoResetInventory({
      scope: ALLOWED_SCOPE,
      source,
      now,
    });

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(source.countRows).not.toHaveBeenCalled();
    expect(read.objectsRead).toEqual([]);

    // Every database category in the shipped manifest needs run isolation, so
    // the honest report is unavailable rather than an empty environment.
    expect(countedRows(read.inventory, "origination-business")).toBeNull();
    expect(
      inventoryGaps(read.inventory, DEMO_DATASET_V2_RESET_MANIFEST).map(
        (gap) => gap.categoryId,
      ),
    ).toContain("market-core-business");
    expect(
      invalidObservations(read.inventory, DEMO_DATASET_V2_RESET_MANIFEST),
    ).toEqual([]);
  });

  it("reports an unavailable category as unknown rather than as zero", async () => {
    const { source } = recordingSource({
      alpha: { kind: "COUNTED", rows: 4 },
      beta: { kind: "UNREADABLE" },
    });
    const read = await readDemoResetInventory({
      scope: ALLOWED_SCOPE,
      source,
      manifest: MIXED_MANIFEST,
      now,
    });

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    // Not the partial sum of 4: one unreadable object makes the whole category
    // unknown, because a partial count would understate it.
    expect(read.inventory.categories["environment-wide-tables"]).toEqual({
      kind: "UNAVAILABLE",
      reason: "SUBSYSTEM_NOT_READABLE",
    });
    expect(countedRows(read.inventory, "environment-wide-tables")).toBeNull();
  });

  it("reports a category the manifest expects but the record omits", async () => {
    const read = await readDemoResetInventory({
      scope: ALLOWED_SCOPE,
      manifest: { ...MIXED_MANIFEST, categories: [] },
      now,
    });

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(
      inventoryGaps(read.inventory, MIXED_MANIFEST).map((gap) => gap.reason),
    ).toEqual(
      Array(MIXED_MANIFEST.categories.length).fill("CATEGORY_NOT_ENUMERATED"),
    );
  });

  it("treats a missing source as no access rather than as no objects", async () => {
    const read = await readDemoResetInventory({
      scope: ALLOWED_SCOPE,
      source: null,
      manifest: MIXED_MANIFEST,
      now,
    });

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.categories["environment-wide-tables"]).toEqual({
      kind: "UNAVAILABLE",
      reason: "SUBSYSTEM_NOT_READABLE",
    });
    expect(read.objectsRead).toEqual([]);
  });
});

describe("demo reset inventory reader on inconsistent answers", () => {
  // A real source can hand back a null, a string or a failed aggregate where a
  // number is expected, so the declared type is re-checked rather than trusted.
  const brokenCounts: readonly unknown[] = [
    { kind: "COUNTED", rows: -1 },
    { kind: "COUNTED", rows: Number.NaN },
    { kind: "COUNTED", rows: Number.POSITIVE_INFINITY },
    { kind: "COUNTED", rows: 1.5 },
    { kind: "COUNTED", rows: "12" },
    { kind: "COUNTED", rows: null },
    { kind: "COUNTED" },
  ];

  it("records an uninterpretable count as a defect, never as a number", async () => {
    for (const broken of brokenCounts) {
      const { source } = recordingSource({
        alpha: broken as DemoResetRowCount,
        beta: { kind: "COUNTED", rows: 1 },
      });
      const read = await readDemoResetInventory({
        scope: ALLOWED_SCOPE,
        source,
        manifest: MIXED_MANIFEST,
        now,
      });

      expect(read.kind).toBe("READ");
      if (read.kind !== "READ") return;
      expect(
        read.inventory.categories["environment-wide-tables"],
        `${JSON.stringify(broken)} must be a defect`,
      ).toEqual({ kind: "UNAVAILABLE", reason: "OBSERVATION_COUNT_INVALID" });
    }
  });

  it("records an unknown observation kind as uninterpretable", async () => {
    const { source } = recordingSource({
      alpha: { kind: "MYSTERY" } as unknown as DemoResetRowCount,
    });
    const read = await readDemoResetInventory({
      scope: ALLOWED_SCOPE,
      source,
      manifest: MIXED_MANIFEST,
      now,
    });

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.categories["environment-wide-tables"]).toEqual({
      kind: "UNAVAILABLE",
      reason: "OBSERVATION_NOT_INTERPRETABLE",
    });
  });

  it("refuses a total that cannot be represented exactly", async () => {
    const { source } = recordingSource({
      alpha: { kind: "COUNTED", rows: Number.MAX_SAFE_INTEGER },
      beta: { kind: "COUNTED", rows: 2 },
    });
    const read = await readDemoResetInventory({
      scope: ALLOWED_SCOPE,
      source,
      manifest: MIXED_MANIFEST,
      now,
    });

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.categories["environment-wide-tables"]).toEqual({
      kind: "UNAVAILABLE",
      reason: "OBSERVATION_COUNT_INVALID",
    });
  });

  it("turns a throwing source into an unavailable category, not a crash", async () => {
    const source: DemoResetRowCountSource = {
      async countRows() {
        throw new Error("connection refused for user postgres");
      },
    };
    const read = await readDemoResetInventory({
      scope: ALLOWED_SCOPE,
      source,
      manifest: MIXED_MANIFEST,
      now,
    });

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.categories["environment-wide-tables"]).toEqual({
      kind: "UNAVAILABLE",
      reason: "SUBSYSTEM_NOT_READABLE",
    });
    // The thrown detail is not carried into the record an operator would see.
    expect(JSON.stringify(read.inventory)).not.toContain("postgres");
  });

  it("records an unusable observation time as absent rather than inventing one", async () => {
    for (const instant of [
      "",
      "not-a-time",
      "2026-02-30T00:00:00Z",
      "2026-09-07T25:00:00Z",
    ]) {
      const read = await readDemoResetInventory({
        scope: ALLOWED_SCOPE,
        manifest: MIXED_MANIFEST,
        now: () => instant,
      });
      expect(read.kind).toBe("READ");
      if (read.kind !== "READ") return;
      expect(
        read.inventory.observedAt,
        `${instant} must not be accepted`,
      ).toBeNull();
    }
  });
});

describe("demo reset inventory reader on a denied context", () => {
  it("does not touch the database when the runtime is production", async () => {
    const source = forbiddenSource();
    const read = await readDemoResetInventory({
      scope: scopeFor({ signals: { vercelEnv: "production" } }),
      source,
      manifest: MIXED_MANIFEST,
      now,
    });

    expect(read).toEqual({
      kind: "NOT_READ",
      refusal: "ENVIRONMENT_NOT_ELIGIBLE",
    });
    expect(source.countRows).not.toHaveBeenCalled();
  });

  it("does not touch the database when the environment is unknown or unapproved", async () => {
    for (const signals of [
      { nodeEnv: undefined },
      { declaredEnvironment: undefined },
      { declaredEnvironment: "some-other-environment" },
      { vercel: "0" },
    ]) {
      const source = forbiddenSource();
      const read = await readDemoResetInventory({
        scope: scopeFor({ signals }),
        source,
        manifest: MIXED_MANIFEST,
        now,
      });

      expect(read.kind, `${JSON.stringify(signals)} must not be read`).toBe(
        "NOT_READ",
      );
      expect(source.countRows).not.toHaveBeenCalled();
    }
  });

  it("does not touch the database for an unapproved dataset or database", async () => {
    for (const signals of [
      { declaredDatasetId: undefined },
      { declaredDatabaseRef: undefined },
      { declaredDatabaseRef: "not-a-project-ref" },
      { observedSupabaseUrl: "https://otherrefabcdefghijkl.supabase.co" },
      { observedSupabaseUrl: "http://127.0.0.1:54321" },
    ]) {
      const source = forbiddenSource();
      const read = await readDemoResetInventory({
        scope: scopeFor({ signals }),
        source,
        manifest: MIXED_MANIFEST,
        now,
      });

      expect(read).toEqual({
        kind: "NOT_READ",
        refusal: "ENVIRONMENT_NOT_ELIGIBLE",
      });
      expect(source.countRows).not.toHaveBeenCalled();
    }
  });

  it("does not touch the database when the run belongs to another actor", async () => {
    const source = forbiddenSource();
    const read = await readDemoResetInventory({
      scope: scopeFor({ claimedRunId: `run-${"0".repeat(64)}` }),
      source,
      manifest: MIXED_MANIFEST,
      now,
    });

    expect(read).toEqual({
      kind: "NOT_READ",
      refusal: "RUN_NOT_OWNED_BY_ACTOR",
    });
    expect(source.countRows).not.toHaveBeenCalled();
  });

  it("does not touch the database for an unauthorized actor or a malformed claim", async () => {
    for (const overrides of [
      { actor: { principalHoldsPermission: false } },
      { actor: { isImpersonating: true } },
      { actor: { isDesignPreviewActor: true } },
      { actor: { principalUserId: "  " } },
      { claimedRunId: "RUN-0001" },
    ]) {
      const source = forbiddenSource();
      const read = await readDemoResetInventory({
        scope: scopeFor(overrides),
        source,
        manifest: MIXED_MANIFEST,
        now,
      });

      expect(read.kind, `${JSON.stringify(overrides)} must not be read`).toBe(
        "NOT_READ",
      );
      expect(source.countRows).not.toHaveBeenCalled();
    }
  });
});

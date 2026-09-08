import { describe, expect, it, vi } from "vitest";
import { countedRows, inventoryGaps } from "@/lib/demo-reset/inventory";
import {
  DEMO_DATASET_V2_RESET_MANIFEST,
  type DemoResetManifest,
} from "@/lib/demo-reset/manifest";
import {
  DEMO_RESET_READABLE_OBJECTS,
  readDemoResetInventory,
  readableObject,
  type DemoResetCountRequest,
  type DemoResetRowCount,
  type DemoResetRowCountSource,
} from "@/lib/demo-reset/inventory-reader";
import type {
  DemoResetEstablishedRunScope,
  DemoResetRunScope,
} from "@/lib/demo-reset/run-scope";

const APPROVED_REF = "examplerefabcdefghij";
const OBSERVED_AT = "2026-09-07T00:00:00.000Z";

const now = () => OBSERVED_AT;

const ESTABLISHED: DemoResetEstablishedRunScope = {
  kind: "ESTABLISHED",
  runId: "run-a-0000000000000001",
  operatorPrincipalUserId: "operator-1",
  environmentName: "approved-demo-qa",
  datasetId: "demo-dataset-v2",
  databaseRef: APPROVED_REF,
};

/**
 * Objects are real table names from the shipped manifest, because the reader
 * may only touch names that manifest declares.
 */
const MIXED_MANIFEST: DemoResetManifest = {
  datasetContract: "synthetic-mixed",
  categories: [
    {
      id: "environment-wide",
      subsystem: "DATABASE",
      disposition: "PRESERVED",
      scopeBasis: "ENVIRONMENT_WIDE",
      rowScope: "NON_RUN_ROWS",
      objects: ["organizations", "profiles"],
      note: "Whole-environment by declaration.",
    },
    {
      id: "run-owned",
      subsystem: "DATABASE",
      disposition: "CLEARED",
      scopeBasis: "RUN_OWNED",
      rowScope: "RUN_OWNED_ROWS",
      objects: ["producer_fields"],
      note: "Rows belonging to the target run.",
    },
    {
      id: "no-objects",
      subsystem: "DATABASE",
      disposition: "PRESERVED",
      scopeBasis: "ENVIRONMENT_WIDE",
      rowScope: "NOT_APPLICABLE",
      objects: [],
      note: "Declares its objects exhaustively and names none.",
    },
    {
      id: "not-scopable",
      subsystem: "DATABASE",
      disposition: "CLEARED",
      scopeBasis: "NOT_SCOPABLE",
      rowScope: "NOT_EXPRESSIBLE",
      objects: ["app_audit_events"],
      note: "Needs run isolation that does not exist.",
    },
    {
      id: "storage",
      subsystem: "STORAGE",
      disposition: "CLEARED",
      scopeBasis: "ENVIRONMENT_WIDE",
      rowScope: "NOT_APPLICABLE",
      objects: ["field-documents"],
      note: "Not observable by a row count.",
    },
  ],
};

function manifestOf(
  ...categories: DemoResetManifest["categories"]
): DemoResetManifest {
  return { datasetContract: "synthetic", categories };
}

/**
 * A source that records every request it was asked for and refuses every other
 * property access, so a test proves not only which reads happened but that the
 * reader reached for no other capability.
 */
function recordingSource(
  answers: Readonly<Record<string, DemoResetRowCount>>,
): { source: DemoResetRowCountSource; asked: DemoResetCountRequest[] } {
  const asked: DemoResetCountRequest[] = [];
  const target = {
    async countRows(request: DemoResetCountRequest): Promise<DemoResetRowCount> {
      asked.push(request);
      return answers[request.object] ?? { kind: "UNREADABLE" };
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

describe("demo reset readable objects", () => {
  it("allows exactly the database objects the shipped manifest declares", () => {
    const declared = new Set(
      DEMO_DATASET_V2_RESET_MANIFEST.categories
        .filter((category) => category.subsystem === "DATABASE")
        .flatMap((category) => [...category.objects]),
    );
    expect(new Set(DEMO_RESET_READABLE_OBJECTS)).toEqual(declared);
    expect(readableObject("producer_fields")).toBe("producer_fields");
  });

  it("refuses a name the manifest never declared", () => {
    for (const name of [
      "auth.users",
      "pg_catalog.pg_tables",
      "organizations; drop table profiles",
      "field-documents",
      "",
    ]) {
      expect(readableObject(name), name).toBeNull();
    }
  });

  it("cannot be widened by an injected manifest", async () => {
    // A manifest is data. It may describe categories freely, and still cannot
    // hand the reader a table the shipped manifest does not declare.
    const { source, asked } = recordingSource({
      secrets: { kind: "COUNTED", rows: 99 },
    });
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      now,
      manifest: manifestOf({
        id: "smuggled",
        subsystem: "DATABASE",
        disposition: "CLEARED",
        scopeBasis: "ENVIRONMENT_WIDE",
        rowScope: "NOT_APPLICABLE",
        objects: ["secrets"],
        note: "A table nobody approved.",
      }),
    });

    expect(asked).toEqual([]);
    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.categories.smuggled).toEqual({
      kind: "UNAVAILABLE",
      reason: "SUBSYSTEM_NOT_READABLE",
    });
  });
});

describe("demo reset inventory reader scoping", () => {
  it("asks for run-owned rows in the run's scope and nothing wider", async () => {
    const { source, asked } = recordingSource({
      organizations: { kind: "COUNTED", rows: 4 },
      profiles: { kind: "COUNTED", rows: 3 },
      producer_fields: { kind: "COUNTED", rows: 9 },
    });

    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      manifest: MIXED_MANIFEST,
      now,
    });

    // The scope travels with every request, so a source is never left to infer
    // which rows were meant.
    expect(asked).toEqual([
      { object: "organizations", scope: { kind: "ENVIRONMENT" } },
      { object: "profiles", scope: { kind: "ENVIRONMENT" } },
      { object: "producer_fields", scope: { kind: "RUN", run: ESTABLISHED } },
    ]);

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(countedRows(read.inventory, "environment-wide")).toBe(7);
    expect(countedRows(read.inventory, "run-owned")).toBe(9);
  });

  it("carries the proven run, not a bare identifier", async () => {
    const { source, asked } = recordingSource({
      producer_fields: { kind: "COUNTED", rows: 1 },
    });
    await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      now,
      manifest: manifestOf(MIXED_MANIFEST.categories[1]),
    });

    const [request] = asked;
    expect(request.scope.kind).toBe("RUN");
    if (request.scope.kind !== "RUN") return;
    // Environment, dataset and database travel with the run, so a source
    // cannot count a run it was never shown the context for.
    expect(request.scope.run).toEqual({
      kind: "ESTABLISHED",
      runId: "run-a-0000000000000001",
      operatorPrincipalUserId: "operator-1",
      environmentName: "approved-demo-qa",
      datasetId: "demo-dataset-v2",
      databaseRef: APPROVED_REF,
    });
  });

  it("never presents an environment-wide number as a run's number", async () => {
    // A source that ignores the scope and counts the whole table is exactly
    // the accident this guards. The reader still reports what it asked for, so
    // the mismatch is visible in the request rather than hidden in the answer.
    const { source, asked } = recordingSource({
      producer_fields: { kind: "COUNTED", rows: 5000 },
    });
    await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      now,
      manifest: manifestOf(MIXED_MANIFEST.categories[1]),
    });
    expect(asked).toHaveLength(1);
    expect(asked[0].scope).not.toEqual({ kind: "ENVIRONMENT" });
    expect(asked[0].scope).toMatchObject({
      kind: "RUN",
      run: { runId: "run-a-0000000000000001" },
    });
  });

  it("refuses a category it cannot bound to the run at all", async () => {
    const source = forbiddenSource();
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      now,
      manifest: manifestOf(MIXED_MANIFEST.categories[3]),
    });

    expect(source.countRows).not.toHaveBeenCalled();
    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.categories["not-scopable"]).toEqual({
      kind: "UNAVAILABLE",
      reason: "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
    });
    expect(countedRows(read.inventory, "not-scopable")).toBeNull();
  });

  it("counts an exhaustively empty category as zero and reads nothing", async () => {
    const { source, asked } = recordingSource({});
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      now,
      manifest: manifestOf(MIXED_MANIFEST.categories[2]),
    });
    expect(asked).toEqual([]);
    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(countedRows(read.inventory, "no-objects")).toBe(0);
  });

  it("reports a non-database subsystem as unavailable", async () => {
    const source = forbiddenSource();
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      now,
      manifest: manifestOf(MIXED_MANIFEST.categories[4]),
    });
    expect(source.countRows).not.toHaveBeenCalled();
    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.categories.storage).toEqual({
      kind: "UNAVAILABLE",
      reason: "SUBSYSTEM_NOT_READABLE",
    });
  });

  it("records the observation instant and the objects it queried", async () => {
    const { source } = recordingSource({
      producer_fields: { kind: "COUNTED", rows: 2 },
    });
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      now,
      manifest: manifestOf(MIXED_MANIFEST.categories[1]),
    });
    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.source).toBe("OBSERVED");
    expect(read.inventory.observedAt).toBe(OBSERVED_AT);
    expect(read.objectsRead).toEqual(["producer_fields"]);
  });

  it("records no observation instant when the clock is not one", async () => {
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      manifest: manifestOf(MIXED_MANIFEST.categories[2]),
      now: () => "yesterday",
    });
    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(read.inventory.observedAt).toBeNull();
  });
});

describe("demo reset inventory reader on a denied or runless scope", () => {
  const blocked: DemoResetRunScope[] = [
    { kind: "REFUSED", refusal: "ENVIRONMENT_NOT_ELIGIBLE" },
    { kind: "REFUSED", refusal: "ACTOR_NOT_AUTHORIZED" },
    { kind: "REFUSED", refusal: "RUN_NOT_OWNED_BY_ACTOR" },
    { kind: "REFUSED", refusal: "RUN_CONTEXT_MISMATCH" },
    { kind: "NOT_ESTABLISHED", gap: "RUN_INSTANCE_NOT_ISSUED" },
    { kind: "NOT_ESTABLISHED", gap: "RUN_STATE_UNAVAILABLE" },
  ];

  it("issues no request at all", async () => {
    for (const scope of blocked) {
      const source = forbiddenSource();
      const read = await readDemoResetInventory({
        scope,
        source,
        manifest: MIXED_MANIFEST,
        now,
      });
      expect(read, JSON.stringify(scope)).toEqual({
        kind: "NOT_READ",
        scope,
      });
      expect(source.countRows, JSON.stringify(scope)).not.toHaveBeenCalled();
    }
  });

  it("cannot produce a run-owned observation without an established run", async () => {
    // Even against a source that would happily answer, there is no scope to
    // ask in, so there is no observation to report.
    const { source, asked } = recordingSource({
      producer_fields: { kind: "COUNTED", rows: 12 },
    });
    const read = await readDemoResetInventory({
      scope: { kind: "NOT_ESTABLISHED", gap: "RUN_INSTANCE_NOT_ISSUED" },
      source,
      now,
      manifest: manifestOf(MIXED_MANIFEST.categories[1]),
    });
    expect(asked).toEqual([]);
    expect(read.kind).toBe("NOT_READ");
  });
});

describe("demo reset inventory reader fail-closed behaviour", () => {
  it("does not turn a missing source into an absence of rows", async () => {
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      source: null,
      manifest: MIXED_MANIFEST,
      now,
    });
    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(countedRows(read.inventory, "environment-wide")).toBeNull();
    expect(countedRows(read.inventory, "run-owned")).toBeNull();
    expect(read.objectsRead).toEqual([]);
  });

  it("reports an unreadable, throwing or uninterpretable answer as a gap", async () => {
    const cases: Array<[DemoResetRowCount, string]> = [
      [{ kind: "UNREADABLE" }, "SUBSYSTEM_NOT_READABLE"],
      [{ kind: "COUNTED", rows: -1 } as DemoResetRowCount, "OBSERVATION_COUNT_INVALID"],
      [{ kind: "COUNTED", rows: 1.5 } as DemoResetRowCount, "OBSERVATION_COUNT_INVALID"],
      [{ kind: "COUNTED" } as DemoResetRowCount, "OBSERVATION_COUNT_INVALID"],
      [{ kind: "SOMETHING_ELSE" } as unknown as DemoResetRowCount, "OBSERVATION_NOT_INTERPRETABLE"],
    ];

    for (const [answer, reason] of cases) {
      const { source } = recordingSource({ producer_fields: answer });
      const read = await readDemoResetInventory({
        scope: ESTABLISHED,
        source,
        now,
        manifest: manifestOf(MIXED_MANIFEST.categories[1]),
      });
      expect(read.kind).toBe("READ");
      if (read.kind !== "READ") continue;
      expect(read.inventory.categories["run-owned"], reason).toEqual({
        kind: "UNAVAILABLE",
        reason,
      });
    }
  });

  it("swallows a thrown source error rather than leaking it", async () => {
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      now,
      manifest: manifestOf(MIXED_MANIFEST.categories[1]),
      source: {
        async countRows() {
          throw new Error("password authentication failed for user postgres");
        },
      },
    });
    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    const gaps = inventoryGaps(read.inventory);
    expect(JSON.stringify(gaps)).not.toContain("password");
    expect(read.inventory.categories["run-owned"]).toEqual({
      kind: "UNAVAILABLE",
      reason: "SUBSYSTEM_NOT_READABLE",
    });
  });

  it("counts only the shipped categories that can honestly be scoped", async () => {
    const { source, asked } = recordingSource(
      Object.fromEntries(
        DEMO_RESET_READABLE_OBJECTS.map((object) => [
          object,
          { kind: "COUNTED" as const, rows: 1 },
        ]),
      ),
    );
    const read = await readDemoResetInventory({
      scope: ESTABLISHED,
      source,
      now,
    });

    const askedObjects = asked.map((request) => request.object);
    expect(askedObjects).toContain("organizations");
    expect(askedObjects).toContain("producer_fields");
    expect(askedObjects).toContain("demo_reset_run_instances");
    expect(askedObjects).not.toContain("market_core_orders");
    expect(askedObjects).not.toContain("registrar_registered_ownership");
    expect(askedObjects).not.toContain("field_origination_events");
    expect(askedObjects).not.toContain("role_requests");
    expect(askedObjects).not.toContain("app_audit_events");

    const orgRequests = asked.filter(
      (request) => request.object === "organizations",
    );
    expect(orgRequests.map((request) => request.scope.kind).sort()).toEqual([
      "NON_RUN",
      "RUN",
    ]);
    for (const request of orgRequests) {
      if (request.scope.kind === "ENVIRONMENT") {
        throw new Error("run-owned identity fell back to environment-wide");
      }
      expect(request.scope.run.runId).toBe(ESTABLISHED.runId);
    }

    expect(read.kind).toBe("READ");
    if (read.kind !== "READ") return;
    expect(countedRows(read.inventory, "run-created-identity")).not.toBeNull();
    expect(countedRows(read.inventory, "origination-business")).not.toBeNull();
    expect(countedRows(read.inventory, "market-core-business")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  createDemoResetRunStore,
  createSupabaseRunRegistryReader,
  interpretCurrentRunRows,
  parseRunInstance,
  type DemoResetRunRegistryClient,
} from "@/data/demo-reset/postgres-run-store";
import type { DemoResetRunContext } from "@/lib/demo-reset";

const RUN_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001";
const RUN_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002";
const OPERATOR_X = "11111111-1111-4111-8111-111111111101";
const OPERATOR_Y = "11111111-1111-4111-8111-111111111102";
const APPROVED_REF = "examplerefabcdefghij";
const OTHER_REF = "otherrefabcdefghijkl";

const CONTEXT: DemoResetRunContext = {
  principalUserId: OPERATOR_X,
  environmentName: "approved-demo-qa",
  datasetId: "demo-dataset-v2",
  databaseRef: APPROVED_REF,
};

function row(overrides?: Record<string, unknown>) {
  return {
    id: RUN_B,
    operator_principal_user_id: OPERATOR_X,
    environment_name: "approved-demo-qa",
    dataset_id: "demo-dataset-v2",
    database_ref: APPROVED_REF,
    lifecycle_status: "CURRENT",
    ...overrides,
  };
}

describe("parseRunInstance", () => {
  it("accepts a server-issued UUID row", () => {
    expect(parseRunInstance(row())).toEqual({
      runId: RUN_B,
      operatorPrincipalUserId: OPERATOR_X,
      environmentName: "approved-demo-qa",
      datasetId: "demo-dataset-v2",
      databaseRef: APPROVED_REF,
    });
  });

  it("rejects a blank operator or a malformed id", () => {
    expect(
      parseRunInstance(row({ operator_principal_user_id: "   " })),
    ).toBeNull();
    expect(parseRunInstance(row({ id: "short" }))).toBeNull();
  });
});

describe("interpretCurrentRunRows", () => {
  it("returns the single current run and ignores no implicit latest-row rule", () => {
    expect(interpretCurrentRunRows([row({ id: RUN_B })])).toEqual({
      kind: "RUN",
      run: {
        runId: RUN_B,
        operatorPrincipalUserId: OPERATOR_X,
        environmentName: "approved-demo-qa",
        datasetId: "demo-dataset-v2",
        databaseRef: APPROVED_REF,
      },
    });
  });

  it("returns NO_RUN for an empty result", () => {
    expect(interpretCurrentRunRows([])).toEqual({ kind: "NO_RUN" });
  });

  it("fails closed when two current rows exist rather than picking one", () => {
    expect(
      interpretCurrentRunRows([row({ id: RUN_A }), row({ id: RUN_B })]),
    ).toEqual({
      kind: "UNAVAILABLE",
    });
  });

  it("fails closed on a single unusable row", () => {
    expect(interpretCurrentRunRows([row({ id: "" })])).toEqual({
      kind: "UNAVAILABLE",
    });
  });
});

describe("createDemoResetRunStore", () => {
  it("returns Run B when the reader supplies only the current row", async () => {
    const store = createDemoResetRunStore({
      async readCurrentRuns() {
        return { kind: "OK", rows: [row({ id: RUN_B })] };
      },
    });
    await expect(store.currentRunInstance(CONTEXT)).resolves.toMatchObject({
      kind: "RUN",
      run: { runId: RUN_B },
    });
  });

  it("does not silently return historical Run A", async () => {
    const store = createDemoResetRunStore({
      async readCurrentRuns() {
        return { kind: "OK", rows: [row({ id: RUN_B })] };
      },
    });
    const lookup = await store.currentRunInstance(CONTEXT);
    expect(lookup).not.toMatchObject({ run: { runId: RUN_A } });
  });

  it("treats a reader error as UNAVAILABLE, not NO_RUN", async () => {
    const store = createDemoResetRunStore({
      async readCurrentRuns() {
        return { kind: "ERROR" };
      },
    });
    await expect(store.currentRunInstance(CONTEXT)).resolves.toEqual({
      kind: "UNAVAILABLE",
    });
  });

  it("treats a thrown reader as UNAVAILABLE without leaking the error", async () => {
    const store = createDemoResetRunStore({
      async readCurrentRuns() {
        throw new Error("password authentication failed for user postgres");
      },
    });
    const lookup = await store.currentRunInstance(CONTEXT);
    expect(lookup).toEqual({ kind: "UNAVAILABLE" });
    expect(JSON.stringify(lookup)).not.toContain("password");
  });
});

function recordingRegistryClient(result: {
  data: unknown;
  error: { message?: string } | null;
}): {
  client: DemoResetRunRegistryClient;
  eqs: Array<[string, string]>;
  tables: string[];
  limited: boolean;
} {
  const eqs: Array<[string, string]> = [];
  const tables: string[] = [];
  let limited = false;
  const builder = {
    eq(column: string, value: string) {
      eqs.push([column, value]);
      return builder;
    },
    limit() {
      limited = true;
      return builder;
    },
    then(
      resolve: (value: {
        data: unknown;
        error: { message?: string } | null;
      }) => unknown,
    ) {
      return Promise.resolve(resolve(result));
    },
  };
  return {
    eqs,
    tables,
    get limited() {
      return limited;
    },
    client: {
      from(table: string) {
        tables.push(table);
        return {
          select() {
            return builder;
          },
        };
      },
    },
  };
}

describe("createSupabaseRunRegistryReader", () => {
  it("scopes by the trusted context and current status only", async () => {
    const { client, eqs, tables, limited } = recordingRegistryClient({
      data: [row()],
      error: null,
    });
    const reader = createSupabaseRunRegistryReader({
      async createClient() {
        return client;
      },
    });

    const result = await reader.readCurrentRuns(CONTEXT);

    expect(tables).toEqual(["demo_reset_run_instances"]);
    expect(eqs).toEqual([
      ["operator_principal_user_id", OPERATOR_X],
      ["environment_name", "approved-demo-qa"],
      ["dataset_id", "demo-dataset-v2"],
      ["database_ref", APPROVED_REF],
      ["lifecycle_status", "CURRENT"],
    ]);
    expect(eqs.map(([column]) => column)).not.toContain("id");
    expect(limited).toBe(false);
    expect(result).toEqual({ kind: "OK", rows: [row()] });
  });

  it("never uses a caller-supplied run id as a lookup key", async () => {
    const { client, eqs } = recordingRegistryClient({
      data: [row()],
      error: null,
    });
    const reader = createSupabaseRunRegistryReader({
      async createClient() {
        return client;
      },
    });
    await reader.readCurrentRuns({
      ...CONTEXT,
      principalUserId: OPERATOR_Y,
    });
    expect(eqs).toContainEqual(["operator_principal_user_id", OPERATOR_Y]);
    expect(eqs.map(([column]) => column)).not.toContain("id");
    expect(JSON.stringify(eqs)).not.toContain(RUN_A);
    expect(JSON.stringify(eqs)).not.toContain(RUN_B);
  });

  it("does not resolve another environment or database", async () => {
    const { client, eqs } = recordingRegistryClient({
      data: [],
      error: null,
    });
    const reader = createSupabaseRunRegistryReader({
      async createClient() {
        return client;
      },
    });
    await reader.readCurrentRuns({
      ...CONTEXT,
      databaseRef: OTHER_REF,
    });
    expect(eqs).toContainEqual(["database_ref", OTHER_REF]);
    expect(eqs).not.toContainEqual(["database_ref", APPROVED_REF]);
  });

  it("reports a missing client or query error as ERROR", async () => {
    const missing = createSupabaseRunRegistryReader({
      async createClient() {
        return null;
      },
    });
    await expect(missing.readCurrentRuns(CONTEXT)).resolves.toEqual({
      kind: "ERROR",
    });

    const { client } = recordingRegistryClient({
      data: null,
      error: { message: "relation does not exist" },
    });
    const failing = createSupabaseRunRegistryReader({
      async createClient() {
        return client;
      },
    });
    await expect(failing.readCurrentRuns(CONTEXT)).resolves.toEqual({
      kind: "ERROR",
    });
  });
});

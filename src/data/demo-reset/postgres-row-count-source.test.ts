import { describe, expect, it } from "vitest";
import {
  createPostgresDemoResetRowCountSource,
  DEMO_RESET_COUNTABLE_OBJECTS,
  objectSupportsCountScope,
} from "@/data/demo-reset/postgres-row-count-source";
import {
  readableObject,
  type DemoResetCountRequest,
  type DemoResetEstablishedRunScope,
} from "@/lib/demo-reset";

const RUN_X = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001";
const RUN_Y = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002";

const ESTABLISHED: DemoResetEstablishedRunScope = {
  kind: "ESTABLISHED",
  runId: RUN_X,
  operatorPrincipalUserId: "11111111-1111-4111-8111-111111111101",
  environmentName: "approved-demo-qa",
  datasetId: "demo-dataset-v2",
  databaseRef: "examplerefabcdefghij",
};

function request(
  objectName: string,
  scope: DemoResetCountRequest["scope"],
): DemoResetCountRequest {
  const object = readableObject(objectName);
  if (!object) {
    throw new Error(`unreadable object ${objectName}`);
  }
  return { object, scope };
}

describe("objectSupportsCountScope", () => {
  it("allows run-owned identity and origination roots", () => {
    expect(objectSupportsCountScope("organizations", "RUN")).toBe(true);
    expect(objectSupportsCountScope("producer_fields", "RUN")).toBe(true);
    expect(objectSupportsCountScope("origination_dac_messages", "RUN")).toBe(
      true,
    );
  });

  it("refuses a RUN count on profiles, sessions and the registry", () => {
    expect(objectSupportsCountScope("profiles", "RUN")).toBe(false);
    expect(objectSupportsCountScope("session_contexts", "RUN")).toBe(false);
    expect(objectSupportsCountScope("demo_reset_run_instances", "RUN")).toBe(
      false,
    );
  });

  it("refuses Market Core, Registrar, events and arbitrary names", () => {
    for (const name of [
      "market_core_orders",
      "registrar_registered_ownership",
      "field_origination_events",
      "app_audit_events",
      "auth.users",
      "secrets",
    ]) {
      expect(objectSupportsCountScope(name, "RUN"), name).toBe(false);
    }
  });
});

describe("createPostgresDemoResetRowCountSource", () => {
  it("passes the established Run X to the allowlisted RPC", async () => {
    const calls: unknown[] = [];
    const source = createPostgresDemoResetRowCountSource({
      async createClient() {
        return {
          async rpc(fn, args) {
            calls.push({ fn, args });
            return { data: 3, error: null };
          },
        };
      },
    });

    await expect(
      source.countRows(
        request("organizations", { kind: "RUN", run: ESTABLISHED }),
      ),
    ).resolves.toEqual({ kind: "COUNTED", rows: 3 });

    expect(calls).toEqual([
      {
        fn: "demo_reset_count_rows",
        args: {
          p_object: "organizations",
          p_scope: "RUN",
          p_run_id: RUN_X,
        },
      },
    ]);
    expect(JSON.stringify(calls)).not.toContain(RUN_Y);
  });

  it("counts NON_RUN without falling back to an environment-wide query", async () => {
    const calls: unknown[] = [];
    const source = createPostgresDemoResetRowCountSource({
      async createClient() {
        return {
          async rpc(fn, args) {
            calls.push({ fn, args });
            return { data: 12, error: null };
          },
        };
      },
    });

    await expect(
      source.countRows(
        request("organizations", { kind: "NON_RUN", run: ESTABLISHED }),
      ),
    ).resolves.toEqual({ kind: "COUNTED", rows: 12 });
    expect(calls).toEqual([
      {
        fn: "demo_reset_count_rows",
        args: {
          p_object: "organizations",
          p_scope: "NON_RUN",
          p_run_id: null,
        },
      },
    ]);
  });

  it("does not query when the object cannot honour the requested scope", async () => {
    let called = false;
    const source = createPostgresDemoResetRowCountSource({
      async createClient() {
        called = true;
        return {
          async rpc() {
            return { data: 99, error: null };
          },
        };
      },
    });

    await expect(
      source.countRows(request("profiles", { kind: "RUN", run: ESTABLISHED })),
    ).resolves.toEqual({ kind: "UNREADABLE" });
    await expect(
      source.countRows(
        request("market_core_orders", { kind: "RUN", run: ESTABLISHED }),
      ),
    ).resolves.toEqual({ kind: "UNREADABLE" });
    expect(called).toBe(false);
  });

  it("turns a missing client, RPC error or unsafe count into UNREADABLE", async () => {
    const missing = createPostgresDemoResetRowCountSource({
      async createClient() {
        return null;
      },
    });
    await expect(
      missing.countRows(
        request("producer_fields", { kind: "RUN", run: ESTABLISHED }),
      ),
    ).resolves.toEqual({ kind: "UNREADABLE" });

    const failing = createPostgresDemoResetRowCountSource({
      async createClient() {
        return {
          async rpc() {
            return { data: null, error: { message: "object_not_countable" } };
          },
        };
      },
    });
    await expect(
      failing.countRows(
        request("producer_fields", { kind: "RUN", run: ESTABLISHED }),
      ),
    ).resolves.toEqual({ kind: "UNREADABLE" });

    const invalid = createPostgresDemoResetRowCountSource({
      async createClient() {
        return {
          async rpc() {
            return { data: -1, error: null };
          },
        };
      },
    });
    await expect(
      invalid.countRows(
        request("producer_fields", { kind: "RUN", run: ESTABLISHED }),
      ),
    ).resolves.toEqual({ kind: "UNREADABLE" });
  });

  it("does not leak a database error from a thrown client", async () => {
    const source = createPostgresDemoResetRowCountSource({
      async createClient() {
        throw new Error("password authentication failed for user postgres");
      },
    });
    const result = await source.countRows(
      request("organizations", { kind: "RUN", run: ESTABLISHED }),
    );
    expect(result).toEqual({ kind: "UNREADABLE" });
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("lists exactly the objects the count RPC can name", () => {
    expect(DEMO_RESET_COUNTABLE_OBJECTS).toContain("organizations");
    expect(DEMO_RESET_COUNTABLE_OBJECTS).toContain("producer_fields");
    expect(DEMO_RESET_COUNTABLE_OBJECTS).not.toContain(
      "field_origination_events",
    );
    expect(DEMO_RESET_COUNTABLE_OBJECTS).not.toContain("market_core_orders");
  });
});

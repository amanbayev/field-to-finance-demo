/**
 * Read-only Postgres implementation of `DemoResetRunStore`.
 *
 * The store answers one question: which run does this operator currently hold
 * in this approved context? It never looks a run up by a caller-supplied
 * identifier, never inserts or updates a registry row, and never treats
 * "latest created_at" as current.
 *
 * Production uses the session client so RLS (`operator_principal_user_id =
 * auth.uid()` and system-admin) applies. Service role is not required for
 * this read: the table is granted SELECT to authenticated under that policy.
 */

import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import {
  isDemoResetRunInstanceId,
  type DemoResetRunContext,
  type DemoResetRunInstance,
  type DemoResetRunLookup,
  type DemoResetRunStore,
} from "@/lib/demo-reset";

const REGISTRY_TABLE = "demo_reset_run_instances";

const REGISTRY_COLUMNS =
  "id, operator_principal_user_id, environment_name, dataset_id, database_ref, lifecycle_status";

export type CurrentRunRowsResult =
  | { kind: "OK"; rows: readonly unknown[] }
  | { kind: "ERROR" };

export interface DemoResetRunRegistryReader {
  readCurrentRuns(context: DemoResetRunContext): Promise<CurrentRunRowsResult>;
}

function establishedPrincipalUserId(value: unknown): string | null {
  const principalUserId = typeof value === "string" ? value.trim() : "";
  return principalUserId === "" ? null : principalUserId;
}

function textField(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * A registry row is usable only when every field the domain will trust is
 * present. The client types a row as `unknown` in practice.
 */
export function parseRunInstance(row: unknown): DemoResetRunInstance | null {
  if (row === null || typeof row !== "object") {
    return null;
  }
  const candidate = row as Record<string, unknown>;
  const runId = candidate.id;
  const operatorPrincipalUserId = establishedPrincipalUserId(
    candidate.operator_principal_user_id,
  );
  const environmentName = textField(candidate.environment_name);
  const datasetId = textField(candidate.dataset_id);
  const databaseRef = textField(candidate.database_ref);
  if (
    !isDemoResetRunInstanceId(runId) ||
    operatorPrincipalUserId === null ||
    environmentName === null ||
    datasetId === null ||
    databaseRef === null
  ) {
    return null;
  }
  return {
    runId,
    operatorPrincipalUserId,
    environmentName,
    datasetId,
    databaseRef,
  };
}

/**
 * Interprets the rows of a current-run query.
 *
 * Zero rows is `NO_RUN`. Two or more is `UNAVAILABLE`: the unique index should
 * have made that impossible, and selecting one of them would hide corruption.
 * A single unusable row is also `UNAVAILABLE`, not an invented run.
 */
export function interpretCurrentRunRows(
  rows: readonly unknown[],
): DemoResetRunLookup {
  if (rows.length === 0) {
    return { kind: "NO_RUN" };
  }
  if (rows.length !== 1) {
    return { kind: "UNAVAILABLE" };
  }
  const run = parseRunInstance(rows[0]);
  if (!run) {
    return { kind: "UNAVAILABLE" };
  }
  return { kind: "RUN", run };
}

export function createDemoResetRunStore(
  reader: DemoResetRunRegistryReader,
): DemoResetRunStore {
  return {
    async currentRunInstance(
      context: DemoResetRunContext,
    ): Promise<DemoResetRunLookup> {
      let result: CurrentRunRowsResult;
      try {
        result = await reader.readCurrentRuns(context);
      } catch {
        return { kind: "UNAVAILABLE" };
      }
      if (result.kind !== "OK") {
        return { kind: "UNAVAILABLE" };
      }
      return interpretCurrentRunRows(result.rows);
    },
  };
}

type RegistryQueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

type RegistryFilterBuilder = {
  eq(column: string, value: string): RegistryFilterBuilder;
};

export interface DemoResetRunRegistryClient {
  from(table: string): {
    select(columns: string): RegistryFilterBuilder;
  };
}

export function createSupabaseRunRegistryReader(input: {
  createClient: () => Promise<DemoResetRunRegistryClient | null>;
}): DemoResetRunRegistryReader {
  return {
    async readCurrentRuns(
      context: DemoResetRunContext,
    ): Promise<CurrentRunRowsResult> {
      const client = await input.createClient();
      if (!client) {
        return { kind: "ERROR" };
      }

      const query = client
        .from(REGISTRY_TABLE)
        .select(REGISTRY_COLUMNS)
        .eq("operator_principal_user_id", context.principalUserId)
        .eq("environment_name", context.environmentName)
        .eq("dataset_id", context.datasetId)
        .eq("database_ref", context.databaseRef)
        .eq("lifecycle_status", "CURRENT");

      const { data, error } = await (query as unknown as Promise<RegistryQueryResult>);
      if (error) {
        return { kind: "ERROR" };
      }
      if (!Array.isArray(data)) {
        return { kind: "ERROR" };
      }
      return { kind: "OK", rows: data };
    },
  };
}

export function createPostgresDemoResetRunStore(input: {
  createClient: () => Promise<DemoResetRunRegistryClient | null>;
}): DemoResetRunStore {
  return createDemoResetRunStore(createSupabaseRunRegistryReader(input));
}

export function createProductionDemoResetRunStore(): DemoResetRunStore {
  return createPostgresDemoResetRunStore({
    async createClient() {
      const client = await createServerSupabaseClient();
      return client as DemoResetRunRegistryClient | null;
    },
  });
}

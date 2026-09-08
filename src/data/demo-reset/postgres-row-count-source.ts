/**
 * Read-only Postgres implementation of `DemoResetRowCountSource`.
 *
 * Counts go through `demo_reset_count_rows`, a closed CASE of approved object
 * names. This module never interpolates a table name into a query and never
 * accepts an arbitrary filter from a request.
 *
 * Service role is required: origination tables revoke all privileges from
 * `authenticated`, and the count RPC is granted to `service_role` alone. The
 * client stays inside this server-only module.
 */

import { createServiceRoleClient } from "@/lib/auth/supabase/admin";
import {
  isValidRowCount,
  type DemoResetCountRequest,
  type DemoResetCountScope,
  type DemoResetReadableObject,
  type DemoResetRowCount,
  type DemoResetRowCountSource,
} from "@/lib/demo-reset";

/**
 * Objects `demo_reset_count_rows` can count, transcribed from the migration.
 *
 * A name on the manifest allowlist that is not here is unreadable — Market
 * Core, Registrar and event tables stay uncounted on purpose.
 */
export const DEMO_RESET_COUNTABLE_OBJECTS = [
  "organizations",
  "memberships",
  "membership_roles",
  "demo_personas",
  "profiles",
  "session_contexts",
  "producer_fields",
  "field_submissions",
  "field_documents",
  "field_upload_intents",
  "field_verification_cases",
  "field_cadastre_verifications",
  "field_verification_evidence",
  "field_verification_messages",
  "verified_field_snapshots",
  "origination_dacs",
  "origination_dac_messages",
  "demo_reset_run_instances",
] as const;

export type DemoResetCountableObject =
  (typeof DEMO_RESET_COUNTABLE_OBJECTS)[number];

const COUNTABLE: ReadonlySet<string> = new Set(DEMO_RESET_COUNTABLE_OBJECTS);

/** Objects that have no run-ownership expression and refuse a RUN count. */
const NEVER_RUN_OWNED: ReadonlySet<string> = new Set([
  "profiles",
  "session_contexts",
  "demo_reset_run_instances",
]);

/** The run registry is preserved environment-wide; it is not a row-owned set. */
const ENVIRONMENT_ONLY: ReadonlySet<string> = new Set([
  "demo_reset_run_instances",
]);

export function isDemoResetCountableObject(
  name: string,
): name is DemoResetCountableObject {
  return COUNTABLE.has(name);
}

export function objectSupportsCountScope(
  object: string,
  scopeKind: DemoResetCountScope["kind"],
): boolean {
  if (!COUNTABLE.has(object)) {
    return false;
  }
  if (ENVIRONMENT_ONLY.has(object)) {
    return scopeKind === "ENVIRONMENT";
  }
  if (scopeKind === "RUN" && NEVER_RUN_OWNED.has(object)) {
    return false;
  }
  return true;
}

function rpcScope(
  scope: DemoResetCountScope,
): "RUN" | "NON_RUN" | "ENVIRONMENT" {
  return scope.kind;
}

function rpcRunId(scope: DemoResetCountScope): string | null {
  return scope.kind === "RUN" ? scope.run.runId : null;
}

function asRowCount(value: unknown): DemoResetRowCount {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return asRowCount(parsed);
  }
  if (!isValidRowCount(value)) {
    return { kind: "UNREADABLE" };
  }
  return { kind: "COUNTED", rows: value };
}

export interface DemoResetCountRpcClient {
  rpc(
    fn: string,
    args: {
      p_object: string;
      p_scope: string;
      p_run_id: string | null;
    },
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export function createPostgresDemoResetRowCountSource(input: {
  createClient: () => Promise<DemoResetCountRpcClient | null>;
}): DemoResetRowCountSource {
  return {
    async countRows(
      request: DemoResetCountRequest,
    ): Promise<DemoResetRowCount> {
      const object: DemoResetReadableObject = request.object;
      if (!objectSupportsCountScope(object, request.scope.kind)) {
        return { kind: "UNREADABLE" };
      }

      let client: DemoResetCountRpcClient | null;
      try {
        client = await input.createClient();
      } catch {
        return { kind: "UNREADABLE" };
      }
      if (!client) {
        return { kind: "UNREADABLE" };
      }

      try {
        const { data, error } = await client.rpc("demo_reset_count_rows", {
          p_object: object,
          p_scope: rpcScope(request.scope),
          p_run_id: rpcRunId(request.scope),
        });
        if (error) {
          return { kind: "UNREADABLE" };
        }
        return asRowCount(data);
      } catch {
        return { kind: "UNREADABLE" };
      }
    },
  };
}

export function createProductionDemoResetRowCountSource(): DemoResetRowCountSource {
  return createPostgresDemoResetRowCountSource({
    async createClient() {
      return createServiceRoleClient();
    },
  });
}

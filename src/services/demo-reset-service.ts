/**
 * Server-side seam for the Dataset V2 reset dry-run.
 *
 * This module is the only place that reads `process.env` for demo-reset
 * policy, mirroring how `src/services/origination-service.ts` feeds
 * `resolveOriginationBackend`. Every decision itself lives in the pure
 * `src/lib/demo-reset` modules.
 *
 * There is deliberately **no executing path**: no endpoint, no server action,
 * no command, and no database, Auth, Storage or chain client. A dry-run
 * changes nothing. GP-01 adds the run-ownership schema and a scoped inventory
 * reader; GP-02 adds confirmed execution.
 *
 * The dry-run composition runs in one fixed order, and each stage is a gate
 * rather than a hint to the next one:
 *
 *   trusted actor -> runtime and actor policy -> run ownership
 *     -> inventory read -> planner
 *
 * A refusal at any stage returns immediately. The inventory reader is not
 * called once ownership is refused, and the planner is not called once the
 * read is refused, so a denied request reaches neither.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.
 */

import { actorCan, principalCan, type ActorContext } from "@/domain/identity";
import { getSupabaseUrl } from "@/lib/auth/env";
import { isDesignPreviewActor } from "@/lib/auth/design-preview";
import {
  DEMO_RESET_PERMISSION,
  evaluateDemoResetDryRunPolicy,
  planDemoResetDryRun,
  readDemoResetInventory,
  resolveDemoResetRunScope,
  unavailableDemoResetInventory,
  type DemoResetActorFacts,
  type DemoResetDryRunAuthorization,
  type DemoResetDryRunPlan,
  type DemoResetEnvironmentSignals,
  type DemoResetManifest,
  type DemoResetRowCountSource,
  type DemoResetRunScope,
} from "@/lib/demo-reset";

/**
 * Operator declarations are separate variables on purpose: no single flag can
 * authorize a reset, and none of them has a default.
 */
export function demoResetEnvironmentSignals(): DemoResetEnvironmentSignals {
  return {
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    publicAppEnv: process.env.NEXT_PUBLIC_APP_ENV,
    declaredEnvironment: process.env.DEMO_RESET_ENVIRONMENT,
    declaredDatasetId: process.env.DEMO_RESET_DATASET_ID,
    declaredDatabaseRef: process.env.DEMO_RESET_DATABASE_REF,
    observedSupabaseUrl: getSupabaseUrl(),
  };
}

/**
 * Both the effective persona and the real principal must hold the permission,
 * and reset authority is never exercised through impersonation or through the
 * local design-preview actor.
 */
export function demoResetActorFacts(actor: ActorContext): DemoResetActorFacts {
  return {
    principalUserId: actor.principal.userId,
    effectiveHoldsPermission: actorCan(actor, DEMO_RESET_PERMISSION),
    principalHoldsPermission: principalCan(actor, DEMO_RESET_PERMISSION),
    isImpersonating: actor.isImpersonating,
    isDesignPreviewActor: isDesignPreviewActor(actor),
  };
}

export function authorizeDemoResetDryRun(
  actor: ActorContext,
): DemoResetDryRunAuthorization {
  return evaluateDemoResetDryRunPolicy({
    signals: demoResetEnvironmentSignals(),
    actor: demoResetActorFacts(actor),
  });
}

/**
 * Plans the reset without establishing a run and without observing anything.
 *
 * Every category is reported unavailable and no run scope is claimed, so the
 * plan resolves to `INCOMPLETE` rather than presenting an empty environment as
 * ready. This is the shape of a dry-run with no reader attached; the
 * ownership-aware path is `planDemoDatasetV2ResetDryRunForActor`.
 *
 * It takes no inventory or run identifier from its caller on purpose. An
 * inventory supplied from outside would be presented as observed, and a run
 * identifier supplied from outside would establish scope that nothing has
 * proven. Both are decided by the composition below instead.
 */
export function planDemoDatasetV2ResetDryRun(
  actor: ActorContext,
): DemoResetDryRunPlan {
  return planDemoResetDryRun({
    authorization: authorizeDemoResetDryRun(actor),
    inventory: unavailableDemoResetInventory(
      "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
    ),
    runId: null,
  });
}

/**
 * The dry-run seen from outside: a refusal, or a plan over an observed
 * inventory for a run the actor is proven to own.
 *
 * `DENIED` carries the authorization so an operator still sees every runtime
 * and actor refusal, and the single run-scope reason. It carries no plan,
 * because there is nothing legitimate to plan over.
 */
export type DemoResetDryRunOutcome =
  | {
      kind: "DENIED";
      authorization: DemoResetDryRunAuthorization;
      runScope: Extract<DemoResetRunScope, { kind: "NOT_ESTABLISHED" }>;
    }
  | {
      kind: "PLANNED";
      authorization: DemoResetDryRunAuthorization;
      runScope: Extract<DemoResetRunScope, { kind: "ESTABLISHED" }>;
      plan: DemoResetDryRunPlan;
      /** Declared objects the reader queried. Empty when it queried none. */
      objectsRead: readonly string[];
    };

/**
 * Composes the dry-run for one trusted actor.
 *
 * `actor` is an `ActorContext`, which callers obtain from `requireActor()` or
 * a `requirePermission(...)` guard — that is, from a verified session, never
 * from a request body. `claimedRunId` is the opposite: it models an untrusted
 * value, is typed `unknown`, and can only ever cause a refusal, because the
 * run this actor owns is derived server-side either way.
 *
 * No database-backed count source is wired here. Against the shipped manifest
 * the reader has nothing it may truthfully count, so passing one would add a
 * dependency that is never exercised; `source` is the seam the remaining
 * GP-01 run-isolation work fills in.
 */
export async function planDemoDatasetV2ResetDryRunForActor(
  actor: ActorContext,
  options?: {
    /** Untrusted. Compared against the derived run, never used as a lookup. */
    claimedRunId?: unknown;
    source?: DemoResetRowCountSource | null;
    manifest?: DemoResetManifest;
    /** Injected clock, so an observation instant is reproducible in a test. */
    now?: () => string;
  },
): Promise<DemoResetDryRunOutcome> {
  const authorization = authorizeDemoResetDryRun(actor);

  const runScope = resolveDemoResetRunScope({
    authorization,
    claimedRunId: options?.claimedRunId,
  });
  if (runScope.kind !== "ESTABLISHED") {
    return Object.freeze({ kind: "DENIED" as const, authorization, runScope });
  }

  const read = await readDemoResetInventory({
    scope: runScope,
    source: options?.source ?? null,
    manifest: options?.manifest,
    now: options?.now,
  });
  // Unreachable while the scope is established, and handled rather than
  // asserted away: the reader owns that decision, so a future reason to refuse
  // a read must deny here instead of reaching the planner.
  if (read.kind !== "READ") {
    return Object.freeze({
      kind: "DENIED" as const,
      authorization,
      runScope: Object.freeze({
        kind: "NOT_ESTABLISHED" as const,
        refusal: read.refusal,
      }),
    });
  }

  return Object.freeze({
    kind: "PLANNED" as const,
    authorization,
    runScope,
    plan: planDemoResetDryRun({
      authorization,
      inventory: read.inventory,
      runId: runScope.runId,
      manifest: options?.manifest,
      generatedAt: options?.now?.(),
    }),
    objectsRead: read.objectsRead,
  });
}

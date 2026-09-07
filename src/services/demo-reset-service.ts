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
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.
 */

import { actorCan, principalCan, type ActorContext } from "@/domain/identity";
import { getSupabaseUrl } from "@/lib/auth/env";
import { isDesignPreviewActor } from "@/lib/auth/design-preview";
import {
  DEMO_RESET_PERMISSION,
  evaluateDemoResetDryRunPolicy,
  planDemoResetDryRun,
  unavailableDemoResetInventory,
  type DemoResetActorFacts,
  type DemoResetDryRunAuthorization,
  type DemoResetDryRunPlan,
  type DemoResetEnvironmentSignals,
  type DemoResetInventory,
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
 * Plans the reset without touching anything.
 *
 * No run-scoped inventory reader exists, and an unscoped count would breach
 * the rule that inventory information is itself scope-limited. The inventory
 * therefore reports every category as unavailable, which resolves the plan to
 * `INCOMPLETE` rather than presenting an empty environment as ready.
 */
export function planDemoDatasetV2ResetDryRun(
  actor: ActorContext,
  options?: { inventory?: DemoResetInventory; runId?: string | null },
): DemoResetDryRunPlan {
  return planDemoResetDryRun({
    authorization: authorizeDemoResetDryRun(actor),
    inventory:
      options?.inventory ??
      unavailableDemoResetInventory("RUN_SCOPED_INVENTORY_SOURCE_ABSENT"),
    runId: options?.runId ?? null,
  });
}

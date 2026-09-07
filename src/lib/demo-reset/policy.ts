/**
 * Server-side authorization policy for a demo reset dry-run.
 *
 * Pure and injectable. The caller supplies already-resolved actor facts so
 * this module does not import the identity, Next.js or Supabase graphs, and
 * can be exercised directly in the node test environment.
 *
 * Reset authority is never granted through impersonation and never through the
 * local design-preview actor, which is a synthetic `SYSTEM_ADMIN` principal
 * with no real database authorization (`src/lib/auth/design-preview.ts`).
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §4 and §9.
 */

import {
  resolveDemoResetEnvironment,
  type DemoResetEnvironmentRefusal,
  type DemoResetEnvironmentResolution,
  type DemoResetEnvironmentSignals,
} from "./environment";

/** The permission that gates the demo-reset workspace. */
export const DEMO_RESET_PERMISSION = "admin.demo_reset" as const;

export const DEMO_RESET_ACTOR_REFUSALS = [
  "ACTOR_PERMISSION_MISSING",
  "PRINCIPAL_PERMISSION_MISSING",
  "IMPERSONATED_ACTOR_DENIED",
  "DESIGN_PREVIEW_ACTOR_DENIED",
] as const;

export type DemoResetActorRefusal = (typeof DEMO_RESET_ACTOR_REFUSALS)[number];

export type DemoResetRefusal =
  | DemoResetEnvironmentRefusal
  | DemoResetActorRefusal;

/**
 * Narrow structural view of an actor. `src/services/demo-reset-service.ts`
 * derives this from `ActorContext` using the production `actorCan`,
 * `principalCan` and `isDesignPreviewActor` helpers.
 */
export type DemoResetActorFacts = {
  principalUserId: string;
  /** `actorCan(actor, "admin.demo_reset")` — the effective persona. */
  effectiveHoldsPermission: boolean;
  /** `principalCan(actor, "admin.demo_reset")` — the real signed-in user. */
  principalHoldsPermission: boolean;
  isImpersonating: boolean;
  isDesignPreviewActor: boolean;
};

export type DemoResetDryRunAuthorization = {
  decision: "ALLOWED" | "DENIED";
  refusals: readonly DemoResetRefusal[];
  environment: DemoResetEnvironmentResolution;
  principalUserId: string;
};

export function evaluateDemoResetActor(
  actor: DemoResetActorFacts,
): readonly DemoResetActorRefusal[] {
  const refusals: DemoResetActorRefusal[] = [];
  if (actor.isDesignPreviewActor) {
    refusals.push("DESIGN_PREVIEW_ACTOR_DENIED");
  }
  if (actor.isImpersonating) {
    refusals.push("IMPERSONATED_ACTOR_DENIED");
  }
  if (!actor.principalHoldsPermission) {
    refusals.push("PRINCIPAL_PERMISSION_MISSING");
  }
  if (!actor.effectiveHoldsPermission) {
    refusals.push("ACTOR_PERMISSION_MISSING");
  }
  return Object.freeze(refusals);
}

/**
 * Combines environment eligibility with server-side actor authority.
 * Both must pass. Refusals from both sources are reported together so an
 * operator sees every reason at once instead of fixing them one at a time.
 */
export function evaluateDemoResetDryRunPolicy(input: {
  signals: DemoResetEnvironmentSignals;
  actor: DemoResetActorFacts;
}): DemoResetDryRunAuthorization {
  const environment = resolveDemoResetEnvironment(input.signals);
  const refusals: DemoResetRefusal[] = [
    ...environment.refusals,
    ...evaluateDemoResetActor(input.actor),
  ];

  return Object.freeze({
    decision: refusals.length === 0 ? "ALLOWED" : "DENIED",
    refusals: Object.freeze([...new Set(refusals)]),
    environment,
    principalUserId: input.actor.principalUserId,
  });
}

/**
 * Server-side seam for the Dataset V2 reset dry-run.
 *
 * This module is the only place that reads `process.env` for demo-reset
 * policy, mirroring how `src/services/origination-service.ts` feeds
 * `resolveOriginationBackend`. Every decision itself lives in the pure
 * `src/lib/demo-reset` modules.
 *
 * There is deliberately **no executing path**: no endpoint, no server action,
 * no command, and no deletion. A dry-run changes nothing. The remaining GP-01
 * work is Market Core / Registrar / event isolation; GP-02 adds confirmed
 * execution. The store and count source live in `src/data/demo-reset` so this
 * module still constructs no client of its own.
 *
 * Two compositions live here on purpose. `composeDemoResetDryRun` takes every
 * dependency explicitly and is the internal wiring and test seam;
 * `planDemoDatasetV2ResetDryRunForActor` is what a request-facing caller uses
 * and fixes the manifest, the run store and the count source, so no request
 * can choose them.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.
 */

import { createProductionDemoResetRowCountSource } from "@/data/demo-reset/postgres-row-count-source";
import { createProductionDemoResetRunStore } from "@/data/demo-reset/postgres-run-store";
import { actorCan, principalCan, type ActorContext } from "@/domain/identity";
import { getSupabaseUrl } from "@/lib/auth/env";
import { isDesignPreviewActor } from "@/lib/auth/design-preview";
import {
  DEMO_RESET_PERMISSION,
  evaluateDemoResetDryRunPolicy,
  planDemoResetDryRun,
  readDemoResetInventory,
  resolveDemoResetRunContext,
  resolveDemoResetRunScope,
  unavailableDemoResetInventory,
  type DemoResetActorFacts,
  type DemoResetDryRunAuthorization,
  type DemoResetDryRunPlan,
  type DemoResetEnvironmentSignals,
  type DemoResetManifest,
  type DemoResetRowCountSource,
  type DemoResetRunContext,
  type DemoResetRunLookup,
  type DemoResetRunScope,
  type DemoResetRunStore,
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
 * The dry-run seen from outside: a refusal, or a plan.
 *
 * `DENIED` means the request asserted something untrue — a forbidden runtime,
 * an actor without authority, a run that is not this actor's. It carries the
 * authorization so an operator still sees every refusal, and no plan, because
 * there is nothing legitimate to plan over.
 *
 * `PLANNED` covers both a proven run and the ordinary case where the server
 * simply has no run to offer. The second is not a refusal: the request was
 * legitimate, so it earns a plan, but that plan carries no run identifier and
 * resolves to `INCOMPLETE`. Reporting "no run instance has been issued" as a
 * denial would misdescribe a healthy environment that nobody has started a
 * Golden Path run in.
 */
export type DemoResetDryRunOutcome =
  | {
      kind: "DENIED";
      authorization: DemoResetDryRunAuthorization;
      runScope: Extract<DemoResetRunScope, { kind: "REFUSED" }>;
    }
  | {
      kind: "PLANNED";
      authorization: DemoResetDryRunAuthorization;
      runScope: Exclude<DemoResetRunScope, { kind: "REFUSED" }>;
      plan: DemoResetDryRunPlan;
      /** Approved objects the reader queried. Empty when it queried none. */
      objectsRead: readonly string[];
    };

/**
 * Asks trusted state which run this operator currently holds.
 *
 * A store that throws is reported `UNAVAILABLE`, never as "no run": a failure
 * to answer must not read as an answer, and it must not surface a database
 * message into an operator-facing result either.
 */
async function lookUpRunInstance(
  store: DemoResetRunStore | null,
  context: DemoResetRunContext,
): Promise<DemoResetRunLookup | null> {
  if (!store) {
    return null;
  }
  try {
    return await store.currentRunInstance(context);
  } catch {
    return { kind: "UNAVAILABLE" };
  }
}

/**
 * The dry-run composition, with every dependency explicit.
 *
 * This is the internal wiring seam and the surface tests drive. It is not
 * request-facing: `manifest`, `store` and `source` are capabilities, and a
 * value derived from a request must never choose them. The production entry
 * point below is what a route or server action calls, and it fixes all three.
 *
 * The order is fixed and each stage is a gate rather than a hint to the next:
 *
 *   trusted actor -> runtime and actor policy -> run instance
 *     -> inventory read -> planner
 *
 * The run store sits behind the same policy that gates the database, so a
 * refused environment or an unauthorized actor reaches neither. A run that is
 * refused returns before the reader, and a read that is refused returns before
 * the planner.
 */
export async function composeDemoResetDryRun(input: {
  actor: ActorContext;
  /** Untrusted. Compared against the recorded run, never used as a lookup. */
  claimedRunId?: unknown;
  store?: DemoResetRunStore | null;
  source?: DemoResetRowCountSource | null;
  manifest?: DemoResetManifest;
  /** Injected clock, so an observation instant is reproducible in a test. */
  now?: () => string;
}): Promise<DemoResetDryRunOutcome> {
  const authorization = authorizeDemoResetDryRun(input.actor);
  const manifest = input.manifest;

  // Gate the store on the same decision the resolver makes, so run state is
  // never consulted for a request that is about to be refused anyway.
  const precondition = resolveDemoResetRunContext(authorization);
  if (precondition.kind !== "READY") {
    return Object.freeze({
      kind: "DENIED" as const,
      authorization,
      runScope: Object.freeze({
        kind: "REFUSED" as const,
        refusal: precondition.refusal,
      }),
    });
  }

  const runScope = resolveDemoResetRunScope({
    authorization,
    lookup: await lookUpRunInstance(input.store ?? null, precondition.context),
    claimedRunId: input.claimedRunId,
  });
  if (runScope.kind === "REFUSED") {
    return Object.freeze({ kind: "DENIED" as const, authorization, runScope });
  }

  // Without an established run there is nothing the reader may scope a count
  // to, so it is not called at all and the inventory stays a stated absence.
  const read =
    runScope.kind === "ESTABLISHED"
      ? await readDemoResetInventory({
          scope: runScope,
          source: input.source ?? null,
          manifest,
          now: input.now,
        })
      : null;

  return Object.freeze({
    kind: "PLANNED" as const,
    authorization,
    runScope,
    plan: planDemoResetDryRun({
      authorization,
      inventory:
        read?.kind === "READ"
          ? read.inventory
          : unavailableDemoResetInventory(
              "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
              manifest,
            ),
      runId: runScope.kind === "ESTABLISHED" ? runScope.runId : null,
      manifest,
      generatedAt: input.now?.(),
    }),
    objectsRead: read?.kind === "READ" ? read.objectsRead : Object.freeze([]),
  });
}

/**
 * Production reads the run registry through the session client. Outside a
 * request the client cannot be created, the store returns `UNAVAILABLE`, and
 * no run is fabricated. Issuance is a separate explicit server capability;
 * it is never wired into a dry-run, which never inserts a row.
 */
const PRODUCTION_RUN_STORE: DemoResetRunStore =
  createProductionDemoResetRunStore();

/**
 * Production counts go through the allowlisted `demo_reset_count_rows` RPC.
 * The source is only exercised after a run is established. Service role stays
 * inside `src/data/demo-reset` because origination tables are not readable by
 * authenticated sessions.
 */
const PRODUCTION_ROW_COUNT_SOURCE: DemoResetRowCountSource =
  createProductionDemoResetRowCountSource();

/**
 * The production dry-run for one trusted actor.
 *
 * `actor` is an `ActorContext`, which callers obtain from `requireActor()` or
 * a `requirePermission(...)` guard — that is, from a verified session, never
 * from a request body. `claimedRunId` is the opposite: it models an untrusted
 * value, is typed `unknown`, and can only ever cause a refusal, because the
 * run is read from trusted state either way.
 *
 * Those are the only two inputs, and that is the point. The manifest, the run
 * store and the count source are fixed here rather than accepted from the
 * caller, so no request can choose which objects are in scope, which state is
 * trusted, or which tables are read. A caller that needs to substitute them is
 * a test, and it uses `composeDemoResetDryRun` directly.
 */
export function planDemoDatasetV2ResetDryRunForActor(
  actor: ActorContext,
  options?: { claimedRunId?: unknown },
): Promise<DemoResetDryRunOutcome> {
  return composeDemoResetDryRun({
    actor,
    claimedRunId: options?.claimedRunId,
    store: PRODUCTION_RUN_STORE,
    source: PRODUCTION_ROW_COUNT_SOURCE,
  });
}

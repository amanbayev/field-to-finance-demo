/**
 * Server-side ownership boundary for a Golden Path run.
 *
 * No `run_id` column, run table or run-correlation field exists on any
 * business table (`docs/DEMO_GOLDEN_PATH_V2.md` §9.3), so a run cannot be
 * looked up by identifier and its owner cannot be read from a row. This module
 * takes the other route: the run identity is **derived** from the trusted
 * server-side context, and a caller-supplied identifier is only ever compared
 * against that derivation.
 *
 * Three consequences follow, and they are the point of the module:
 *
 * 1. Ownership is definitional rather than looked up. The principal user id is
 *    an input to the derivation, so a derived identity belongs to exactly one
 *    principal and there is no stored state that could disagree.
 * 2. A caller-supplied run identifier is never an object reference. It is
 *    never used as a key, a filter or a lookup, only compared. Knowing another
 *    actor's run identifier therefore grants nothing, which removes the
 *    insecure-direct-object-reference class rather than guarding against it.
 * 3. The environment, dataset and database identity are inputs too, so an
 *    identifier derived under one approved context cannot silently pass under
 *    another. It fails the comparison like any other foreign value.
 *
 * The derived value is an identifier, **not** a bearer credential. It is not
 * secret and does not need to be: presenting it proves nothing, because the
 * server recomputes the expected value from the session on every request and
 * ignores whatever was presented. Comparison is therefore ordinary equality;
 * there is no secret that timing could leak.
 *
 * This module performs no reads and no writes. It holds no database, Auth,
 * Storage or chain client.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.1 and §9.3.
 */

import { createHash } from "node:crypto";
import type { DemoResetEnvironmentName } from "./environment";
import type { DemoResetDryRunAuthorization } from "./policy";

export const DEMO_RESET_RUN_SCOPE_REFUSALS = [
  "ENVIRONMENT_NOT_ELIGIBLE",
  "ACTOR_NOT_AUTHORIZED",
  "PRINCIPAL_NOT_IDENTIFIED",
  "RUN_CLAIM_MALFORMED",
  "RUN_NOT_OWNED_BY_ACTOR",
] as const;

export type DemoResetRunScopeRefusal =
  (typeof DEMO_RESET_RUN_SCOPE_REFUSALS)[number];

/**
 * The proven scope of one run, or the single reason it could not be proven.
 *
 * `ESTABLISHED` carries the approved context alongside the identity so that a
 * downstream reader cannot be handed a run without also being handed the
 * environment, dataset and database it was proven against.
 */
export type DemoResetRunScope =
  | {
      kind: "ESTABLISHED";
      runId: string;
      principalUserId: string;
      environmentName: DemoResetEnvironmentName;
      datasetId: string;
      databaseRef: string;
    }
  | { kind: "NOT_ESTABLISHED"; refusal: DemoResetRunScopeRefusal };

/**
 * Version tag of the canonical derivation content.
 *
 * A run identity derived under one scheme must not collide with one derived
 * under another, so the scheme identifies itself inside the digest.
 */
export const DEMO_RESET_RUN_ID_SCHEME = "demo-reset-run-id/v1";

const RUN_ID_PATTERN = /^run-[0-9a-f]{64}$/;

/**
 * Canonical shape of a derived run identity.
 *
 * The prefix keeps it distinguishable from a plan hash, which is also 64
 * hexadecimal characters.
 */
export function isDemoResetRunId(value: unknown): value is string {
  return typeof value === "string" && RUN_ID_PATTERN.test(value);
}

/**
 * Derives the run identity owned by one principal in one approved context.
 *
 * Deterministic: the same principal in the same environment, dataset and
 * database always resolves to the same run, so a dry-run is repeatable without
 * storing anything.
 */
export function demoResetRunId(input: {
  environmentName: string;
  datasetId: string;
  databaseRef: string;
  principalUserId: string;
}): string {
  const canonical = JSON.stringify({
    scheme: DEMO_RESET_RUN_ID_SCHEME,
    environmentName: input.environmentName,
    datasetId: input.datasetId,
    databaseRef: input.databaseRef,
    principalUserId: input.principalUserId,
  });
  return `run-${createHash("sha256").update(canonical).digest("hex")}`;
}

/**
 * A principal identifier is usable only as a non-blank string.
 *
 * The value reaches this module from `ActorContext.principal.userId`, which is
 * the `sub` claim of a verified session. It is still checked structurally,
 * because a blank identifier would derive a well-formed run identity that
 * every unidentified caller would share.
 */
function establishedPrincipalUserId(value: unknown): string | null {
  const principalUserId = typeof value === "string" ? value.trim() : "";
  return principalUserId === "" ? null : principalUserId;
}

function notEstablished(refusal: DemoResetRunScopeRefusal): DemoResetRunScope {
  return Object.freeze({ kind: "NOT_ESTABLISHED" as const, refusal });
}

/**
 * Resolves the run the current actor owns, refusing anything else.
 *
 * The order of checks is deliberate and mirrors the existing policy priority:
 * environment eligibility first, so that the production denial in
 * `resolveDemoResetEnvironment` is reported ahead of any actor or run reason
 * and no run can be established in a production or unclassifiable runtime;
 * then actor authority; then identification; then the run claim.
 *
 * `claimedRunId` is typed `unknown` on purpose. It models a value arriving
 * from a request body, and this module is the boundary that refuses to trust
 * its declared type.
 *
 * An unknown run and another actor's run both resolve to
 * `RUN_NOT_OWNED_BY_ACTOR`. That is not lost precision: without a run registry
 * the two are indistinguishable by construction, and reporting them
 * identically means the refusal cannot be used to test whether some other run
 * exists.
 */
export function resolveDemoResetRunScope(input: {
  authorization: DemoResetDryRunAuthorization;
  claimedRunId?: unknown;
}): DemoResetRunScope {
  const { authorization } = input;
  const environment = authorization.environment;

  if (!environment.eligible) {
    return notEstablished("ENVIRONMENT_NOT_ELIGIBLE");
  }
  if (authorization.decision !== "ALLOWED") {
    return notEstablished("ACTOR_NOT_AUTHORIZED");
  }

  const principalUserId = establishedPrincipalUserId(
    authorization.principalUserId,
  );
  if (!principalUserId) {
    return notEstablished("PRINCIPAL_NOT_IDENTIFIED");
  }

  const runId = demoResetRunId({
    environmentName: environment.environmentName,
    datasetId: environment.datasetId,
    databaseRef: environment.databaseRef,
    principalUserId,
  });

  // A caller may omit the claim entirely and receive its own run. Supplying
  // one only ever narrows the outcome: it can refuse, never redirect.
  const claimed = input.claimedRunId;
  if (claimed !== undefined && claimed !== null) {
    if (!isDemoResetRunId(claimed)) {
      return notEstablished("RUN_CLAIM_MALFORMED");
    }
    if (claimed !== runId) {
      return notEstablished("RUN_NOT_OWNED_BY_ACTOR");
    }
  }

  return Object.freeze({
    kind: "ESTABLISHED" as const,
    runId,
    principalUserId,
    environmentName: environment.environmentName,
    datasetId: environment.datasetId,
    databaseRef: environment.databaseRef,
  });
}

/**
 * Server-side resolution of the Golden Path run a request may target.
 *
 * The distinction this module exists to hold is that **a principal is not a
 * run**. Four separate things are involved and only the last one authorises a
 * read:
 *
 * 1. the trusted actor — who the session says is asking;
 * 2. the approved scope — which environment, dataset and database are allowed;
 * 3. the run instance — a distinct lifecycle occurrence with its own
 *    identifier, issued and recorded by the server;
 * 4. authority over that instance — whether this actor may operate it.
 *
 * An earlier revision collapsed (1)–(3) by deriving the identifier as a hash
 * of principal and context. That is a stable fingerprint of *who is asking
 * from where*, and it can never express Run A followed by Run B: one operator
 * in one environment would hold the same identifier forever. The contract
 * requires the opposite — a new run receives new identifiers and a new mint
 * (`docs/DEMO_GOLDEN_PATH_V2.md` §9.6) — because attaching an earlier run's
 * evidence to a later run is exactly the failure a reset must not enable. A
 * derived value is therefore unusable as a run identity no matter how well it
 * resists forged claims.
 *
 * So this module does not invent an identity. It reads one from trusted state
 * through `DemoResetRunStore` and verifies it. No run registry exists yet
 * (§9.3), so in production the store is absent, nothing is resolved, and the
 * scope is `NOT_ESTABLISHED` — not refused, and above all not fabricated so
 * that the planner receives a non-null identifier.
 *
 * ## Why a claimed identifier is never a lookup key
 *
 * `resolveDemoResetRunScope` asks the store for *the run this actor currently
 * operates* and then compares any claim against it. It never fetches a run by
 * the claimed identifier. A foreign identifier, a stale one and an invented
 * one are consequently indistinguishable in both the outcome and the refusal
 * reason, so no sequence of requests reveals whether some other run exists.
 * Knowing an identifier grants nothing; it is an identifier, never a bearer
 * credential.
 *
 * This module performs no reads and no writes. It holds no database, Auth,
 * Storage or chain client — the store is a type here, and the caller is what
 * awaits it.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.1, §9.3 and §9.6.
 */

import type { DemoResetEnvironmentName } from "./environment";
import type { DemoResetDryRunAuthorization } from "./policy";

/**
 * Reasons a scope is denied.
 *
 * Every one of these means the request asserted something untrue. They are
 * distinct from the gaps below, which mean the server simply has no run to
 * offer.
 */
export const DEMO_RESET_RUN_SCOPE_REFUSALS = [
  "ENVIRONMENT_NOT_ELIGIBLE",
  "ACTOR_NOT_AUTHORIZED",
  "PRINCIPAL_NOT_IDENTIFIED",
  "RUN_CLAIM_MALFORMED",
  "RUN_NOT_OWNED_BY_ACTOR",
  "RUN_RECORD_INVALID",
  "RUN_CONTEXT_MISMATCH",
] as const;

export type DemoResetRunScopeRefusal =
  (typeof DEMO_RESET_RUN_SCOPE_REFUSALS)[number];

/**
 * Reasons no run instance is in scope although the request was legitimate.
 *
 * `RUN_INSTANCE_NOT_ISSUED` is a positive answer: trusted state was consulted
 * and holds no run for this operator. `RUN_STATE_UNAVAILABLE` is the absence
 * of an answer — no store is wired, or it could not respond. They are kept
 * apart for the same reason `inventory.ts` keeps them apart for counts: not
 * knowing is not the same as knowing there is nothing, and neither may become
 * a run.
 */
export const DEMO_RESET_RUN_SCOPE_GAPS = [
  "RUN_INSTANCE_NOT_ISSUED",
  "RUN_STATE_UNAVAILABLE",
] as const;

export type DemoResetRunScopeGap = (typeof DEMO_RESET_RUN_SCOPE_GAPS)[number];

/**
 * One run instance as recorded by the server.
 *
 * The context fields are stored with the run rather than recomputed, so a run
 * recorded under one approved environment cannot be replayed under another:
 * the values travel with the record and are compared against the approved
 * context on every resolution.
 */
export interface DemoResetRunInstance {
  runId: string;
  /** Principal recorded as entitled to operate this run. */
  operatorPrincipalUserId: string;
  environmentName: string;
  datasetId: string;
  databaseRef: string;
}

/** The trusted context a run is looked up for. Every field is server-derived. */
export interface DemoResetRunContext {
  principalUserId: string;
  environmentName: DemoResetEnvironmentName;
  datasetId: string;
  databaseRef: string;
}

/**
 * What trusted state answered.
 *
 * `NO_RUN` and `UNAVAILABLE` are separate members rather than a nullable run,
 * because a store that failed must not read as a store that found nothing.
 */
export type DemoResetRunLookup =
  | { kind: "RUN"; run: DemoResetRunInstance }
  | { kind: "NO_RUN" }
  | { kind: "UNAVAILABLE" };

/**
 * The read-only port onto trusted run state.
 *
 * It answers one question — which run instance does this operator currently
 * hold in this approved context — and takes the whole trusted context so the
 * scoping is the store's obligation as well as this module's. There is no
 * method that takes a caller-supplied identifier, so no implementation of this
 * port can be turned into a run-lookup oracle.
 *
 * No implementation exists yet. That is the honest state of GP-01, and it is
 * why production resolves no scope.
 */
export interface DemoResetRunStore {
  currentRunInstance(context: DemoResetRunContext): Promise<DemoResetRunLookup>;
}

/**
 * The resolved scope: proven, legitimately empty, or denied.
 *
 * `ESTABLISHED` carries the approved context alongside the identity so a
 * downstream reader cannot be handed a run without also being handed the
 * environment, dataset and database it was proven against.
 */
export type DemoResetRunScope =
  | {
      kind: "ESTABLISHED";
      runId: string;
      operatorPrincipalUserId: string;
      environmentName: DemoResetEnvironmentName;
      datasetId: string;
      databaseRef: string;
    }
  | { kind: "NOT_ESTABLISHED"; gap: DemoResetRunScopeGap }
  | { kind: "REFUSED"; refusal: DemoResetRunScopeRefusal };

/**
 * A scope that has been proven.
 *
 * Named separately so that a signature can *require* the proven form. A
 * parameter of this type cannot be satisfied by a scope that was refused or
 * never established, which is how the run-scoped inventory read makes the
 * trusted run unavoidable rather than conventional.
 */
export type DemoResetEstablishedRunScope = Extract<
  DemoResetRunScope,
  { kind: "ESTABLISHED" }
>;

/** Any scope that does not authorise a read. */
export type DemoResetUnestablishedRunScope = Exclude<
  DemoResetRunScope,
  { kind: "ESTABLISHED" }
>;

/**
 * Conservative shape of a run instance identifier.
 *
 * The server issues these, so their format is the issuer's business and this
 * module deliberately does not encode one. What it does encode is a bound: an
 * identifier is an opaque, printable, bounded token. That keeps a value
 * arriving from a request body from reaching a future run-scoped query as
 * something other than a short identifier, and it costs nothing, since a
 * malformed claim could never match a recorded run anyway. A UUID satisfies
 * it.
 */
const RUN_INSTANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

export function isDemoResetRunInstanceId(value: unknown): value is string {
  return typeof value === "string" && RUN_INSTANCE_ID_PATTERN.test(value);
}

/**
 * A principal identifier is usable only as a non-blank string.
 *
 * The value reaches this module from `ActorContext.principal.userId`, the
 * `sub` claim of a verified session. It is still checked structurally, because
 * a blank identifier would compare equal to another blank one and let two
 * unidentified callers share a run.
 */
function establishedPrincipalUserId(value: unknown): string | null {
  const principalUserId = typeof value === "string" ? value.trim() : "";
  return principalUserId === "" ? null : principalUserId;
}

function refused(refusal: DemoResetRunScopeRefusal): DemoResetRunScope {
  return Object.freeze({ kind: "REFUSED" as const, refusal });
}

function notEstablished(gap: DemoResetRunScopeGap): DemoResetRunScope {
  return Object.freeze({ kind: "NOT_ESTABLISHED" as const, gap });
}

/**
 * A record is usable only if every field it will be trusted for is present.
 *
 * The store is server-side, but its answer is still re-checked rather than
 * accepted for its declared type: a row read through a client is `unknown` in
 * practice, and a run with a blank identifier or a blank operator would
 * otherwise establish a scope that belongs to nobody.
 */
function isUsableRunInstance(run: unknown): run is DemoResetRunInstance {
  const candidate = run as Partial<DemoResetRunInstance> | null | undefined;
  return (
    !!candidate &&
    isDemoResetRunInstanceId(candidate.runId) &&
    establishedPrincipalUserId(candidate.operatorPrincipalUserId) !== null &&
    typeof candidate.environmentName === "string" &&
    typeof candidate.datasetId === "string" &&
    typeof candidate.databaseRef === "string"
  );
}

/** Whether trusted run state may be consulted at all, and for what context. */
export type DemoResetRunPrecondition =
  | { kind: "READY"; context: DemoResetRunContext }
  | { kind: "REFUSED"; refusal: DemoResetRunScopeRefusal };

/**
 * Decides whether this request may reach trusted run state, and with what.
 *
 * The order of checks is deliberate and mirrors the existing policy priority:
 * environment eligibility first, so the production denial in
 * `resolveDemoResetEnvironment` is reported ahead of any actor or run reason
 * and run state is never consulted from a production or unclassifiable
 * runtime; then actor authority; then identification.
 *
 * It is exported so a composition can gate its store call on the same
 * decision that `resolveDemoResetRunScope` makes, rather than re-implementing
 * the order and drifting from it. That is what makes "a denied environment
 * causes zero run reads" structural rather than incidental.
 */
export function resolveDemoResetRunContext(
  authorization: DemoResetDryRunAuthorization,
): DemoResetRunPrecondition {
  const environment = authorization.environment;

  if (!environment.eligible) {
    return Object.freeze({
      kind: "REFUSED" as const,
      refusal: "ENVIRONMENT_NOT_ELIGIBLE" as const,
    });
  }
  if (authorization.decision !== "ALLOWED") {
    return Object.freeze({
      kind: "REFUSED" as const,
      refusal: "ACTOR_NOT_AUTHORIZED" as const,
    });
  }

  const principalUserId = establishedPrincipalUserId(
    authorization.principalUserId,
  );
  if (!principalUserId) {
    return Object.freeze({
      kind: "REFUSED" as const,
      refusal: "PRINCIPAL_NOT_IDENTIFIED" as const,
    });
  }

  return Object.freeze({
    kind: "READY" as const,
    context: Object.freeze({
      principalUserId,
      environmentName: environment.environmentName,
      datasetId: environment.datasetId,
      databaseRef: environment.databaseRef,
    }),
  });
}

/**
 * Resolves the run instance the current actor may operate, refusing anything
 * else.
 *
 * `lookup` is what the store answered, already awaited by the caller. Keeping
 * the I/O outside leaves this function synchronous and total: every branch is
 * reachable in a test without a database.
 *
 * `claimedRunId` is typed `unknown` on purpose. It models a value arriving
 * from a request body, and this module is the boundary that refuses to trust
 * its declared type. Supplying a claim can only ever narrow the outcome — it
 * selects nothing, so a stale or foreign identifier is refused rather than
 * silently becoming the target run.
 */
export function resolveDemoResetRunScope(input: {
  authorization: DemoResetDryRunAuthorization;
  lookup?: DemoResetRunLookup | null;
  claimedRunId?: unknown;
}): DemoResetRunScope {
  const precondition = resolveDemoResetRunContext(input.authorization);
  if (precondition.kind !== "READY") {
    return refused(precondition.refusal);
  }
  const context = precondition.context;

  // No store wired, no answer, or an answer this module does not recognise:
  // all three mean the server cannot say which run is current, and none of
  // them may be read as "there is no run" or resolved into one.
  const lookup = input.lookup;
  if (!lookup || lookup.kind === "UNAVAILABLE") {
    return notEstablished("RUN_STATE_UNAVAILABLE");
  }
  if (lookup.kind === "NO_RUN") {
    return notEstablished("RUN_INSTANCE_NOT_ISSUED");
  }
  if (lookup.kind !== "RUN") {
    return notEstablished("RUN_STATE_UNAVAILABLE");
  }

  const run = lookup.run;
  if (!isUsableRunInstance(run)) {
    return refused("RUN_RECORD_INVALID");
  }
  // The store was asked to scope by principal. Verifying it anyway means a
  // mis-scoped query cannot become an authorisation bypass here.
  if (run.operatorPrincipalUserId.trim() !== context.principalUserId) {
    return refused("RUN_NOT_OWNED_BY_ACTOR");
  }
  if (
    run.environmentName !== context.environmentName ||
    run.datasetId !== context.datasetId ||
    run.databaseRef !== context.databaseRef
  ) {
    return refused("RUN_CONTEXT_MISMATCH");
  }

  // A caller may omit the claim and operate its current run. Supplying one is
  // an assertion about which run that is, and a wrong assertion is refused.
  // Foreign, stale and invented identifiers share this refusal, so comparing
  // outcomes across requests reveals nothing about runs the caller cannot
  // already see.
  const claimed = input.claimedRunId;
  if (claimed !== undefined && claimed !== null) {
    if (!isDemoResetRunInstanceId(claimed)) {
      return refused("RUN_CLAIM_MALFORMED");
    }
    if (claimed !== run.runId) {
      return refused("RUN_NOT_OWNED_BY_ACTOR");
    }
  }

  return Object.freeze({
    kind: "ESTABLISHED" as const,
    runId: run.runId,
    operatorPrincipalUserId: context.principalUserId,
    environmentName: context.environmentName,
    datasetId: context.datasetId,
    databaseRef: context.databaseRef,
  });
}

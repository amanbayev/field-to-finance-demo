/**
 * Read-only reset planner.
 *
 * Produces a reviewable dry-run plan from an authorization decision, the
 * manifest and an inventory. It performs no reads and no writes: no database,
 * Auth, Storage or chain client is imported here, and there is no execution
 * path anywhere in this module.
 *
 * The planner fails closed. It reaches `READY_FOR_CONFIRMATION` only when the
 * actor and environment are authorized, the inventory was genuinely observed
 * and every observation is interpretable, the run scope is established, every
 * cleared category is run-owned, no object is both preserved and cleared, and
 * every category was actually observed. At the audited baseline none of the
 * scope conditions hold, so the honest outcome is `INCOMPLETE`.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.3 and §9.4.
 */

import { createHash } from "node:crypto";
import {
  countClaimedCategoryIds,
  countedRows,
  invalidObservations,
  inventoryGaps,
  inventoryObservationTime,
  type DemoResetInventory,
  type DemoResetInventoryGap,
} from "./inventory";
import {
  DEMO_DATASET_V2_RESET_MANIFEST,
  categoriesByDisposition,
  overlappingManifestObjects,
  unscopedClearedCategories,
  type DemoResetCategory,
  type DemoResetManifest,
} from "./manifest";
import type { DemoResetDryRunAuthorization, DemoResetRefusal } from "./policy";

export const DEMO_RESET_PLAN_BLOCKERS = [
  "NOT_AUTHORIZED",
  "INVENTORY_NOT_OBSERVED",
  "INVENTORY_OBSERVATION_INVALID",
  "INVENTORY_TIME_NOT_ESTABLISHED",
  "RUN_SCOPE_NOT_ESTABLISHED",
  "CLEARED_SCOPE_NOT_RUN_OWNED",
  "PRESERVED_AND_CLEARED_OVERLAP",
  "INVENTORY_INCOMPLETE",
] as const;

export type DemoResetPlanBlocker = (typeof DEMO_RESET_PLAN_BLOCKERS)[number];

/**
 * `BLOCKED` is a refusal: authority, environment, or inventory provenance and
 * integrity are wrong. `INCOMPLETE` means the request was legitimate but the
 * plan cannot be proven safe yet.
 */
export type DemoResetDryRunStatus =
  | "READY_FOR_CONFIRMATION"
  | "BLOCKED"
  | "INCOMPLETE";

export interface DemoResetPlanCategory {
  categoryId: string;
  subsystem: DemoResetCategory["subsystem"];
  scopeBasis: DemoResetCategory["scopeBasis"];
  /** Which rows of the named objects the category covers. */
  rowScope: DemoResetCategory["rowScope"];
  objects: readonly string[];
  /** Null when the inventory did not establish a usable count. Never 0 or NaN. */
  rows: number | null;
  note: string;
}

export interface DemoResetInventoryGapEntry {
  categoryId: string;
  reason: DemoResetInventoryGap;
}

export interface DemoResetDryRunPlan {
  status: DemoResetDryRunStatus;
  /** Stable over identical inputs; excludes `generatedAt`. */
  planHash: string;
  /** ISO 8601 UTC. Not part of the hash. */
  generatedAt: string;
  environmentName: string | null;
  datasetId: string | null;
  databaseRef: string | null;
  runId: string | null;
  datasetContract: string;
  inventorySource: DemoResetInventory["source"];
  /** Observation instant when the reader established one, else null. */
  inventoryObservedAt: string | null;
  preserved: readonly DemoResetPlanCategory[];
  cleared: readonly DemoResetPlanCategory[];
  blockers: readonly DemoResetPlanBlocker[];
  refusals: readonly DemoResetRefusal[];
  inventoryGaps: readonly DemoResetInventoryGapEntry[];
  overlappingObjects: readonly string[];
  /** Recorded literally: a dry-run changes nothing anywhere. */
  sideEffects: "NONE";
}

export interface DemoResetPlanInput {
  authorization: DemoResetDryRunAuthorization;
  inventory: DemoResetInventory;
  /**
   * Identity of the Golden Path run instance whose rows would be cleared. It
   * is the identifier of a distinct run, never a fingerprint of the actor who
   * asked: one operator may hold Run A and later Run B. Issuance is not wired,
   * so a dry-run that cannot read a current run passes null and the plan
   * resolves to INCOMPLETE. A blank or whitespace value establishes no scope
   * and is treated as absent.
   */
  runId?: string | null;
  manifest?: DemoResetManifest;
  generatedAt?: string;
}

function planCategories(
  categories: readonly DemoResetCategory[],
  inventory: DemoResetInventory,
): readonly DemoResetPlanCategory[] {
  return Object.freeze(
    categories.map((category) =>
      Object.freeze({
        categoryId: category.id,
        subsystem: category.subsystem,
        scopeBasis: category.scopeBasis,
        rowScope: category.rowScope,
        objects: category.objects,
        rows: countedRows(inventory, category.id),
        note: category.note,
      }),
    ),
  );
}

/**
 * Version tag of the canonical hash content.
 *
 * A confirmation recorded under one scheme must not silently match a plan
 * hashed under another, so the scheme identifies itself inside the digest.
 */
const PLAN_HASH_SCHEME = "demo-reset-plan-hash/v3";

/**
 * Deterministic identity of a plan, for a later confirmation binding.
 *
 * `generatedAt` and the observation instant are excluded so that re-running an
 * unchanged dry-run yields the same hash, while any change to environment,
 * dataset, dataset contract, run, manifest scope — category, subsystem, scope
 * basis or objects — or to the counts yields a different one, which is what
 * forces a fresh dry-run.
 *
 * Category notes are excluded deliberately: they are prose for reviewers and
 * carry no scope meaning.
 *
 * The hash is **not** evidence that the underlying rows are unchanged. Equal
 * counts hash equally, so a row set whose members changed while its size held
 * is not detected here. Detecting that needs an inventory revision or
 * fingerprint per category plus a scope re-check at confirmation time; both
 * are recorded as prerequisites in `docs/DEMO_GOLDEN_PATH_V2.md` §9.4 and are
 * not built in this PR.
 */
export function demoResetPlanHash(input: {
  environmentName: string | null;
  datasetId: string | null;
  databaseRef: string | null;
  runId: string | null;
  datasetContract: string;
  inventorySource: DemoResetInventory["source"];
  status: DemoResetDryRunStatus;
  preserved: readonly DemoResetPlanCategory[];
  cleared: readonly DemoResetPlanCategory[];
}): string {
  const canonicalCategory = (category: DemoResetPlanCategory) => [
    category.categoryId,
    category.subsystem,
    category.scopeBasis,
    // Which rows are in scope changes what a confirmation would authorise, so
    // it belongs to the plan's identity as much as the count does.
    category.rowScope,
    [...category.objects],
    category.rows,
  ];
  const canonical = JSON.stringify({
    scheme: PLAN_HASH_SCHEME,
    environmentName: input.environmentName,
    datasetId: input.datasetId,
    databaseRef: input.databaseRef,
    runId: input.runId,
    datasetContract: input.datasetContract,
    inventorySource: input.inventorySource,
    status: input.status,
    preserved: input.preserved.map(canonicalCategory),
    cleared: input.cleared.map(canonicalCategory),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function establishedRunId(runId: string | null | undefined): string | null {
  const value = typeof runId === "string" ? runId.trim() : "";
  return value === "" ? null : value;
}

export function planDemoResetDryRun(
  input: DemoResetPlanInput,
): DemoResetDryRunPlan {
  const manifest = input.manifest ?? DEMO_DATASET_V2_RESET_MANIFEST;
  const { authorization, inventory } = input;
  const runId = establishedRunId(input.runId);

  const preserved = planCategories(
    categoriesByDisposition("PRESERVED", manifest),
    inventory,
  );
  const cleared = planCategories(
    categoriesByDisposition("CLEARED", manifest),
    inventory,
  );

  const gaps = inventoryGaps(inventory, manifest);
  const defects = invalidObservations(inventory, manifest);
  const observationTime = inventoryObservationTime(inventory);
  const claimedCounts = countClaimedCategoryIds(inventory, manifest);
  const overlaps = overlappingManifestObjects(manifest);
  const unscoped = unscopedClearedCategories(manifest);

  // Refusals: wrong authority, an inventory that was never observed, or an
  // inventory record whose own integrity cannot be established.
  const refusing: DemoResetPlanBlocker[] = [];
  if (authorization.decision !== "ALLOWED") {
    refusing.push("NOT_AUTHORIZED");
  }
  if (inventory.source !== "OBSERVED") {
    refusing.push("INVENTORY_NOT_OBSERVED");
  }
  if (defects.length > 0) {
    refusing.push("INVENTORY_OBSERVATION_INVALID");
  }
  // Claiming a count asserts that something was read, which requires a real
  // observation instant. A supplied instant must be a real one either way.
  if (
    observationTime.kind === "INVALID" ||
    (observationTime.kind === "ABSENT" && claimedCounts.length > 0)
  ) {
    refusing.push("INVENTORY_TIME_NOT_ESTABLISHED");
  }

  // Incompleteness: legitimate request, unproven scope.
  const incomplete: DemoResetPlanBlocker[] = [];
  if (!runId) {
    incomplete.push("RUN_SCOPE_NOT_ESTABLISHED");
  }
  if (unscoped.length > 0) {
    incomplete.push("CLEARED_SCOPE_NOT_RUN_OWNED");
  }
  if (overlaps.length > 0) {
    incomplete.push("PRESERVED_AND_CLEARED_OVERLAP");
  }
  if (gaps.length > defects.length) {
    incomplete.push("INVENTORY_INCOMPLETE");
  }

  const status: DemoResetDryRunStatus =
    refusing.length > 0
      ? "BLOCKED"
      : incomplete.length > 0
        ? "INCOMPLETE"
        : "READY_FOR_CONFIRMATION";

  const planHash = demoResetPlanHash({
    environmentName: authorization.environment.environmentName,
    datasetId: authorization.environment.datasetId,
    databaseRef: authorization.environment.databaseRef,
    runId,
    datasetContract: manifest.datasetContract,
    inventorySource: inventory.source,
    status,
    preserved,
    cleared,
  });

  return Object.freeze({
    status,
    planHash,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    environmentName: authorization.environment.environmentName,
    datasetId: authorization.environment.datasetId,
    databaseRef: authorization.environment.databaseRef,
    runId,
    datasetContract: manifest.datasetContract,
    inventorySource: inventory.source,
    inventoryObservedAt:
      observationTime.kind === "VALID" ? observationTime.instant : null,
    preserved,
    cleared,
    blockers: Object.freeze([...refusing, ...incomplete]),
    refusals: authorization.refusals,
    inventoryGaps: gaps,
    overlappingObjects: overlaps,
    sideEffects: "NONE" as const,
  });
}

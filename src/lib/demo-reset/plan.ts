/**
 * Read-only reset planner.
 *
 * Produces a reviewable dry-run plan from an authorization decision, the
 * manifest and an inventory. It performs no reads and no writes: no database,
 * Auth, Storage or chain client is imported here, and there is no execution
 * path anywhere in this module.
 *
 * The planner fails closed. It reaches `READY_FOR_CONFIRMATION` only when the
 * actor and environment are authorized, the run scope is established, every
 * cleared category is run-owned, no object is both preserved and cleared, and
 * every category was actually observed. At the audited baseline none of the
 * scope conditions hold, so the honest outcome is `INCOMPLETE`.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.3 and §9.4.
 */

import { createHash } from "node:crypto";
import {
  inventoryGaps,
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
  "RUN_SCOPE_NOT_ESTABLISHED",
  "CLEARED_SCOPE_NOT_RUN_OWNED",
  "PRESERVED_AND_CLEARED_OVERLAP",
  "INVENTORY_INCOMPLETE",
] as const;

export type DemoResetPlanBlocker = (typeof DEMO_RESET_PLAN_BLOCKERS)[number];

/**
 * `BLOCKED` is a refusal: authority, environment or inventory provenance is
 * wrong. `INCOMPLETE` means the request was legitimate but the plan cannot be
 * proven safe yet.
 */
export type DemoResetDryRunStatus =
  | "READY_FOR_CONFIRMATION"
  | "BLOCKED"
  | "INCOMPLETE";

export interface DemoResetPlanCategory {
  categoryId: string;
  subsystem: DemoResetCategory["subsystem"];
  scopeBasis: DemoResetCategory["scopeBasis"];
  objects: readonly string[];
  /** Null when the inventory did not establish a count. Never coerced to 0. */
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
  inventorySource: DemoResetInventory["source"];
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
   * Identity of the Golden Path run whose rows would be cleared. No business
   * table carries run ownership yet, so production callers pass null and the
   * plan resolves to INCOMPLETE.
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
    categories.map((category) => {
      const observation = inventory.categories[category.id];
      return Object.freeze({
        categoryId: category.id,
        subsystem: category.subsystem,
        scopeBasis: category.scopeBasis,
        objects: category.objects,
        rows:
          observation && observation.kind === "COUNTED" ? observation.rows : null,
        note: category.note,
      });
    }),
  );
}

/**
 * Deterministic identity of a plan, for a later confirmation binding.
 *
 * `generatedAt` is excluded so that re-running an unchanged dry-run yields the
 * same hash, and any change to environment, dataset, run, manifest scope or
 * inventory yields a different one — which is what forces a fresh dry-run.
 */
export function demoResetPlanHash(input: {
  environmentName: string | null;
  datasetId: string | null;
  databaseRef: string | null;
  runId: string | null;
  inventorySource: DemoResetInventory["source"];
  status: DemoResetDryRunStatus;
  preserved: readonly DemoResetPlanCategory[];
  cleared: readonly DemoResetPlanCategory[];
}): string {
  const canonical = JSON.stringify({
    environmentName: input.environmentName,
    datasetId: input.datasetId,
    databaseRef: input.databaseRef,
    runId: input.runId,
    inventorySource: input.inventorySource,
    status: input.status,
    preserved: input.preserved.map((category) => [
      category.categoryId,
      category.scopeBasis,
      [...category.objects],
      category.rows,
    ]),
    cleared: input.cleared.map((category) => [
      category.categoryId,
      category.scopeBasis,
      [...category.objects],
      category.rows,
    ]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function planDemoResetDryRun(
  input: DemoResetPlanInput,
): DemoResetDryRunPlan {
  const manifest = input.manifest ?? DEMO_DATASET_V2_RESET_MANIFEST;
  const { authorization, inventory } = input;
  const runId = input.runId ?? null;

  const preserved = planCategories(
    categoriesByDisposition("PRESERVED", manifest),
    inventory,
  );
  const cleared = planCategories(
    categoriesByDisposition("CLEARED", manifest),
    inventory,
  );
  const gaps = inventoryGaps(inventory, manifest);
  const overlaps = overlappingManifestObjects(manifest);
  const unscoped = unscopedClearedCategories(manifest);

  // Refusals: wrong authority, or an inventory that was never observed.
  const refusing: DemoResetPlanBlocker[] = [];
  if (authorization.decision !== "ALLOWED") {
    refusing.push("NOT_AUTHORIZED");
  }
  if (inventory.source !== "OBSERVED") {
    refusing.push("INVENTORY_NOT_OBSERVED");
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
  if (gaps.length > 0) {
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
    inventorySource: inventory.source,
    preserved,
    cleared,
    blockers: Object.freeze([...refusing, ...incomplete]),
    refusals: authorization.refusals,
    inventoryGaps: gaps,
    overlappingObjects: overlaps,
    sideEffects: "NONE" as const,
  });
}

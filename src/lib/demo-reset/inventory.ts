/**
 * Inventory observations for a demo reset dry-run.
 *
 * Two rules drive the shape of these types:
 *
 * 1. An unreadable category is `UNAVAILABLE`, never `{ rows: 0 }`. Missing
 *    access to a source does not mean there are no objects, and an unavailable
 *    source is never counted as a verified zero.
 * 2. A declared or test inventory is tagged `DECLARED_TEST` and can never be
 *    presented as an observation of the real environment.
 *
 * This module performs no reads. It only describes what a reader would return.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.3.
 */

import { manifestCategoryIds, type DemoResetManifest } from "./manifest";

export const DEMO_RESET_INVENTORY_GAPS = [
  "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
  "SUBSYSTEM_NOT_READABLE",
  "CATEGORY_NOT_ENUMERATED",
] as const;

export type DemoResetInventoryGap = (typeof DEMO_RESET_INVENTORY_GAPS)[number];

export type CategoryObservation =
  | { kind: "COUNTED"; rows: number }
  | { kind: "UNAVAILABLE"; reason: DemoResetInventoryGap };


/**
 * `OBSERVED` means a reader actually queried the environment.
 * `DECLARED_TEST` means the numbers were supplied by a caller or a test.
 */
export type DemoResetInventorySource = "OBSERVED" | "DECLARED_TEST";

export interface DemoResetInventory {
  source: DemoResetInventorySource;
  /** ISO 8601 UTC instant of the observation, or null when nothing was read. */
  observedAt: string | null;
  categories: Readonly<Record<string, CategoryObservation>>;
}

/**
 * Every manifest category marked unavailable for one stated reason.
 *
 * This is the production default while no run-scoped inventory reader exists:
 * the planner then reports `INCOMPLETE` rather than an empty environment.
 */
export function unavailableDemoResetInventory(
  reason: DemoResetInventoryGap,
  manifest?: DemoResetManifest,
): DemoResetInventory {
  const categories: Record<string, CategoryObservation> = {};
  for (const id of manifestCategoryIds(manifest)) {
    categories[id] = Object.freeze({ kind: "UNAVAILABLE" as const, reason });
  }
  return Object.freeze({
    source: "OBSERVED" as const,
    observedAt: null,
    categories: Object.freeze(categories),
  });
}

/** Category ids the inventory could not establish, with their reasons. */
export function inventoryGaps(
  inventory: DemoResetInventory,
  manifest?: DemoResetManifest,
): readonly { categoryId: string; reason: DemoResetInventoryGap }[] {
  const gaps: { categoryId: string; reason: DemoResetInventoryGap }[] = [];
  for (const categoryId of manifestCategoryIds(manifest)) {
    const observation = inventory.categories[categoryId];
    if (!observation) {
      gaps.push({ categoryId, reason: "CATEGORY_NOT_ENUMERATED" });
      continue;
    }
    if (observation.kind === "UNAVAILABLE") {
      gaps.push({ categoryId, reason: observation.reason });
    }
  }
  return Object.freeze(gaps.map((gap) => Object.freeze(gap)));
}

/**
 * Row count for a category, or null when it was not established.
 *
 * Returning null rather than 0 keeps callers from rendering an unavailable
 * category as an empty one.
 */
export function countedRows(
  inventory: DemoResetInventory,
  categoryId: string,
): number | null {
  const observation = inventory.categories[categoryId];
  if (!observation || observation.kind === "UNAVAILABLE") {
    return null;
  }
  return observation.rows;
}

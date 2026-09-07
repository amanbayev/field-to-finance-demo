/**
 * Inventory observations for a demo reset dry-run.
 *
 * Three rules drive the shape of these types:
 *
 * 1. An unreadable category is `UNAVAILABLE`, never `{ rows: 0 }`. Missing
 *    access to a source does not mean there are no objects, and an unavailable
 *    source is never counted as a verified zero.
 * 2. A declared or test inventory is tagged `DECLARED_TEST` and can never be
 *    presented as an observation of the real environment.
 * 3. An observation that cannot be interpreted is a defect, not a value. A
 *    count that is `NaN`, infinite, negative or fractional, an unknown
 *    observation kind, and a counted category with no observation time are all
 *    reported. They are never repaired by substituting zero or the current
 *    clock, because a repaired number would misreport the environment.
 *
 * These are structural runtime checks, not trust in the declared TypeScript
 * type: the future inventory reader will build these records from database and
 * Storage responses, where a null, a string or a failed aggregate can arrive
 * where a number is expected.
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
  "OBSERVATION_COUNT_INVALID",
  "OBSERVATION_NOT_INTERPRETABLE",
] as const;

export type DemoResetInventoryGap = (typeof DEMO_RESET_INVENTORY_GAPS)[number];

/**
 * Gaps that mean the inventory record itself is defective, as opposed to a
 * category that is honestly unavailable. The planner refuses these instead of
 * reporting them as incompleteness.
 */
export const DEMO_RESET_INVALID_OBSERVATION_GAPS = [
  "OBSERVATION_COUNT_INVALID",
  "OBSERVATION_NOT_INTERPRETABLE",
] as const;

export type DemoResetInvalidObservationGap =
  (typeof DEMO_RESET_INVALID_OBSERVATION_GAPS)[number];

export function isInvalidObservationGap(
  reason: DemoResetInventoryGap,
): reason is DemoResetInvalidObservationGap {
  return (DEMO_RESET_INVALID_OBSERVATION_GAPS as readonly string[]).includes(
    reason,
  );
}

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

/** A count is usable only as a finite, non-negative, exactly representable integer. */
export function isValidRowCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const OBSERVED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** An observation instant must be an ISO 8601 UTC timestamp of a real date. */
export function isObservationInstant(value: unknown): value is string {
  if (typeof value !== "string" || !OBSERVED_AT_PATTERN.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

export type DemoResetObservationTime =
  | { kind: "VALID"; instant: string }
  | { kind: "ABSENT" }
  | { kind: "INVALID" };

/**
 * Provenance of the observation time.
 *
 * `ABSENT` is legitimate when nothing was read. `INVALID` means a time was
 * supplied that is not a real instant, which is never substituted with `now`.
 */
export function inventoryObservationTime(
  inventory: DemoResetInventory,
): DemoResetObservationTime {
  const observedAt = inventory.observedAt;
  if (observedAt === null || observedAt === undefined) {
    return Object.freeze({ kind: "ABSENT" as const });
  }
  if (!isObservationInstant(observedAt)) {
    return Object.freeze({ kind: "INVALID" as const });
  }
  return Object.freeze({ kind: "VALID" as const, instant: observedAt });
}

/**
 * Every manifest category marked unavailable for one stated reason.
 *
 * This is the production default while no run-scoped inventory reader exists:
 * the planner then reports `INCOMPLETE` rather than an empty environment.
 * `observedAt` is null because nothing was read, which is consistent: no
 * category claims a count.
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

/**
 * Classifies one observation without trusting its declared type.
 *
 * Returns null when the observation is a usable count.
 */
function observationGap(
  observation: CategoryObservation | undefined,
): DemoResetInventoryGap | null {
  if (observation === null || observation === undefined) {
    return "CATEGORY_NOT_ENUMERATED";
  }
  const kind: unknown = (observation as { kind?: unknown }).kind;
  if (kind === "UNAVAILABLE") {
    const reason: unknown = (observation as { reason?: unknown }).reason;
    return typeof reason === "string" &&
      (DEMO_RESET_INVENTORY_GAPS as readonly string[]).includes(reason)
      ? (reason as DemoResetInventoryGap)
      : "OBSERVATION_NOT_INTERPRETABLE";
  }
  if (kind === "COUNTED") {
    const rows: unknown = (observation as { rows?: unknown }).rows;
    return isValidRowCount(rows) ? null : "OBSERVATION_COUNT_INVALID";
  }
  return "OBSERVATION_NOT_INTERPRETABLE";
}

/**
 * Category ids the inventory could not establish, with their reasons.
 *
 * Covers categories that were never enumerated, categories the reader reported
 * as unavailable, and observations that cannot be interpreted at all.
 */
export function inventoryGaps(
  inventory: DemoResetInventory,
  manifest?: DemoResetManifest,
): readonly { categoryId: string; reason: DemoResetInventoryGap }[] {
  const gaps: { categoryId: string; reason: DemoResetInventoryGap }[] = [];
  for (const categoryId of manifestCategoryIds(manifest)) {
    const reason = observationGap(inventory.categories[categoryId]);
    if (reason) {
      gaps.push({ categoryId, reason });
    }
  }
  return Object.freeze(gaps.map((gap) => Object.freeze(gap)));
}

/** Gaps that make the inventory record defective rather than merely partial. */
export function invalidObservations(
  inventory: DemoResetInventory,
  manifest?: DemoResetManifest,
): readonly { categoryId: string; reason: DemoResetInvalidObservationGap }[] {
  return Object.freeze(
    inventoryGaps(inventory, manifest).filter(
      (gap): gap is { categoryId: string; reason: DemoResetInvalidObservationGap } =>
        isInvalidObservationGap(gap.reason),
    ),
  );
}

/** Category ids carrying a usable count. */
export function countedCategoryIds(
  inventory: DemoResetInventory,
  manifest?: DemoResetManifest,
): readonly string[] {
  return Object.freeze(
    manifestCategoryIds(manifest).filter(
      (categoryId) => observationGap(inventory.categories[categoryId]) === null,
    ),
  );
}

/**
 * Category ids whose observation *claims* a count, whether or not the count is
 * usable.
 *
 * Claiming a count asserts that the reader queried the environment, which
 * requires a real observation time. Validity of the number is a separate
 * question, so an inventory of `NaN` counts still owes an observation time.
 */
export function countClaimedCategoryIds(
  inventory: DemoResetInventory,
  manifest?: DemoResetManifest,
): readonly string[] {
  return Object.freeze(
    manifestCategoryIds(manifest).filter(
      (categoryId) =>
        (inventory.categories[categoryId] as { kind?: unknown } | undefined)
          ?.kind === "COUNTED",
    ),
  );
}

/**
 * Row count for a category, or null when it was not established.
 *
 * Returning null rather than 0 keeps callers from rendering an unavailable
 * category as an empty one, and an invalid count is null rather than `NaN`.
 */
export function countedRows(
  inventory: DemoResetInventory,
  categoryId: string,
): number | null {
  const observation = inventory.categories[categoryId];
  if (observationGap(observation) !== null) {
    return null;
  }
  return (observation as { kind: "COUNTED"; rows: number }).rows;
}

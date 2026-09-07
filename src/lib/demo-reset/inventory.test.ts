import { describe, expect, it } from "vitest";
import {
  countClaimedCategoryIds,
  countedCategoryIds,
  countedRows,
  invalidObservations,
  inventoryGaps,
  inventoryObservationTime,
  isObservationInstant,
  isValidRowCount,
  unavailableDemoResetInventory,
  type CategoryObservation,
  type DemoResetInventory,
} from "@/lib/demo-reset/inventory";
import type { DemoResetManifest } from "@/lib/demo-reset/manifest";

const OBSERVED_AT = "2026-09-07T00:00:00.000Z";

/** Two categories are enough to show per-category classification. */
const MANIFEST: DemoResetManifest = {
  datasetContract: "synthetic-inventory",
  categories: [
    {
      id: "kept",
      subsystem: "DATABASE",
      disposition: "PRESERVED",
      scopeBasis: "ENVIRONMENT_WIDE",
      rowScope: "NON_RUN_ROWS",
      objects: ["organizations"],
      note: "operator identity",
    },
    {
      id: "run-rows",
      subsystem: "DATABASE",
      disposition: "CLEARED",
      scopeBasis: "RUN_OWNED",
      rowScope: "RUN_OWNED_ROWS",
      objects: ["producer_fields"],
      note: "run-owned business rows",
    },
  ],
};

function inventory(
  categories: Record<string, CategoryObservation>,
  observedAt: string | null = OBSERVED_AT,
): DemoResetInventory {
  return { source: "OBSERVED", observedAt, categories };
}

describe("row count validation", () => {
  it("accepts only finite, non-negative, safe integers", () => {
    expect(isValidRowCount(0)).toBe(true);
    expect(isValidRowCount(7)).toBe(true);
    expect(isValidRowCount(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("rejects NaN, infinities, negatives, fractions and non-numbers", () => {
    expect(isValidRowCount(Number.NaN)).toBe(false);
    expect(isValidRowCount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidRowCount(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isValidRowCount(-1)).toBe(false);
    expect(isValidRowCount(1.5)).toBe(false);
    expect(isValidRowCount(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
    expect(isValidRowCount("3")).toBe(false);
    expect(isValidRowCount(null)).toBe(false);
    expect(isValidRowCount(undefined)).toBe(false);
  });
});

describe("observation instant validation", () => {
  it("accepts an ISO 8601 UTC instant", () => {
    expect(isObservationInstant(OBSERVED_AT)).toBe(true);
    expect(isObservationInstant("2026-09-07T00:00:00Z")).toBe(true);
  });

  it("accepts an ordinary date and the supported fractional seconds", () => {
    expect(isObservationInstant("2026-09-07T14:35:09Z")).toBe(true);
    expect(isObservationInstant("2026-09-07T14:35:09.1Z")).toBe(true);
    expect(isObservationInstant("2026-09-07T14:35:09.12Z")).toBe(true);
    expect(isObservationInstant("2026-09-07T14:35:09.123Z")).toBe(true);
    expect(isObservationInstant("2026-12-31T23:59:59.999Z")).toBe(true);
  });

  it("rejects prose, offsets, impossible dates and non-strings", () => {
    expect(isObservationInstant("yesterday")).toBe(false);
    expect(isObservationInstant("2026-09-07")).toBe(false);
    expect(isObservationInstant("2026-09-07T00:00:00+05:00")).toBe(false);
    expect(isObservationInstant("2026-13-45T00:00:00.000Z")).toBe(false);
    expect(isObservationInstant(null)).toBe(false);
    expect(isObservationInstant(1_757_000_000_000)).toBe(false);
  });

  it("rejects 30 February instead of normalising it to March", () => {
    // Date.parse("2026-02-30T00:00:00Z") silently yields 2 March.
    expect(new Date(Date.parse("2026-02-30T00:00:00Z")).toISOString()).toBe(
      "2026-03-02T00:00:00.000Z",
    );
    expect(isObservationInstant("2026-02-30T00:00:00Z")).toBe(false);
  });

  it("rejects 29 February in a non-leap year and accepts it in a leap year", () => {
    expect(isObservationInstant("2026-02-29T00:00:00Z")).toBe(false);
    expect(isObservationInstant("2100-02-29T00:00:00Z")).toBe(false);
    expect(isObservationInstant("2024-02-29T12:00:00.000Z")).toBe(true);
    expect(isObservationInstant("2000-02-29T00:00:00Z")).toBe(true);
  });

  it("rejects other non-existent days and out-of-range times", () => {
    expect(isObservationInstant("2026-04-31T00:00:00Z")).toBe(false);
    expect(isObservationInstant("2026-09-00T00:00:00Z")).toBe(false);
    expect(isObservationInstant("2026-00-09T00:00:00Z")).toBe(false);
    expect(isObservationInstant("2026-09-07T24:00:00Z")).toBe(false);
    expect(isObservationInstant("2026-09-07T00:60:00Z")).toBe(false);
    expect(isObservationInstant("2026-09-07T00:00:60Z")).toBe(false);
  });

  it("separates a valid, an absent and an invalid observation time", () => {
    expect(inventoryObservationTime(inventory({}))).toEqual({
      kind: "VALID",
      instant: OBSERVED_AT,
    });
    expect(inventoryObservationTime(inventory({}, null))).toEqual({
      kind: "ABSENT",
    });
    expect(inventoryObservationTime(inventory({}, "yesterday"))).toEqual({
      kind: "INVALID",
    });
  });
});

describe("inventory gap classification", () => {
  it("reports an invalid count as a defect, not as a count", () => {
    const record = inventory({
      kept: { kind: "COUNTED", rows: 4 },
      "run-rows": { kind: "COUNTED", rows: Number.NaN },
    });
    expect(inventoryGaps(record, MANIFEST)).toEqual([
      { categoryId: "run-rows", reason: "OBSERVATION_COUNT_INVALID" },
    ]);
    expect(invalidObservations(record, MANIFEST)).toHaveLength(1);
    expect(countedRows(record, "run-rows")).toBeNull();
    expect(countedRows(record, "kept")).toBe(4);
    expect(countedCategoryIds(record, MANIFEST)).toEqual(["kept"]);
  });

  it("still counts an invalid observation as a claim that a read happened", () => {
    const record = inventory({
      kept: { kind: "COUNTED", rows: Number.NaN },
      "run-rows": { kind: "COUNTED", rows: Number.NaN },
    });
    expect(countedCategoryIds(record, MANIFEST)).toEqual([]);
    expect(countClaimedCategoryIds(record, MANIFEST)).toEqual([
      "kept",
      "run-rows",
    ]);
  });

  it("rejects a negative or fractional count", () => {
    const record = inventory({
      kept: { kind: "COUNTED", rows: -3 },
      "run-rows": { kind: "COUNTED", rows: 2.5 },
    });
    expect(inventoryGaps(record, MANIFEST).map((gap) => gap.reason)).toEqual([
      "OBSERVATION_COUNT_INVALID",
      "OBSERVATION_COUNT_INVALID",
    ]);
    expect(countedCategoryIds(record, MANIFEST)).toEqual([]);
  });

  it("does not let an unknown observation kind pass as complete", () => {
    const record = inventory({
      kept: { kind: "COUNTED", rows: 1 },
      "run-rows": { kind: "GUESSED" } as unknown as CategoryObservation,
    });
    expect(inventoryGaps(record, MANIFEST)).toEqual([
      { categoryId: "run-rows", reason: "OBSERVATION_NOT_INTERPRETABLE" },
    ]);
  });

  it("does not let an unknown unavailability reason pass as a stated reason", () => {
    const record = inventory({
      kept: { kind: "COUNTED", rows: 1 },
      "run-rows": {
        kind: "UNAVAILABLE",
        reason: "BECAUSE",
      } as unknown as CategoryObservation,
    });
    expect(inventoryGaps(record, MANIFEST)).toEqual([
      { categoryId: "run-rows", reason: "OBSERVATION_NOT_INTERPRETABLE" },
    ]);
  });

  it("keeps a stated unavailability separate from a defect", () => {
    const record = inventory({
      kept: { kind: "COUNTED", rows: 1 },
      "run-rows": { kind: "UNAVAILABLE", reason: "SUBSYSTEM_NOT_READABLE" },
    });
    expect(inventoryGaps(record, MANIFEST)).toEqual([
      { categoryId: "run-rows", reason: "SUBSYSTEM_NOT_READABLE" },
    ]);
    expect(invalidObservations(record, MANIFEST)).toEqual([]);
  });

  it("keeps the no-reader default free of counts and of an observation time", () => {
    const record = unavailableDemoResetInventory(
      "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
      MANIFEST,
    );
    expect(inventoryObservationTime(record)).toEqual({ kind: "ABSENT" });
    expect(countedCategoryIds(record, MANIFEST)).toEqual([]);
    expect(invalidObservations(record, MANIFEST)).toEqual([]);
    expect(inventoryGaps(record, MANIFEST)).toHaveLength(2);
  });
});

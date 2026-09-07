import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGACY_FIXTURE_FALLBACK_POINTS } from "@/lib/demo-reset/legacy-fixture-fallback";

describe("legacy fixture fallback registry", () => {
  it("registers each module path once", () => {
    const paths = LEGACY_FIXTURE_FALLBACK_POINTS.map(
      (point) => point.modulePath,
    );
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("points at source files that still exist", () => {
    for (const point of LEGACY_FIXTURE_FALLBACK_POINTS) {
      expect(
        existsSync(point.modulePath),
        `${point.modulePath} is registered but missing`,
      ).toBe(true);
    }
  });

  it("names symbols the registered module still declares", () => {
    for (const point of LEGACY_FIXTURE_FALLBACK_POINTS) {
      const source = readFileSync(point.modulePath, "utf8");
      for (const symbol of point.symbols) {
        expect(
          source,
          `${symbol} is no longer declared in ${point.modulePath}`,
        ).toContain(symbol);
      }
    }
  });

  it("states a behaviour and a disable stage for every point", () => {
    for (const point of LEGACY_FIXTURE_FALLBACK_POINTS) {
      expect(point.behaviour.trim().length).toBeGreaterThan(0);
      expect(point.disableStage.trim().length).toBeGreaterThan(0);
      expect(point.symbols.length).toBeGreaterThan(0);
    }
  });

  it("covers the empty-database fallbacks that would refill an emptied V2 view", () => {
    const paths = LEGACY_FIXTURE_FALLBACK_POINTS.map(
      (point) => point.modulePath,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        "src/data/market-core/catalog.ts",
        "src/services/secondary-market-repository.ts",
        "src/domain/market-core/participants.ts",
        "src/services/admin-service.ts",
        "src/adapters/blockchain/solana/recorded-placement.ts",
      ]),
    );
  });

  it("records the observed empty-result fallbacks rather than assuming them", () => {
    const repository = readFileSync(
      "src/services/secondary-market-repository.ts",
      "utf8",
    );
    expect(repository).toContain("dbHoldings.length > 0");

    const admin = readFileSync("src/services/admin-service.ts", "utf8");
    expect(admin).toContain("isDesignPreviewEnabled()");
    expect(admin).toContain("catalogPersonasForSwitcher()");
  });

  it("does not disable any fallback in this slice", () => {
    expect(
      readFileSync(
        "src/lib/protocols/f2f/f2f-instrument-basis-adapter.ts",
        "utf8",
      ),
    ).toContain("WHEAT_INSTRUMENT_ID");
    expect(
      readFileSync("src/domain/market-core/participants.ts", "utf8"),
    ).toContain("participantIdForOrganizationSlug");
  });
});

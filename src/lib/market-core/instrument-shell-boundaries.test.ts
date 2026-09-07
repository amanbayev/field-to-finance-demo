import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const GENERIC_SHELL_SOURCES = [
  "src/lib/market-core/instrument-shell.ts",
  "src/lib/market-core/instrument-basis-adapter.ts",
  "src/lib/market-core/economics-visibility.ts",
  "src/app/instruments/[instrumentId]/page.tsx",
  "src/components/market-core/instrument-shell-view.tsx",
] as const;

const FORBIDDEN = [
  "WHEAT-2027",
  '"F2F"',
  "WATER-FUTURE",
  "POOL-WHEAT-2027-01",
  "getPlacementSnapshot",
  "getScasSnapshot",
  "getTokenBySymbol",
  "wheatPoolCoverageFromEngine",
  "ON_CHAIN_DEMO_POOL_ID",
  "f2fModuleHref",
  "f2f-instrument-basis-adapter",
  "futureWaterBasis",
  "futureMusicBasis",
  "instrument.id ===",
  "assetClass ===",
  "empty-silo-light.png",
];

describe("generic instrument shell source boundaries", () => {
  it("does not hardcode protocol-specific ids or import F2F services", () => {
    for (const file of GENERIC_SHELL_SOURCES) {
      const source = readFileSync(file, "utf8");
      for (const token of FORBIDDEN) {
        expect(source, `${token} in ${file}`).not.toContain(token);
      }
    }
  });
});

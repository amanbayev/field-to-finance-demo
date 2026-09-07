import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const GENERIC_WORKSPACE_SOURCES = [
  "src/lib/market-core/investor-workspace.ts",
  "src/lib/market-core/investor-workspace-presentation.ts",
  "src/services/investor-workspace.ts",
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
  "recordedPlacementProof",
  "DEMO-FUND-001",
  "DEMO-TRADER-001",
  "instrument.id ===",
  "assetClass ===",
] as const;

describe("generic investor workspace source boundaries", () => {
  it("does not hardcode protocol-specific ids or import F2F services", () => {
    for (const file of GENERIC_WORKSPACE_SOURCES) {
      const source = readFileSync(file, "utf8");
      for (const token of FORBIDDEN) {
        expect(source, `${token} in ${file}`).not.toContain(token);
      }
    }
  });
});

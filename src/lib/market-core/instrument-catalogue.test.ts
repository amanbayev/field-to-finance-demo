import { describe, expect, it } from "vitest";
import type { AssetProtocol, MarketInstrument } from "@/domain/market-core";
import {
  INSTRUMENT_FAMILY_KEYS,
  groupInstrumentCatalogue,
} from "@/lib/market-core/instrument-catalogue";
import { boundProtocolVersionHref } from "@/lib/market-core/hierarchy";
import {
  F2F_PROTOCOL_ID,
  F2F_PROTOCOL_INVESTMENT_ID,
  F2F_V1_1_VERSION_ID,
  WHEAT_INSTRUMENT_ID,
  assetProtocols,
  instrumentById,
  marketInstruments,
} from "@/data/market-core/catalog";

function protocol(id: string, name = id): AssetProtocol {
  return {
    id,
    name,
    assetClass: "WATER",
    protocolOwner: "Not appointed",
    operator: "Test operator",
    status: "STRUCTURING",
    regulatoryStatus: "NOT_SUBMITTED",
    currentVersionId: null,
  };
}

function instrument(overrides: Partial<MarketInstrument>): MarketInstrument {
  return {
    ...instrumentById(WHEAT_INSTRUMENT_ID)!,
    id: "SYNTH",
    symbol: "SYNTH",
    assetProtocolId: "TIDAL",
    protocolVersionId: null,
    assetClass: "WATER",
    ...overrides,
  };
}

describe("instrument catalogue grouping", () => {
  it("groups by protocol, then family, then lifecycle status", () => {
    const groups = groupInstrumentCatalogue(
      [protocol("TIDAL", "Tidal Energy")],
      [
        instrument({ id: "A", symbol: "A", status: "ISSUED" }),
        instrument({ id: "B", symbol: "B", status: "STRUCTURING" }),
        instrument({ id: "C", symbol: "C", status: "ISSUED" }),
      ],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.protocol.id).toBe("TIDAL");
    const [family] = groups[0]!.families;
    expect(family!.instrumentType).toBe("ASSET_TOKEN");
    expect(family!.statuses.map((s) => s.status)).toEqual(["ISSUED", "STRUCTURING"]);
    expect(family!.statuses[0]!.instruments.map((i) => i.id)).toEqual(["A", "C"]);
    expect(family!.statuses[1]!.instruments.map((i) => i.id)).toEqual(["B"]);
  });

  it("separates families and never labels one as the other", () => {
    const groups = groupInstrumentCatalogue(
      [protocol("TIDAL")],
      [
        instrument({ id: "ASSET", symbol: "ASSET", status: "STRUCTURING" }),
        instrument({
          id: "INVEST",
          symbol: "INVEST",
          status: "STRUCTURING",
          instrumentType: "PROTOCOL_INVESTMENT",
        }),
      ],
    );
    const families = groups[0]!.families;
    expect(families.map((f) => f.instrumentType)).toEqual([
      "ASSET_TOKEN",
      "PROTOCOL_INVESTMENT",
    ]);
    // A structuring asset must not land in, or be labelled as, a protocol investment.
    expect(families[0]!.statuses[0]!.instruments.map((i) => i.id)).toEqual(["ASSET"]);
    expect(families[0]!.labelKey).toBe(INSTRUMENT_FAMILY_KEYS.ASSET_TOKEN);
    expect(families[1]!.statuses[0]!.instruments.map((i) => i.id)).toEqual(["INVEST"]);
    expect(families[1]!.labelKey).toBe(INSTRUMENT_FAMILY_KEYS.PROTOCOL_INVESTMENT);
  });

  it("omits a protocol with no instruments rather than padding it", () => {
    const groups = groupInstrumentCatalogue(
      [protocol("TIDAL"), protocol("EMPTY")],
      [instrument({ id: "A", symbol: "A" })],
    );
    expect(groups.map((g) => g.protocol.id)).toEqual(["TIDAL"]);
  });

  it("omits an empty family rather than showing an empty heading", () => {
    const groups = groupInstrumentCatalogue(
      [protocol("TIDAL")],
      [instrument({ id: "A", symbol: "A" })],
    );
    expect(groups[0]!.families).toHaveLength(1);
    expect(groups[0]!.families[0]!.instrumentType).toBe("ASSET_TOKEN");
  });

  it("retains truthful version binding for bound and unbound instruments", () => {
    const bound = instrument({
      id: "BOUND",
      symbol: "BOUND",
      protocolVersionId: "TIDAL-V1",
    });
    const unbound = instrument({ id: "UNBOUND", symbol: "UNBOUND" });
    const groups = groupInstrumentCatalogue([protocol("TIDAL")], [bound, unbound]);
    const all = groups[0]!.families.flatMap((f) =>
      f.statuses.flatMap((s) => s.instruments),
    );
    expect(boundProtocolVersionHref(all.find((i) => i.id === "BOUND")!)).toBe(
      "/protocols/TIDAL/versions/TIDAL-V1",
    );
    expect(
      boundProtocolVersionHref(all.find((i) => i.id === "UNBOUND")!),
    ).toBeUndefined();
  });

  it("invents no economics for any grouped instrument", () => {
    const groups = groupInstrumentCatalogue(assetProtocols, marketInstruments);
    for (const group of groups) {
      for (const family of group.families) {
        for (const status of family.statuses) {
          for (const item of status.instruments) {
            expect(item).not.toHaveProperty("price");
            expect(item).not.toHaveProperty("yield");
            expect(item).not.toHaveProperty("offer");
          }
        }
      }
    }
  });

  it("groups the shipped catalogue truthfully", () => {
    const groups = groupInstrumentCatalogue(assetProtocols, marketInstruments);
    expect(groups.map((g) => g.protocol.id)).toEqual([F2F_PROTOCOL_ID]);
    const [asset, investment] = groups[0]!.families;
    expect(asset!.statuses[0]!.status).toBe("ISSUED");
    expect(asset!.statuses[0]!.instruments.map((i) => i.id)).toEqual([
      WHEAT_INSTRUMENT_ID,
    ]);
    expect(asset!.statuses[0]!.instruments[0]!.protocolVersionId).toBe(
      F2F_V1_1_VERSION_ID,
    );
    expect(investment!.instrumentType).toBe("PROTOCOL_INVESTMENT");
    expect(investment!.statuses[0]!.status).toBe("STRUCTURING");
    expect(investment!.statuses[0]!.instruments.map((i) => i.id)).toEqual([
      F2F_PROTOCOL_INVESTMENT_ID,
    ]);
    expect(investment!.statuses[0]!.instruments[0]!.protocolVersionId).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  currentVersionForProtocol,
  protocolVersionById,
  resolveGoverningProtocolVersion,
  type AssetProtocol,
  type MarketInstrument,
  type ProtocolVersion,
} from "@/domain/market-core";
import {
  F2F_PROTOCOL_ID,
  F2F_PROTOCOL_INVESTMENT_ID,
  F2F_V1_1_VERSION_ID,
  GAMING_PROTOCOL_ID,
  MUSIC_PROTOCOL_ID,
  WATER_PROTOCOL_ID,
  WHEAT_INSTRUMENT_ID,
  instrumentById,
  instrumentsForProtocolVersion,
  marketInstruments,
  protocolById,
  protocolVersions,
} from "@/data/market-core/catalog";
import {
  getProtocolVersionContext,
  listAssetProtocolsWithCurrentVersion,
} from "@/services/market-core-service";
import { boundProtocolVersionHref } from "@/lib/market-core/hierarchy";
import { protocolVersionGovernanceKey } from "@/lib/market-core/presentation";

describe("protocol version context", () => {
  it("resolves a valid protocol and version", () => {
    const context = getProtocolVersionContext(F2F_PROTOCOL_ID, F2F_V1_1_VERSION_ID)!;
    expect(context).not.toBeNull();
    expect(context.protocol.id).toBe(F2F_PROTOCOL_ID);
    expect(context.version.id).toBe(F2F_V1_1_VERSION_ID);
    expect(context.version.displayVersion).toBe("1.1");
    expect(context.boundInstruments.map((i) => i.id)).toEqual([WHEAT_INSTRUMENT_ID]);
  });

  it("returns null for an unknown protocol", () => {
    expect(getProtocolVersionContext("NOPE", F2F_V1_1_VERSION_ID)).toBeNull();
  });

  it("returns null for an unknown version", () => {
    expect(getProtocolVersionContext(F2F_PROTOCOL_ID, "F2F-V9.9")).toBeNull();
  });

  it("returns null for a protocol/version mismatch", () => {
    expect(getProtocolVersionContext(WATER_PROTOCOL_ID, F2F_V1_1_VERSION_ID)).toBeNull();
    expect(getProtocolVersionContext(MUSIC_PROTOCOL_ID, F2F_V1_1_VERSION_ID)).toBeNull();
  });

  it("never renders the canonical English governance note as UI copy", () => {
    const context = getProtocolVersionContext(F2F_PROTOCOL_ID, F2F_V1_1_VERSION_ID)!;
    const key = protocolVersionGovernanceKey(context.version.id);
    expect(key).toBe("governanceNoteF2FV1_1");
    expect(key).not.toBe(context.version.governanceNote);
  });

  it("keeps activation and freeze dates unclaimed while the frozen marker stands", () => {
    const context = getProtocolVersionContext(F2F_PROTOCOL_ID, F2F_V1_1_VERSION_ID)!;
    expect(context.version.activatedAt).toBeNull();
    expect(context.version.frozenAt).toBeNull();
    expect(context.version.frozen).toBe(true);
  });
});

describe("version binding and links", () => {
  it("links WHEAT-2027 to its permanent version route", () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    expect(boundProtocolVersionHref(wheat)).toBe("/protocols/F2F/versions/F2F-V1.1");
  });

  it("does not follow the protocol's discovery pointer when it moves", () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    const laterVersion: ProtocolVersion = {
      ...protocolVersions[0]!,
      id: "F2F-V2.0",
      displayVersion: "2.0",
    };
    const movedOn: readonly ProtocolVersion[] = [...protocolVersions, laterVersion];
    const upgraded: AssetProtocol = {
      ...protocolById(F2F_PROTOCOL_ID)!,
      currentVersionId: "F2F-V2.0",
    };
    expect(currentVersionForProtocol(movedOn, upgraded)?.id).toBe("F2F-V2.0");
    expect(resolveGoverningProtocolVersion(wheat, movedOn)?.id).toBe(F2F_V1_1_VERSION_ID);
    expect(boundProtocolVersionHref(wheat)).toBe("/protocols/F2F/versions/F2F-V1.1");
  });

  it("leaves the structuring protocol investment unbound", () => {
    const investment = instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!;
    expect(investment.protocolVersionId).toBeNull();
    expect(boundProtocolVersionHref(investment)).toBeUndefined();
    expect(instrumentsForProtocolVersion(F2F_V1_1_VERSION_ID)).not.toContain(investment);
  });
});

describe("protocol catalogue truthfulness", () => {
  it("shows the recorded version for F2F and none for future protocols", () => {
    const rows = listAssetProtocolsWithCurrentVersion();
    const f2f = rows.find((r) => r.protocol.id === F2F_PROTOCOL_ID)!;
    expect(f2f.currentVersion?.id).toBe(F2F_V1_1_VERSION_ID);

    for (const id of [WATER_PROTOCOL_ID, MUSIC_PROTOCOL_ID, GAMING_PROTOCOL_ID]) {
      const row = rows.find((r) => r.protocol.id === id)!;
      expect(row.currentVersion).toBeNull();
      expect(row.protocol.currentVersionId).toBeNull();
    }
  });

  it("presents no future protocol as active, issued or approved", () => {
    const rows = listAssetProtocolsWithCurrentVersion();
    for (const id of [WATER_PROTOCOL_ID, MUSIC_PROTOCOL_ID, GAMING_PROTOCOL_ID]) {
      const { protocol } = rows.find((r) => r.protocol.id === id)!;
      expect(protocol.status).not.toBe("ACTIVE");
      expect(protocol.status).not.toBe("ADMITTED");
      expect(protocol.regulatoryStatus).toBe("NOT_SUBMITTED");
      expect(
        marketInstruments.filter((i) => i.assetProtocolId === id),
      ).toEqual([]);
    }
  });
});

describe("instrument catalogue grouping", () => {
  function group(instruments: readonly MarketInstrument[]) {
    return {
      asset: instruments.filter((i) => i.instrumentType === "ASSET_TOKEN"),
      protocolInvestment: instruments.filter(
        (i) => i.instrumentType === "PROTOCOL_INVESTMENT",
      ),
    };
  }

  it("separates issued instruments from structuring and concept records", () => {
    const { asset, protocolInvestment } = group(marketInstruments);
    expect(asset.every((i) => i.instrumentType === "ASSET_TOKEN")).toBe(true);
    expect(asset.filter((i) => i.status === "ISSUED").map((i) => i.id)).toEqual([
      WHEAT_INSTRUMENT_ID,
    ]);
    expect(protocolInvestment.map((i) => i.id)).toEqual([F2F_PROTOCOL_INVESTMENT_ID]);
    expect(protocolInvestment.every((i) => i.status !== "ISSUED")).toBe(true);
  });

  it("labels a structuring asset instrument by its own type, not as a protocol investment", () => {
    // A synthetic structuring ASSET_TOKEN must not inherit protocol-investment
    // labelling just because it is not issued.
    const structuringAsset: MarketInstrument = {
      ...instrumentById(WHEAT_INSTRUMENT_ID)!,
      id: "SYNTH-STRUCTURING",
      symbol: "SYNTH-STRUCTURING",
      status: "STRUCTURING",
      protocolVersionId: null,
      issuanceId: null,
    };
    const { asset, protocolInvestment } = group([
      ...marketInstruments,
      structuringAsset,
    ]);
    expect(asset.map((i) => i.id)).toContain("SYNTH-STRUCTURING");
    expect(protocolInvestment.map((i) => i.id)).not.toContain("SYNTH-STRUCTURING");
    expect(boundProtocolVersionHref(structuringAsset)).toBeUndefined();
  });

  it("invents no price, yield, offer or admission for any instrument", () => {
    for (const instrument of marketInstruments) {
      expect(instrument).not.toHaveProperty("price");
      expect(instrument).not.toHaveProperty("yield");
      expect(instrument).not.toHaveProperty("offer");
    }
  });
});

/**
 * Synthetic non-agriculture registry. Proves the resolution rules the version
 * route depends on are generic — they hold for a protocol with no Field to
 * Finance code path. These records are never added to the production catalogue.
 */
describe("generic resolution without Field to Finance", () => {
  const protocol: AssetProtocol = {
    id: "TIDAL",
    name: "Tidal Energy",
    assetClass: "WATER",
    protocolOwner: "Not appointed",
    operator: "Test operator",
    status: "STRUCTURING",
    regulatoryStatus: "NOT_SUBMITTED",
    currentVersionId: "TIDAL-V3.2",
  };
  const version: ProtocolVersion = {
    id: "TIDAL-V3.2",
    protocolId: "TIDAL",
    displayVersion: "3.2",
    state: "ACTIVE",
    frozen: true,
    activatedAt: null,
    frozenAt: null,
    supersedesVersionId: null,
    supersededByVersionId: null,
    governanceNote: "Synthetic non-agriculture version",
    rules: {
      verificationModel: "Metering",
      riskModel: "Offtake concentration",
      coverageModel: "Contracted revenue",
      issuanceModel: "Claim against issuer",
      redemptionModel: "Scheduled",
      lifecycle: ["site", "commissioning", "instrument"],
      modules: ["metering"],
    },
  };
  const instrument: MarketInstrument = {
    ...instrumentById(WHEAT_INSTRUMENT_ID)!,
    id: "TIDE-2030",
    symbol: "TIDE-2030",
    assetProtocolId: "TIDAL",
    protocolVersionId: "TIDAL-V3.2",
    assetClass: "WATER",
  };
  const registry: readonly ProtocolVersion[] = [version];

  /** Mirrors getProtocolVersionContext against an injected registry. */
  function resolveContext(protocolId: string, versionId: string) {
    if (protocol.id !== protocolId) {
      return null;
    }
    const found = protocolVersionById(registry, versionId);
    if (!found || found.protocolId !== protocol.id) {
      return null;
    }
    return { protocol, version: found };
  }

  it("resolves a non-agriculture protocol version", () => {
    const context = resolveContext("TIDAL", "TIDAL-V3.2")!;
    expect(context.version.displayVersion).toBe("3.2");
    expect(context.protocol.assetClass).toBe("WATER");
  });

  it("applies the same absence rules to a non-agriculture protocol", () => {
    expect(resolveContext("NOPE", "TIDAL-V3.2")).toBeNull();
    expect(resolveContext("TIDAL", "TIDAL-V9.9")).toBeNull();
    expect(
      protocolVersionById([{ ...version, protocolId: "OTHER" }], "TIDAL-V3.2")
        ?.protocolId,
    ).not.toBe(protocol.id);
  });

  it("binds and links a non-agriculture instrument through its own version", () => {
    expect(resolveGoverningProtocolVersion(instrument, registry)?.id).toBe("TIDAL-V3.2");
    expect(boundProtocolVersionHref(instrument)).toBe(
      "/protocols/TIDAL/versions/TIDAL-V3.2",
    );
    expect(currentVersionForProtocol(registry, protocol)?.id).toBe("TIDAL-V3.2");
  });

  it("leaks no synthetic record into the production catalogue", () => {
    expect(marketInstruments.map((i) => i.id)).not.toContain("TIDE-2030");
    expect(protocolVersions.map((v) => v.id)).not.toContain("TIDAL-V3.2");
    expect(protocolVersions).toHaveLength(1);
    expect(protocolById("TIDAL")).toBeUndefined();
  });
});

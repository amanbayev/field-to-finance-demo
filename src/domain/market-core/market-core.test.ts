import { describe, expect, it } from "vitest";
import {
  LEGAL_OPERATOR,
  availableBalance,
  canReceive,
  canTrade,
  eligibilityFor,
  isSecondaryTrade,
  phaseCreatesNoSecondaryTrade,
  assertChannelsShareMarketCore,
} from "@/domain/market-core";
import {
  F2F_PROTOCOL_ID,
  F2F_PROTOCOL_INVESTMENT_ID,
  WHEAT_INSTRUMENT_ID,
  distributionChannels,
  eligibilityMatrix,
  holdings,
  instrumentById,
  marketForInstrument,
  marketInstruments,
  protocolById,
  trades,
} from "@/data/market-core/catalog";
import { tokens } from "@/data/mock/tokens";

describe("market core boundaries", () => {
  it("treats WHEAT-2027 as a generic Instrument on the F2F AssetProtocol", () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID);
    const protocol = protocolById(F2F_PROTOCOL_ID);
    expect(wheat?.instrumentType).toBe("ASSET_TOKEN");
    expect(wheat?.assetProtocolId).toBe(F2F_PROTOCOL_ID);
    expect(wheat?.assetClass).toBe("AGRICULTURE");
    expect(protocol?.id).toBe(F2F_PROTOCOL_ID);
    expect(protocol?.name).toBe("Field to Finance");
    expect(protocol?.id).not.toBe(wheat?.id);
    expect(protocol?.assetClass).toBe("AGRICULTURE");
  });

  it("does not conflate AssetProtocol with Instrument", () => {
    const protocol = protocolById(F2F_PROTOCOL_ID)!;
    const wheat = instrumentById("WHEAT-2027")!;
    expect(protocol).not.toHaveProperty("instrumentType");
    expect(wheat).not.toHaveProperty("verificationModel");
    expect(wheat.issuanceId).toBe("ISS-001");
    expect(wheat.issuanceId).not.toBe(wheat.symbol);
  });

  it("keeps ASSET_TOKEN distinct from PROTOCOL_INVESTMENT", () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    const protocolInvestment = instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!;
    expect(wheat.instrumentType).toBe("ASSET_TOKEN");
    expect(protocolInvestment.instrumentType).toBe("PROTOCOL_INVESTMENT");
    expect(wheat.instrumentType).not.toBe(protocolInvestment.instrumentType);
    expect(protocolInvestment.status).toBe("FUTURE");
    expect(protocolInvestment.issuanceId).toBeNull();
  });

  it("scopes eligibility by participant and instrument", () => {
    expect(eligibilityFor(eligibilityMatrix, "INVESTOR-0001", WHEAT_INSTRUMENT_ID)).toBe(
      "ELIGIBLE",
    );
    expect(eligibilityFor(eligibilityMatrix, "INVESTOR-0001", "WATER-FUTURE")).toBe(
      "NOT_ASSESSED",
    );
    expect(
      eligibilityFor(eligibilityMatrix, "INVESTOR-0001", F2F_PROTOCOL_INVESTMENT_ID),
    ).toBe("NOT_ASSESSED");
    expect(eligibilityFor(eligibilityMatrix, "INVESTOR-0001", "UNKNOWN")).toBe("NOT_ASSESSED");
  });

  it("computes available balance from owned minus reserved, pledged and blocked", () => {
    expect(
      availableBalance({
        owned: 10,
        reservedForOrders: 2,
        pledged: 1,
        blocked: 0,
      }),
    ).toBe(7);
    const registrar = holdings.find((row) => row.holderReference === "REGISTRAR")!;
    const investor = holdings.find((row) => row.holderReference === "INVESTOR-0001")!;
    expect(registrar.available).toBe(990);
    expect(investor.available).toBe(10);
    expect(registrar.buckets.owned).toBe(tokens[0]!.registrarInventory);
    expect(investor.buckets.owned).toBe(tokens[0]!.circulating);
  });

  it("does not let a future distribution channel bypass Market Core", () => {
    expect(assertChannelsShareMarketCore(distributionChannels)).toBe(true);
    expect(distributionChannels.every((channel) => channel.routesToMarketCore)).toBe(true);
    expect(distributionChannels.find((channel) => channel.channel === "DIRECT_MTP")?.active).toBe(
      true,
    );
    expect(distributionChannels.filter((channel) => channel.active)).toHaveLength(1);
  });

  it("creates no secondary trade in Phase 5A and blocks trading", () => {
    expect(trades).toEqual([]);
    expect(phaseCreatesNoSecondaryTrade(trades)).toBe(true);
    expect(trades.some(isSecondaryTrade)).toBe(false);
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    const market = marketForInstrument(WHEAT_INSTRUMENT_ID)!;
    expect(market.transacting).toBe(false);
    expect(market.phase).toBe("PRIMARY_ONLY");
    expect(
      canTrade({
        eligibility: "ELIGIBLE",
        instrument: wheat,
        market,
      }),
    ).toBe(false);
    expect(canReceive({ eligibility: "ELIGIBLE", instrument: wheat })).toBe(true);
    const protocolInvestment = instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!;
    expect(
      canReceive({ eligibility: "ELIGIBLE", instrument: protocolInvestment }),
    ).toBe(false);
  });

  it("does not encode grain-specific market types and names the legal operator", () => {
    expect(LEGAL_OPERATOR).toBe("CommoChain Ltd");
    expect(marketInstruments.some((item) => item.id.includes("WheatOrder"))).toBe(false);
    expect(Object.keys(marketForInstrument(WHEAT_INSTRUMENT_ID)!)).not.toContain("wheatBook");
  });
});

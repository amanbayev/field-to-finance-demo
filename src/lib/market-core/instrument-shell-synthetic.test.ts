import { describe, expect, it } from "vitest";
import type { ActorContext, Permission } from "@/domain/identity";
import type {
  AssetProtocol,
  Holding,
  Market,
  MarketInstrument,
  ProtocolVersion,
} from "@/domain/market-core";
import { ADMISSION_STAGES, resolveGoverningProtocolVersion } from "@/domain/market-core";
import {
  F2F_PROTOCOL_ID,
  marketInstruments,
  protocolById,
  protocolVersions,
} from "@/data/market-core/catalog";
import { ECONOMICS_WITHHELD_REASON_KEY } from "./economics-visibility";
import {
  BASIS_ADAPTER_UNAVAILABLE_KEY,
  createInstrumentBasisAdapterRegistry,
  type InstrumentEconomicBasisAdapter,
} from "./instrument-basis-adapter";
import {
  resolveInstrumentShell,
  type InstrumentShellCanonicalSource,
} from "./instrument-shell";
import { createF2fInstrumentBasisAdapter } from "@/lib/protocols/f2f/f2f-instrument-basis-adapter";

/**
 * Synthetic non-agriculture records. Never added to the production catalogue.
 * Proves the production shell resolver is generic.
 */
const TIDAL_PROTOCOL: AssetProtocol = {
  id: "TIDAL",
  name: "Tidal Energy",
  assetClass: "WATER",
  protocolOwner: "Not appointed",
  operator: "Test operator",
  status: "STRUCTURING",
  regulatoryStatus: "NOT_SUBMITTED",
  currentVersionId: "TIDAL-V9.9",
};

const TIDAL_BOUND_VERSION: ProtocolVersion = {
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
    lifecycle: ["site", "commissioning"],
    modules: ["metering"],
  },
};

const TIDAL_DISCOVERY_VERSION: ProtocolVersion = {
  ...TIDAL_BOUND_VERSION,
  id: "TIDAL-V9.9",
  displayVersion: "9.9",
};

const TIDAL_INSTRUMENT: MarketInstrument = {
  id: "TIDE-2030",
  symbol: "TIDE-2030",
  name: "Synthetic tidal instrument",
  instrumentType: "ASSET_TOKEN",
  assetProtocolId: "TIDAL",
  protocolVersionId: "TIDAL-V3.2",
  assetClass: "WATER",
  issuerId: "test-issuer",
  issuerName: "Test Issuer",
  issuanceId: "TIDE-ISS-001",
  legalClassification: "Test",
  denomination: "1 metered unit",
  decimals: 0,
  currencyOrUnit: "u",
  transferPolicy: "Test",
  eligibilityPolicy: "Participant × instrument",
  settlementPolicy: "Test",
  custodyPolicy: "Test",
  status: "ISSUED",
};

const TIDAL_MARKET: Market = {
  id: "MKT-TIDE-2030",
  instrumentId: "TIDE-2030",
  phase: "CLOSED",
  activeChannel: "DIRECT_MTP",
  transacting: false,
  matchingEnabled: false,
  settlementEnabled: false,
  demonstratorStatus: "DEMO_CLOSED",
  settlementAssetId: "DEMO-KZT",
  settlementAssetLabel: "DEMO-KZT",
  settlementHasMonetaryValue: false,
  marketType: "REGULATED_INSTITUTIONAL_DEMONSTRATOR",
  allowedOrderTypes: ["LIMIT"],
  wholeQuantityOnly: true,
};

const TIDAL_HOLDING: Holding = {
  id: "hld-tide",
  instrumentId: "TIDE-2030",
  holderReference: "TEST-HOLDER",
  holderName: "Test Holder",
  buckets: {
    owned: 4,
    reservedForOrders: 1,
    pledged: 0,
    blocked: 0,
    pendingIn: 0,
    pendingOut: 0,
  },
  available: 3,
};

function actor(): ActorContext {
  const permissions: Permission[] = ["issuance.read", "market.read"];
  return {
    principal: {
      userId: "test-user",
      email: "test@example.com",
      displayName: "Test",
      status: "ACTIVE",
      permissions,
      memberships: [],
      organizations: [],
      roleIds: [],
    },
    effective: { roleId: "INVESTOR", permissions, producerIds: [] },
    isImpersonating: false,
  };
}

function tidalCanonicalSource(
  instrument: MarketInstrument = TIDAL_INSTRUMENT,
): InstrumentShellCanonicalSource {
  const versions = [TIDAL_BOUND_VERSION, TIDAL_DISCOVERY_VERSION];
  return {
    getInstrumentMarketContext(instrumentId: string) {
      if (instrumentId !== instrument.id && instrumentId !== instrument.symbol) {
        return null;
      }
      return {
        instrument,
        protocol: TIDAL_PROTOCOL,
        market: instrument.status === "ISSUED" ? TIDAL_MARKET : null,
        protocolVersion: resolveGoverningProtocolVersion(instrument, versions),
      };
    },
    listHoldings({ instrumentId }) {
      return instrumentId === TIDAL_HOLDING.instrumentId ? [TIDAL_HOLDING] : [];
    },
    listAdmission() {
      return ADMISSION_STAGES.map((stage) => ({ stage, complete: false }));
    },
  };
}

function tidalAdapter(): InstrumentEconomicBasisAdapter {
  return {
    protocolId: "TIDAL",
    supports(input) {
      return input.instrument.assetProtocolId === "TIDAL";
    },
    async resolve(input) {
      return {
        kind: "AVAILABLE",
        facts: [
          {
            id: "metering",
            labelKey: "meteringSite",
            value: { kind: "TEXT", text: "site-alpha" },
          },
        ],
        metrics: [],
        terms: [
          {
            id: "denomination",
            labelKey: "denomination",
            value: { kind: "TEXT", text: input.instrument.denomination },
          },
        ],
        risks: [],
        overviewMetrics: [],
        links: [],
        notices: [{ id: "tidal-basis", messageKey: "tidalBasisNotice" }],
        evidence: [],
        protocolSlot: null,
      };
    },
  };
}

function greedyTidalAdapter(): InstrumentEconomicBasisAdapter {
  return {
    protocolId: "TIDAL",
    supports: () => true,
    async resolve() {
      return {
        kind: "AVAILABLE",
        facts: [
          {
            id: "price",
            labelKey: "price",
            category: "PRICE",
            value: { kind: "TEXT", text: "12" },
          },
          {
            id: "yield",
            labelKey: "yield",
            category: "YIELD",
            value: { kind: "PERCENT", value: 8 },
          },
        ],
        metrics: [],
        terms: [
          {
            id: "term",
            labelKey: "term",
            category: "TERM",
            value: { kind: "TEXT", text: "5y" },
          },
        ],
        risks: [],
        overviewMetrics: [
          {
            id: "offer",
            labelKey: "offer",
            category: "OFFER",
            value: { kind: "TEXT", text: "open subscription" },
          },
        ],
        links: [],
        notices: [],
        evidence: [],
        protocolSlot: null,
      };
    },
  };
}

describe("synthetic non-agriculture instrument shell", () => {
  it("resolves through the production shell resolver with an injected adapter", async () => {
    let f2fSupports = 0;
    let f2fResolves = 0;
    const f2f = createF2fInstrumentBasisAdapter();
    const f2fSpy: InstrumentEconomicBasisAdapter = {
      protocolId: F2F_PROTOCOL_ID,
      supports(input) {
        f2fSupports += 1;
        return f2f.supports(input);
      },
      async resolve(input) {
        f2fResolves += 1;
        return f2f.resolve(input);
      },
    };
    const shell = await resolveInstrumentShell({
      instrumentId: "TIDE-2030",
      actor: actor(),
      canonical: tidalCanonicalSource(),
      adapters: createInstrumentBasisAdapterRegistry([f2fSpy, tidalAdapter()]),
    });
    expect(shell).not.toBeNull();
    expect(shell!.instrument.id).toBe("TIDE-2030");
    expect(shell!.instrument.symbol).toBe("TIDE-2030");
    expect(shell!.protocol?.id).toBe("TIDAL");
    expect(shell!.protocolVersion?.id).toBe("TIDAL-V3.2");
    expect(shell!.protocol?.currentVersionId).toBe("TIDAL-V9.9");
    expect(shell!.versionHref).toBe("/protocols/TIDAL/versions/TIDAL-V3.2");
    expect(shell!.basis.kind).toBe("AVAILABLE");
    if (shell!.basis.kind === "AVAILABLE") {
      expect(shell!.basis.notices.map((item) => item.messageKey)).toEqual([
        "tidalBasisNotice",
      ]);
      expect(shell!.basis.facts[0]?.value).toEqual({
        kind: "TEXT",
        text: "site-alpha",
      });
      expect(JSON.stringify(shell!.basis)).not.toMatch(
        /WHEAT|agriculture|SCAS|POOL-WHEAT|basisAgriculture/i,
      );
    }
    expect(f2fSupports).toBe(0);
    expect(f2fResolves).toBe(0);
    expect(marketInstruments.map((item) => item.id)).not.toContain("TIDE-2030");
    expect(protocolById("TIDAL")).toBeUndefined();
    expect(protocolVersions.map((item) => item.id)).not.toContain("TIDAL-V3.2");
  });

  it("shows unavailable, not an F2F fallback, when no adapter is registered", async () => {
    let f2fCalls = 0;
    const f2f = createF2fInstrumentBasisAdapter();
    const f2fSpy: InstrumentEconomicBasisAdapter = {
      protocolId: F2F_PROTOCOL_ID,
      supports(input) {
        f2fCalls += 1;
        return f2f.supports(input);
      },
      async resolve(input) {
        f2fCalls += 1;
        return f2f.resolve(input);
      },
    };
    const shell = await resolveInstrumentShell({
      instrumentId: "TIDE-2030",
      actor: actor(),
      canonical: tidalCanonicalSource(),
      adapters: createInstrumentBasisAdapterRegistry([f2fSpy]),
    });
    expect(shell?.basis).toEqual({
      kind: "UNAVAILABLE",
      reasonKey: BASIS_ADAPTER_UNAVAILABLE_KEY,
    });
    expect(f2fCalls).toBe(0);
  });

  it("withholds structuring and concept instruments even if the test adapter returns price and yield", async () => {
    for (const status of ["STRUCTURING", "CONCEPT"] as const) {
      let resolveCalls = 0;
      const greedy: InstrumentEconomicBasisAdapter = {
        ...greedyTidalAdapter(),
        async resolve(input) {
          resolveCalls += 1;
          return greedyTidalAdapter().resolve(input);
        },
      };
      const instrument: MarketInstrument = {
        ...TIDAL_INSTRUMENT,
        status: status as MarketInstrument["status"],
        protocolVersionId: null,
        issuanceId: null,
      };
      const shell = await resolveInstrumentShell({
        instrumentId: "TIDE-2030",
        actor: actor(),
        canonical: tidalCanonicalSource(instrument),
        adapters: createInstrumentBasisAdapterRegistry([greedy]),
      });
      expect(shell?.mayShowEconomics).toBe(false);
      expect(shell?.basis).toEqual({
        kind: "WITHHELD",
        reasonKey: ECONOMICS_WITHHELD_REASON_KEY,
      });
      expect(resolveCalls).toBe(0);
      expect(JSON.stringify(shell?.basis)).not.toMatch(/12|5y|open subscription/);
    }
  });
});

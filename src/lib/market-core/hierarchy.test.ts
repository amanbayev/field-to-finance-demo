import { describe, expect, it } from "vitest";
import type {
  AssetProtocol,
  MarketInstrument,
  ProtocolVersion,
} from "@/domain/market-core";
import {
  HIERARCHY_LEVELS,
  HIERARCHY_LEVEL_KEYS,
  boundProtocolVersionHref,
  instrumentTrail,
  instrumentsTrail,
  issuanceTrail,
  issuancesTrail,
  marketTrail,
  marketsTrail,
  platformTrail,
  protocolModuleTrail,
  protocolTrail,
  protocolVersionHref,
  protocolVersionTrail,
  protocolsTrail,
  type HierarchyCrumb,
} from "@/lib/market-core/hierarchy";
import en from "../../../messages/en.json";

/** Resolves a trail the way MarketCoreContextHeader does, for visible assertions. */
function render(trail: HierarchyCrumb[]): Array<{ label: string; href?: string }> {
  const messages = en.marketCore as unknown as Record<string, string>;
  return trail.map((crumb) => ({
    label: crumb.labelKey !== undefined ? messages[crumb.labelKey]! : crumb.label,
    href: crumb.href,
  }));
}

function labels(trail: HierarchyCrumb[]): string[] {
  return render(trail).map((item) => item.label);
}

/** Synthetic non-agriculture fixtures; never added to the production catalogue. */
const TIDAL_PROTOCOL: AssetProtocol = {
  id: "TIDAL",
  name: "Tidal Energy",
  assetClass: "WATER",
  protocolOwner: "Not appointed",
  operator: "Test operator",
  status: "STRUCTURING",
  regulatoryStatus: "NOT_SUBMITTED",
  currentVersionId: "TIDAL-V3.2",
};

const TIDAL_VERSION: ProtocolVersion = {
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
  denomination: "1 unit",
  decimals: 0,
  currencyOrUnit: "u",
  transferPolicy: "Test",
  eligibilityPolicy: "Participant × instrument",
  settlementPolicy: "Test",
  custodyPolicy: "Test",
  status: "ISSUED",
};

describe("hierarchy levels", () => {
  it("declares the six canonical levels with a message key each", () => {
    expect([...HIERARCHY_LEVELS]).toEqual([
      "PLATFORM",
      "PROTOCOL",
      "PROTOCOL_VERSION",
      "INSTRUMENT",
      "ISSUANCE",
      "MARKET",
    ]);
    for (const level of HIERARCHY_LEVELS) {
      expect(HIERARCHY_LEVEL_KEYS[level]).toBeTruthy();
    }
  });
});

describe("breadcrumb trails — visible labels and hrefs", () => {
  it("names the platform Commodity Chain, not Markets", () => {
    expect(labels(platformTrail())).toEqual(["Commodity Chain"]);
    expect(labels(protocolsTrail())[0]).toBe("Commodity Chain");
    expect(labels(protocolsTrail())).not.toContain("Markets");
  });

  it("shows the collection on every collection screen", () => {
    expect(labels(protocolsTrail())).toEqual(["Commodity Chain", "Protocols"]);
    expect(labels(instrumentsTrail())).toEqual(["Commodity Chain", "Instruments"]);
    expect(labels(issuancesTrail())).toEqual(["Commodity Chain", "Issuances"]);
    expect(labels(marketsTrail())).toEqual(["Commodity Chain", "Markets"]);
  });

  it("builds the protocol trail with correct hrefs", () => {
    expect(render(protocolTrail(TIDAL_PROTOCOL))).toEqual([
      { label: "Commodity Chain", href: "/" },
      { label: "Protocols", href: "/protocols" },
      { label: "Tidal Energy", href: undefined },
    ]);
  });

  it("builds the version trail with correct hrefs", () => {
    expect(render(protocolVersionTrail(TIDAL_PROTOCOL, TIDAL_VERSION))).toEqual([
      { label: "Commodity Chain", href: "/" },
      { label: "Protocols", href: "/protocols" },
      { label: "Tidal Energy", href: "/protocols/TIDAL" },
      { label: "TIDAL-V3.2", href: undefined },
    ]);
  });

  it("puts the bound version in the instrument trail", () => {
    expect(render(instrumentTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL, TIDAL_VERSION))).toEqual(
      [
        { label: "Commodity Chain", href: "/" },
        { label: "Protocols", href: "/protocols" },
        { label: "Tidal Energy", href: "/protocols/TIDAL" },
        { label: "TIDAL-V3.2", href: "/protocols/TIDAL/versions/TIDAL-V3.2" },
        { label: "TIDE-2030", href: undefined },
      ],
    );
  });

  it("omits the version level honestly when the instrument has no binding", () => {
    const unbound = { ...TIDAL_INSTRUMENT, protocolVersionId: null };
    expect(labels(instrumentTrail(unbound, TIDAL_PROTOCOL, null))).toEqual([
      "Commodity Chain",
      "Protocols",
      "Tidal Energy",
      "TIDE-2030",
    ]);
  });

  it("omits the version level when the version belongs to another protocol", () => {
    const foreign = { ...TIDAL_VERSION, protocolId: "OTHER" };
    expect(labels(instrumentTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL, foreign))).not.toContain(
      "TIDAL-V3.2",
    );
  });

  it("omits protocol and version levels when the protocol record is absent", () => {
    expect(labels(instrumentTrail(TIDAL_INSTRUMENT, null, TIDAL_VERSION))).toEqual([
      "Commodity Chain",
      "TIDE-2030",
    ]);
  });

  it("builds issuance trails from the records available", () => {
    expect(
      render(
        issuanceTrail("TIDE-ISS-001", TIDAL_INSTRUMENT, TIDAL_PROTOCOL, TIDAL_VERSION),
      ),
    ).toEqual([
      { label: "Commodity Chain", href: "/" },
      { label: "Protocols", href: "/protocols" },
      { label: "Tidal Energy", href: "/protocols/TIDAL" },
      { label: "TIDAL-V3.2", href: "/protocols/TIDAL/versions/TIDAL-V3.2" },
      { label: "TIDE-2030", href: "/instruments/TIDE-2030" },
      { label: "TIDE-ISS-001", href: undefined },
    ]);
    expect(labels(issuanceTrail("TIDE-ISS-001", null, null))).toEqual([
      "Commodity Chain",
      "Issuances",
      "TIDE-ISS-001",
    ]);
  });

  it("builds market trails from the traded instrument's records", () => {
    const trail = render(
      marketTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL, TIDAL_VERSION, "sectionMarket"),
    );
    expect(trail.map((c) => c.label)).toEqual([
      "Commodity Chain",
      "Protocols",
      "Tidal Energy",
      "TIDAL-V3.2",
      "TIDE-2030",
      "Market",
    ]);
    expect(labels(marketTrail(null, null))).toEqual([
      "Commodity Chain",
      "Markets",
      "Market",
    ]);
  });

  it("never yields an empty or missing label", () => {
    const all = [
      platformTrail(),
      protocolsTrail(),
      instrumentsTrail(),
      issuancesTrail(),
      marketsTrail(),
      protocolTrail(TIDAL_PROTOCOL),
      protocolVersionTrail(TIDAL_PROTOCOL, TIDAL_VERSION),
      instrumentTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL, TIDAL_VERSION),
      issuanceTrail("TIDE-ISS-001", TIDAL_INSTRUMENT, TIDAL_PROTOCOL, TIDAL_VERSION),
      marketTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL, TIDAL_VERSION),
      protocolModuleTrail(TIDAL_PROTOCOL, "Metering", {
        protocolsCollection: true,
        protocolDetail: true,
      }),
      protocolModuleTrail(TIDAL_PROTOCOL, "Metering", {
        protocolsCollection: false,
        protocolDetail: false,
      }),
    ];
    for (const trail of all) {
      for (const item of render(trail)) {
        expect(typeof item.label).toBe("string");
        expect(item.label.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("hierarchy hrefs", () => {
  it("builds a version href from protocol and version ids", () => {
    expect(protocolVersionHref("TIDAL", "TIDAL-V3.2")).toBe(
      "/protocols/TIDAL/versions/TIDAL-V3.2",
    );
  });

  it("derives an instrument's version href from its own binding", () => {
    expect(boundProtocolVersionHref(TIDAL_INSTRUMENT)).toBe(
      "/protocols/TIDAL/versions/TIDAL-V3.2",
    );
    expect(
      boundProtocolVersionHref({ ...TIDAL_INSTRUMENT, protocolVersionId: null }),
    ).toBeUndefined();
  });
});

describe("protocolModuleTrail", () => {
  const moduleLabel = "Metering";
  const openAccess = { protocolsCollection: true, protocolDetail: true };
  const closedAccess = { protocolsCollection: false, protocolDetail: false };

  it("builds platform, protocols, protocol and current-module crumbs", () => {
    expect(render(protocolModuleTrail(TIDAL_PROTOCOL, moduleLabel, openAccess))).toEqual([
      { label: "Commodity Chain", href: "/" },
      { label: "Protocols", href: "/protocols" },
      { label: "Tidal Energy", href: "/protocols/TIDAL" },
      { label: "Metering", href: undefined },
    ]);
  });

  it("keeps protocol hierarchy labels without hrefs when the actor cannot open them", () => {
    expect(render(protocolModuleTrail(TIDAL_PROTOCOL, moduleLabel, closedAccess))).toEqual([
      { label: "Commodity Chain", href: "/" },
      { label: "Protocols", href: undefined },
      { label: "Tidal Energy", href: undefined },
      { label: "Metering", href: undefined },
    ]);
  });

  it("omits protocol steps when the protocol record is absent", () => {
    expect(render(protocolModuleTrail(null, moduleLabel, openAccess))).toEqual([
      { label: "Commodity Chain", href: "/" },
      { label: "Metering", href: undefined },
    ]);
  });

  it("does not hardcode a WHEAT instrument or F2F protocol id", () => {
    const source = protocolModuleTrail.toString();
    expect(source).not.toMatch(/WHEAT/);
    expect(source).not.toMatch(/F2F/);
    const labels = render(
      protocolModuleTrail(TIDAL_PROTOCOL, moduleLabel, openAccess),
    ).map((item) => item.label);
    expect(labels).not.toContain("WHEAT-2027");
    expect(labels).toContain("Tidal Energy");
  });
});

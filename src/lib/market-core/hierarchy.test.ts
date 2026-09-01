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
  issuanceTrail,
  marketTrail,
  platformTrail,
  protocolTrail,
  protocolVersionHref,
  protocolVersionTrail,
  protocolsTrail,
} from "@/lib/market-core/hierarchy";

/**
 * Synthetic non-agriculture fixtures. These prove the hierarchy is generic
 * without relying on Field to Finance records, and are never added to the
 * production catalogue.
 */
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
    lifecycle: ["site", "commissioning", "instrument"],
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
  });

  it("returns no version href for an unbound instrument", () => {
    expect(
      boundProtocolVersionHref({ ...TIDAL_INSTRUMENT, protocolVersionId: null }),
    ).toBeUndefined();
  });

  it("ignores the protocol's mutable current pointer when building the link", () => {
    const movedOn = { ...TIDAL_PROTOCOL, currentVersionId: "TIDAL-V9.9" };
    expect(movedOn.currentVersionId).toBe("TIDAL-V9.9");
    // The instrument's link still points at the version it was created under.
    expect(boundProtocolVersionHref(TIDAL_INSTRUMENT)).toBe(
      "/protocols/TIDAL/versions/TIDAL-V3.2",
    );
  });
});

describe("hierarchy trails", () => {
  it("builds a platform trail", () => {
    expect(platformTrail().map((c) => c.level)).toEqual(["PLATFORM"]);
  });

  it("builds a protocol catalogue trail", () => {
    expect(protocolsTrail().map((c) => c.level)).toEqual(["PLATFORM", "PROTOCOL"]);
  });

  it("builds a protocol trail for a non-agriculture protocol", () => {
    const trail = protocolTrail(TIDAL_PROTOCOL);
    expect(trail.map((c) => c.level)).toEqual(["PLATFORM", "PROTOCOL", "PROTOCOL"]);
    expect(trail.at(-1)?.label).toBe("Tidal Energy");
  });

  it("builds a version trail ending at the permanent version id", () => {
    const trail = protocolVersionTrail(TIDAL_PROTOCOL, TIDAL_VERSION);
    expect(trail.map((c) => c.level)).toEqual([
      "PLATFORM",
      "PROTOCOL",
      "PROTOCOL",
      "PROTOCOL_VERSION",
    ]);
    expect(trail.at(-1)?.label).toBe("TIDAL-V3.2");
    expect(trail[2]?.href).toBe("/protocols/TIDAL");
  });

  it("builds an instrument trail", () => {
    const trail = instrumentTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL);
    expect(trail.map((c) => c.level)).toEqual(["PLATFORM", "PROTOCOL", "INSTRUMENT"]);
    expect(trail.at(-1)?.label).toBe("TIDE-2030");
  });

  it("omits a missing optional level instead of inserting a placeholder", () => {
    const trail = instrumentTrail(TIDAL_INSTRUMENT, null);
    expect(trail.map((c) => c.level)).toEqual(["PLATFORM", "INSTRUMENT"]);
    expect(trail.some((c) => c.label === "" || c.label === "—")).toBe(false);
  });

  it("builds issuance and market trails, omitting absent levels", () => {
    expect(
      issuanceTrail("TIDE-ISS-001", TIDAL_INSTRUMENT, TIDAL_PROTOCOL).map((c) => c.level),
    ).toEqual(["PLATFORM", "PROTOCOL", "INSTRUMENT", "ISSUANCE"]);
    expect(issuanceTrail("TIDE-ISS-001", null, null).map((c) => c.level)).toEqual([
      "PLATFORM",
      "ISSUANCE",
    ]);
    expect(marketTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL).map((c) => c.level)).toEqual([
      "PLATFORM",
      "PROTOCOL",
      "INSTRUMENT",
      "MARKET",
    ]);
    expect(marketTrail(null, null).map((c) => c.level)).toEqual(["PLATFORM", "MARKET"]);
  });

  it("gives every crumb exactly one of label or labelKey", () => {
    const trails = [
      ...platformTrail(),
      ...protocolsTrail(),
      ...protocolTrail(TIDAL_PROTOCOL),
      ...protocolVersionTrail(TIDAL_PROTOCOL, TIDAL_VERSION),
      ...instrumentTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL),
      ...issuanceTrail("TIDE-ISS-001", TIDAL_INSTRUMENT, TIDAL_PROTOCOL),
      ...marketTrail(TIDAL_INSTRUMENT, TIDAL_PROTOCOL),
    ];
    for (const crumb of trails) {
      expect(Boolean(crumb.label) !== Boolean(crumb.labelKey)).toBe(true);
    }
  });
});

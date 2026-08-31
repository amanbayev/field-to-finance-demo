import { describe, expect, it } from "vitest";
import {
  assertImmutableProtocolVersionBindings,
  currentVersionForProtocol,
  isFrozenProtocolVersion,
  protocolVersionsForProtocol,
  resolveGoverningProtocolVersion,
  validateInstrumentVersionBinding,
  validateProtocolVersionRegistry,
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
  assetProtocols,
  instrumentById,
  marketInstruments,
  protocolById,
  protocolVersions,
} from "@/data/market-core/catalog";
import { PROTOCOL_VERSION_GOVERNANCE_KEYS } from "@/lib/market-core/presentation";
import en from "../../../messages/en.json";
import ru from "../../../messages/ru.json";
import kk from "../../../messages/kk.json";

function frozenVersion(overrides: Partial<ProtocolVersion> = {}): ProtocolVersion {
  return {
    id: "TEST-V1",
    protocolId: "TEST-PROTOCOL",
    displayVersion: "1.0",
    state: "ACTIVE",
    frozen: true,
    activatedAt: null,
    frozenAt: null,
    supersedesVersionId: null,
    supersededByVersionId: null,
    governanceNote: "Synthetic test version",
    rules: {
      verificationModel: "Test",
      riskModel: "Test",
      coverageModel: "Test",
      issuanceModel: "Test",
      redemptionModel: "Test",
      lifecycle: [],
      modules: [],
    },
    ...overrides,
  };
}

function issuedInstrument(overrides: Partial<MarketInstrument> = {}): MarketInstrument {
  return {
    id: "TEST-INSTRUMENT",
    symbol: "TEST-INSTRUMENT",
    name: "Synthetic test instrument",
    instrumentType: "ASSET_TOKEN",
    assetProtocolId: "TEST-PROTOCOL",
    protocolVersionId: "TEST-V1",
    assetClass: "WATER",
    issuerId: "test-issuer",
    issuerName: "Test Issuer",
    issuanceId: "TEST-ISS",
    legalClassification: "Test",
    denomination: "1 token",
    decimals: 0,
    currencyOrUnit: "u",
    transferPolicy: "Test",
    eligibilityPolicy: "Participant × instrument",
    settlementPolicy: "DEMO-KZT",
    custodyPolicy: "Test",
    status: "ISSUED",
    ...overrides,
  };
}

describe("immutable protocol version binding", () => {
  it("binds WHEAT-2027 permanently to F2F-V1.1, not to an engineering phase label", () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    expect(wheat.protocolVersionId).toBe("F2F-V1.1");
    expect(wheat.protocolVersionId).toBe(F2F_V1_1_VERSION_ID);

    const version = resolveGoverningProtocolVersion(wheat, protocolVersions)!;
    expect(version.id).toBe("F2F-V1.1");
    expect(version.displayVersion).toBe("1.1");
    expect(version.protocolId).toBe(F2F_PROTOCOL_ID);
    expect(version.displayVersion).not.toBe("5B");
    expect(isFrozenProtocolVersion(version)).toBe(true);
    expect(version.frozen).toBe(true);
  });

  it("keeps the engineering phase label out of the protocol and version registries", () => {
    expect(JSON.stringify(assetProtocols)).not.toContain("5B");
    expect(JSON.stringify(protocolVersions)).not.toContain("5B");
  });

  it("resolves an issued instrument through its own binding, never the mutable current version", () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    const movedOn: ProtocolVersion[] = [
      ...protocolVersions,
      frozenVersion({ id: "F2F-V2.0", protocolId: F2F_PROTOCOL_ID, displayVersion: "2.0" }),
    ];
    const protocolAfterUpgrade = { ...protocolById(F2F_PROTOCOL_ID)!, currentVersionId: "F2F-V2.0" };

    expect(currentVersionForProtocol(movedOn, protocolAfterUpgrade)?.id).toBe("F2F-V2.0");
    expect(resolveGoverningProtocolVersion(wheat, movedOn)?.id).toBe("F2F-V1.1");
    expect(resolveGoverningProtocolVersion(wheat, movedOn)?.displayVersion).toBe("1.1");
  });

  it("rejects an ISSUED instrument that carries no protocol version", () => {
    const result = validateInstrumentVersionBinding(
      issuedInstrument({ protocolVersionId: null }),
      [frozenVersion()],
    );
    expect(result.violations).toEqual(["ISSUED_INSTRUMENT_WITHOUT_PROTOCOL_VERSION"]);
  });

  it("rejects a version that belongs to a different protocol", () => {
    const result = validateInstrumentVersionBinding(issuedInstrument(), [
      frozenVersion({ protocolId: "OTHER-PROTOCOL" }),
    ]);
    expect(result.violations).toContain("PROTOCOL_VERSION_PROTOCOL_MISMATCH");
    expect(
      resolveGoverningProtocolVersion(issuedInstrument(), [
        frozenVersion({ protocolId: "OTHER-PROTOCOL" }),
      ]),
    ).toBeNull();
  });

  it("rejects a binding to an unknown or unfrozen version", () => {
    expect(
      validateInstrumentVersionBinding(issuedInstrument(), []).violations,
    ).toEqual(["PROTOCOL_VERSION_NOT_FOUND"]);
    expect(
      validateInstrumentVersionBinding(issuedInstrument(), [
        frozenVersion({ frozen: false, state: "DRAFT" }),
      ]).violations,
    ).toEqual(["PROTOCOL_VERSION_NOT_FROZEN"]);
  });

  it("treats the frozen marker, not a date, as the immutability assertion", () => {
    expect(isFrozenProtocolVersion(frozenVersion({ activatedAt: null, frozenAt: null }))).toBe(
      true,
    );
    expect(
      isFrozenProtocolVersion(
        frozenVersion({ frozen: false, frozenAt: "2026-01-01T00:00:00.000Z" }),
      ),
    ).toBe(false);
    expect(
      validateInstrumentVersionBinding(issuedInstrument(), [
        frozenVersion({ activatedAt: null, frozenAt: null }),
      ]).violations,
    ).toEqual([]);
  });

  it("claims no activation or freeze date for the first recorded F2F version", () => {
    const version = protocolVersions.find((item) => item.id === F2F_V1_1_VERSION_ID)!;
    expect(version.activatedAt).toBeNull();
    expect(version.frozenAt).toBeNull();
    expect(version.frozen).toBe(true);
    expect(isFrozenProtocolVersion(version)).toBe(true);
    expect(version.supersedesVersionId).toBeNull();
    expect(version.supersededByVersionId).toBeNull();
    expect(version.governanceNote).toContain(
      "No formal legal or governance activation date has been established, and none is claimed",
    );
  });

  it("does not invent versions for structuring or concept protocols", () => {
    for (const protocolId of [WATER_PROTOCOL_ID, MUSIC_PROTOCOL_ID, GAMING_PROTOCOL_ID]) {
      const protocol = protocolById(protocolId)!;
      expect(protocol.currentVersionId).toBeNull();
      expect(protocolVersionsForProtocol(protocolVersions, protocolId)).toEqual([]);
      expect(currentVersionForProtocol(protocolVersions, protocol)).toBeNull();
    }
    expect(protocolVersions).toHaveLength(1);
  });

  it("leaves the future protocol investment unbound and unversioned", () => {
    const protocolInvestment = instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!;
    expect(protocolInvestment.status).not.toBe("ISSUED");
    expect(protocolInvestment.protocolVersionId).toBeNull();
    expect(resolveGoverningProtocolVersion(protocolInvestment, protocolVersions)).toBeNull();
    expect(
      validateInstrumentVersionBinding(protocolInvestment, protocolVersions).violations,
    ).toEqual([]);
  });

  it("keeps the shipped catalog free of binding violations", () => {
    expect(
      validateProtocolVersionRegistry(assetProtocols, protocolVersions, marketInstruments),
    ).toEqual([]);
    expect(
      assertImmutableProtocolVersionBindings(assetProtocols, protocolVersions, marketInstruments),
    ).toBe(true);
  });

  it("localizes every version's governance note in all three catalogs", () => {
    for (const version of protocolVersions) {
      const key = PROTOCOL_VERSION_GOVERNANCE_KEYS[version.id];
      expect(key, `no localized governance note for ${version.id}`).toBeDefined();
      const catalogs = [en, ru, kk].map(
        (catalog) => catalog.marketCore as unknown as Record<string, string | undefined>,
      );
      const copy = catalogs.map((catalog) => catalog[key!]);
      for (const text of copy) {
        expect(typeof text).toBe("string");
        expect(text!.length).toBeGreaterThan(0);
      }
      // Distinct per locale: the English canonical note must not leak into ru/kk.
      expect(new Set(copy).size).toBe(3);
      expect(copy[1]).not.toBe(version.governanceNote);
      expect(copy[2]).not.toBe(version.governanceNote);
    }
  });

  it("flags a protocol whose current version pointer does not resolve", () => {
    const dangling = [{ ...protocolById(F2F_PROTOCOL_ID)!, currentVersionId: "F2F-V9.9" }];
    const results = validateProtocolVersionRegistry(dangling, protocolVersions, []);
    expect(results).toHaveLength(1);
    expect(results[0]!.violations).toEqual(["PROTOCOL_VERSION_NOT_FOUND"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  assertImmutableProtocolVersionBindings,
  currentVersionForProtocol,
  freezeProtocolVersion,
  isFrozenProtocolVersion,
  protocolVersionsForProtocol,
  resolveGoverningProtocolVersion,
  validateInstrumentVersionBinding,
  validateProtocolCurrentVersion,
  validateProtocolVersionRegistry,
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
  assetProtocols,
  instrumentById,
  marketInstruments,
  protocolById,
  protocolVersions,
} from "@/data/market-core/catalog";
import {
  GOVERNANCE_NOTE_UNAVAILABLE_KEY,
  PROTOCOL_VERSION_GOVERNANCE_KEYS,
  protocolVersionGovernanceKey,
} from "@/lib/market-core/presentation";
import { listProtocolVersions } from "@/services/market-core-service";
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
    const report = validateProtocolVersionRegistry(
      assetProtocols,
      protocolVersions,
      marketInstruments,
    );
    expect(report.instrumentBindings).toEqual([]);
    expect(report.protocolPointers).toEqual([]);
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

  it("reports a dangling current-version pointer as a protocol, not an instrument", () => {
    const dangling = [{ ...protocolById(F2F_PROTOCOL_ID)!, currentVersionId: "F2F-V9.9" }];
    const report = validateProtocolVersionRegistry(dangling, protocolVersions, []);
    expect(report.instrumentBindings).toEqual([]);
    expect(report.protocolPointers).toHaveLength(1);
    const pointer = report.protocolPointers[0]!;
    // Keyed by protocol id — a protocol is never misreported as an instrument.
    expect(pointer.protocolId).toBe(F2F_PROTOCOL_ID);
    expect(pointer).not.toHaveProperty("instrumentId");
    expect(pointer.currentVersionId).toBe("F2F-V9.9");
    expect(pointer.violations).toEqual(["CURRENT_VERSION_NOT_FOUND"]);
  });
});

describe("protocol version immutability at runtime", () => {
  it("deeply freezes the canonical registry, versions, rules, lifecycle and modules", () => {
    expect(Object.isFrozen(protocolVersions)).toBe(true);
    for (const version of protocolVersions) {
      expect(Object.isFrozen(version)).toBe(true);
      expect(Object.isFrozen(version.rules)).toBe(true);
      expect(Object.isFrozen(version.rules.lifecycle)).toBe(true);
      expect(Object.isFrozen(version.rules.modules)).toBe(true);
    }
  });

  it("rejects runtime mutation of a version and its rules", () => {
    const version = protocolVersions.find((item) => item.id === F2F_V1_1_VERSION_ID)!;
    // Test-only casts: readonly already blocks these at compile time, so a cast
    // is the only way to prove the runtime freeze also holds.
    const mutableVersion = version as unknown as Record<string, unknown>;
    const mutableRules = version.rules as unknown as Record<string, unknown>;

    expect(() => {
      mutableVersion.displayVersion = "9.9";
    }).toThrow(TypeError);
    expect(() => {
      mutableRules.riskModel = "Different rules";
    }).toThrow(TypeError);
    expect(() => {
      (version.rules.lifecycle as string[]).push("tampered");
    }).toThrow(TypeError);
    expect(() => {
      (version.rules.modules as string[]).push("tampered");
    }).toThrow(TypeError);

    expect(version.displayVersion).toBe("1.1");
    expect(version.rules.riskModel).toBe("Off-chain risk haircut on pooled contracts");
    expect(version.rules.lifecycle).not.toContain("tampered");
    expect(version.rules.modules).not.toContain("tampered");
  });

  it("does not let the public service collection mutate the canonical registry", () => {
    const exposed = listProtocolVersions();
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(() => {
      (exposed as ProtocolVersion[]).push(frozenVersion({ id: "INJECTED" }));
    }).toThrow(TypeError);
    expect(listProtocolVersions()).toHaveLength(1);
    expect(protocolVersions).toHaveLength(1);
    expect(protocolVersions.some((item) => item.id === "INJECTED")).toBe(false);
  });

  it("keeps WHEAT-2027's permanent binding intact after mutation attempts", () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    expect(wheat.protocolVersionId).toBe(F2F_V1_1_VERSION_ID);
    const version = resolveGoverningProtocolVersion(wheat, protocolVersions)!;
    expect(version.id).toBe("F2F-V1.1");
    expect(version.displayVersion).toBe("1.1");
    expect(version.rules.verificationModel).toBe("SCAS / fields / DAC / coverage");
  });

  it("freezes owned copies without freezing shared source arrays", () => {
    const shared = ["field", "dac"];
    const frozen = freezeProtocolVersion(
      frozenVersion({
        rules: {
          verificationModel: "Test",
          riskModel: "Test",
          coverageModel: "Test",
          issuanceModel: "Test",
          redemptionModel: "Test",
          lifecycle: shared,
          modules: [],
        },
      }),
    );
    expect(Object.isFrozen(frozen.rules.lifecycle)).toBe(true);
    // The caller's array must not be frozen as a side effect.
    expect(Object.isFrozen(shared)).toBe(false);
    expect(frozen.rules.lifecycle).not.toBe(shared);
    expect(frozen.rules.lifecycle).toEqual(shared);
  });
});

describe("governance note localization fails closed", () => {
  it("never selects the canonical English governance note for an unmapped version", () => {
    const unmapped = frozenVersion({ id: "UNMAPPED-V1" });
    expect(PROTOCOL_VERSION_GOVERNANCE_KEYS[unmapped.id]).toBeUndefined();
    const key = protocolVersionGovernanceKey(unmapped.id);
    expect(key).toBe(GOVERNANCE_NOTE_UNAVAILABLE_KEY);
    expect(key).not.toBe(unmapped.governanceNote);
    for (const catalog of [en, ru, kk]) {
      const messages = catalog.marketCore as unknown as Record<string, string | undefined>;
      expect(messages[key]).toBeTruthy();
      expect(messages[key]).not.toBe(unmapped.governanceNote);
    }
  });

  it("selects the localized key for a mapped version", () => {
    expect(protocolVersionGovernanceKey(F2F_V1_1_VERSION_ID)).toBe("governanceNoteF2FV1_1");
  });
});

describe("current version pointer resolution", () => {
  const protocol: AssetProtocol = {
    id: "TEST-PROTOCOL",
    name: "Test protocol",
    assetClass: "WATER",
    protocolOwner: "Not appointed",
    operator: "Test operator",
    status: "STRUCTURING",
    regulatoryStatus: "NOT_SUBMITTED",
    currentVersionId: "TEST-V1",
  };

  it("resolves only an ACTIVE and frozen version of the same protocol", () => {
    expect(currentVersionForProtocol([frozenVersion()], protocol)?.id).toBe("TEST-V1");
  });

  it("returns null for DRAFT, SUPERSEDED, RETIRED or unfrozen versions", () => {
    for (const state of ["DRAFT", "SUPERSEDED", "RETIRED"] as const) {
      expect(currentVersionForProtocol([frozenVersion({ state })], protocol)).toBeNull();
    }
    expect(
      currentVersionForProtocol([frozenVersion({ state: "ACTIVE", frozen: false })], protocol),
    ).toBeNull();
  });

  it("returns null for a cross-protocol or missing pointer", () => {
    expect(
      currentVersionForProtocol([frozenVersion({ protocolId: "OTHER" })], protocol),
    ).toBeNull();
    expect(currentVersionForProtocol([], protocol)).toBeNull();
    expect(
      currentVersionForProtocol([frozenVersion()], { ...protocol, currentVersionId: null }),
    ).toBeNull();
  });

  it("reports why an invalid pointer failed, keyed by protocol id", () => {
    expect(
      validateProtocolCurrentVersion(protocol, [frozenVersion({ state: "RETIRED" })]).violations,
    ).toEqual(["CURRENT_VERSION_NOT_ACTIVE"]);
    expect(
      validateProtocolCurrentVersion(protocol, [frozenVersion({ frozen: false })]).violations,
    ).toEqual(["CURRENT_VERSION_NOT_FROZEN"]);
    expect(
      validateProtocolCurrentVersion(protocol, [frozenVersion({ protocolId: "OTHER" })])
        .violations,
    ).toContain("CURRENT_VERSION_PROTOCOL_MISMATCH");
    const missing = validateProtocolCurrentVersion(protocol, []);
    expect(missing.protocolId).toBe("TEST-PROTOCOL");
    expect(missing.violations).toEqual(["CURRENT_VERSION_NOT_FOUND"]);
    // A protocol with no pointer at all is not a violation.
    expect(
      validateProtocolCurrentVersion({ ...protocol, currentVersionId: null }, []).violations,
    ).toEqual([]);
  });
});

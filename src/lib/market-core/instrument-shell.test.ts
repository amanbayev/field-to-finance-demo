import { describe, expect, it } from "vitest";
import type { ActorContext, Permission } from "@/domain/identity";
import { permissionsForRole } from "@/domain/identity";
import { availableBalance } from "@/domain/market-core";
import {
  F2F_PROTOCOL_ID,
  F2F_PROTOCOL_INVESTMENT_ID,
  F2F_V1_1_VERSION_ID,
  WHEAT_INSTRUMENT_ID,
  holdings,
  instrumentById,
  protocolById,
  protocolVersions,
} from "@/data/market-core/catalog";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { ECONOMICS_WITHHELD_REASON_KEY } from "./economics-visibility";
import {
  DuplicateProtocolAdapterError,
  applyEconomicsVisibility,
  createInstrumentBasisAdapterRegistry,
  freezeInstrumentBasisResult,
  isChainMintProofSlot,
  CHAIN_MINT_PROOF_RENDERER_ID,
  type ChainMintProofSlot,
  type InstrumentBasisResult,
  type InstrumentEconomicBasisAdapter,
} from "./instrument-basis-adapter";
import {
  HOLDING_BUCKETS,
  holdingBucketValues,
  resolveInstrumentShell,
} from "./instrument-shell";
import {
  getInstrumentShellContext,
  instrumentShellCanonicalSource,
  productionInstrumentBasisAdapterRegistry,
} from "@/services/instrument-shell";
import { createF2fInstrumentBasisAdapter } from "@/lib/protocols/f2f/f2f-instrument-basis-adapter";

function actorWith(permissions: Permission[]): ActorContext {
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
    effective: {
      roleId: "INVESTOR",
      permissions,
      producerIds: [],
    },
    isImpersonating: false,
  };
}

const registrarActor = actorWith(permissionsForRole("REGISTRAR_OPERATOR"));

function availableResult(
  overrides: Partial<Extract<InstrumentBasisResult, { kind: "AVAILABLE" }>> = {},
): Extract<InstrumentBasisResult, { kind: "AVAILABLE" }> {
  return {
    kind: "AVAILABLE",
    facts: [],
    metrics: [],
    terms: [],
    risks: [],
    overviewMetrics: [],
    links: [],
    notices: [],
    evidence: [],
    protocolSlot: null,
    ...overrides,
  };
}

describe("adapter registry", () => {
  it("selects the F2F adapter for the F2F protocol and no other protocol", () => {
    const f2f = createF2fInstrumentBasisAdapter();
    const registry = createInstrumentBasisAdapterRegistry([f2f]);
    expect(registry.select(F2F_PROTOCOL_ID)).toBe(f2f);
    expect(registry.select("TIDAL")).toBeNull();
    expect(registry.select("WATER")).toBeNull();
  });

  it("rejects duplicate adapters for one protocol", () => {
    const f2f = createF2fInstrumentBasisAdapter();
    expect(() => createInstrumentBasisAdapterRegistry([f2f, f2f])).toThrow(
      DuplicateProtocolAdapterError,
    );
  });

  it("freezes adapter results so callers cannot mutate them", () => {
    const protocolSlot: ChainMintProofSlot = {
      rendererId: CHAIN_MINT_PROOF_RENDERER_ID,
      lookup: { status: "missing" },
      registrarInventory: 990,
    };
    const result = freezeInstrumentBasisResult(
      availableResult({
        facts: [
          {
            id: "price",
            labelKey: "price",
            category: "PRICE",
            value: { kind: "TEXT", text: "12" },
          },
        ],
        overviewMetrics: [
          {
            id: "minted",
            labelKey: "mintedSupply",
            value: { kind: "INTEGER", value: 1000 },
          },
        ],
        protocolSlot,
        evidence: [
          {
            kind: "NOTICE",
            id: "primary-placement",
            titleKey: "primaryEvidence",
            bodyKeys: ["placementId", "notSecondaryClearing"],
          },
        ],
      }),
    );
    expect(Object.isFrozen(result)).toBe(true);
    if (result.kind !== "AVAILABLE") {
      throw new Error("expected AVAILABLE");
    }
    expect(Object.isFrozen(result.facts)).toBe(true);
    expect(Object.isFrozen(result.facts[0])).toBe(true);
    expect(Object.isFrozen(result.overviewMetrics[0])).toBe(true);
    expect(Object.isFrozen(result.protocolSlot)).toBe(true);
    expect(() => {
      // Test-only: readonly types forbid mutation; this proves the runtime freeze.
      (result.facts as unknown as { id: string }[]).push({ id: "x" });
    }).toThrow();
    expect(() => {
      // Test-only: attempt a property write past InstrumentBasisFact readonly.
      (result.facts[0] as unknown as { id: string }).id = "x";
    }).toThrow();
    expect(() => {
      // Test-only: attempt a nested value write past InstrumentBasisValue readonly.
      (result.facts[0]!.value as unknown as { text: string }).text = "99";
    }).toThrow();
    expect(() => {
      (result.overviewMetrics[0] as unknown as { id: string }).id = "x";
    }).toThrow();
    expect(() => {
      (result.protocolSlot as unknown as { rendererId: string }).rendererId = "x";
    }).toThrow();
    const notice = result.evidence[0];
    expect(Object.isFrozen(notice)).toBe(true);
    if (notice?.kind === "NOTICE") {
      expect(Object.isFrozen(notice.bodyKeys)).toBe(true);
      expect(() => {
        (notice.bodyKeys as unknown as string[]).push("x");
      }).toThrow();
    }
  });

  it("copies the result graph so adapter-owned objects stay unfrozen", () => {
    const value = { kind: "TEXT" as const, text: "12" };
    const fact = {
      id: "price",
      labelKey: "price",
      value,
      category: "PRICE" as const,
    };
    const lookup: { status: "missing" | "found" | "unavailable" } = {
      status: "missing",
    };
    const protocolSlot: ChainMintProofSlot = {
      rendererId: CHAIN_MINT_PROOF_RENDERER_ID,
      lookup,
      registrarInventory: 990,
    };
    const bodyKeys = ["placementId"];
    const incoming = availableResult({
      facts: [fact],
      protocolSlot,
      evidence: [
        {
          kind: "NOTICE",
          id: "primary-placement",
          titleKey: "primaryEvidence",
          bodyKeys,
        },
      ],
    });
    const result = freezeInstrumentBasisResult(incoming);
    fact.id = "mutated";
    value.text = "99";
    lookup.status = "found";
    bodyKeys.push("extra");
    if (result.kind !== "AVAILABLE") {
      throw new Error("expected AVAILABLE");
    }
    expect(result.facts[0]?.id).toBe("price");
    expect(result.facts[0]?.value).toEqual({ kind: "TEXT", text: "12" });
    expect(Object.isFrozen(fact)).toBe(false);
    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(lookup)).toBe(false);
    expect(Object.isFrozen(incoming.facts)).toBe(false);
    const copiedSlot = result.protocolSlot;
    if (copiedSlot && isChainMintProofSlot(copiedSlot)) {
      expect(copiedSlot.lookup.status).toBe("missing");
    }
    const notice = result.evidence[0];
    if (notice?.kind === "NOTICE") {
      expect(notice.bodyKeys).toEqual(["placementId"]);
    }
  });

  it("keeps the adapter registry closed from callers", () => {
    const f2f = createF2fInstrumentBasisAdapter();
    const registry = createInstrumentBasisAdapterRegistry([f2f]);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.adapters)).toBe(true);
    expect(Object.isFrozen(f2f)).toBe(false);
    expect(() => {
      (registry.adapters as unknown as unknown[]).push({});
    }).toThrow();
  });
});

describe("lifecycle economics filter", () => {
  it("lets an issued instrument keep actual adapter data", () => {
    const incoming = freezeInstrumentBasisResult(
      availableResult({
        terms: [
          {
            id: "denomination",
            labelKey: "denomination",
            value: { kind: "TEXT", text: "1 unit" },
          },
        ],
      }),
    );
    const filtered = applyEconomicsVisibility({ kind: "PERMITTED" }, incoming);
    expect(filtered).toEqual(incoming);
  });

  it("does not invent economics when the adapter has no data", () => {
    const filtered = applyEconomicsVisibility(
      { kind: "PERMITTED" },
      { kind: "UNAVAILABLE", reasonKey: "basisUnavailable" },
    );
    expect(filtered).toEqual({
      kind: "UNAVAILABLE",
      reasonKey: "basisUnavailable",
    });
  });

  it("withholds an over-eager adapter that returns price, yield and term", () => {
    const greedy = availableResult({
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
      terms: [
        {
          id: "term",
          labelKey: "term",
          category: "TERM",
          value: { kind: "TEXT", text: "5y" },
        },
      ],
    });
    const filtered = applyEconomicsVisibility(
      { kind: "WITHHELD", reasonKey: ECONOMICS_WITHHELD_REASON_KEY },
      greedy,
    );
    expect(filtered).toEqual({
      kind: "WITHHELD",
      reasonKey: ECONOMICS_WITHHELD_REASON_KEY,
    });
    expect(JSON.stringify(filtered)).not.toMatch(/12|5y|"yield"/);
  });
});

describe("canonical shell context", () => {
  it("resolves a known issued instrument from canonical Market Core", async () => {
    const shell = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, registrarActor);
    expect(shell).not.toBeNull();
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    expect(shell!.instrument).toBe(wheat);
    expect(shell!.instrument.id).toBe(WHEAT_INSTRUMENT_ID);
    expect(shell!.protocol?.id).toBe(F2F_PROTOCOL_ID);
    expect(shell!.protocolVersion?.id).toBe(F2F_V1_1_VERSION_ID);
    expect(shell!.market?.instrumentId).toBe(WHEAT_INSTRUMENT_ID);
    expect(shell!.instrument.issuerName).toBe(wheat.issuerName);
    expect(shell!.instrument.issuanceId).toBe("ISS-001");
    expect(shell!.mayShowEconomics).toBe(true);
    expect(shell!.versionHref).toBe("/protocols/F2F/versions/F2F-V1.1");
    expect(shell!.basis.kind).toBe("AVAILABLE");
    if (shell!.basis.kind === "AVAILABLE") {
      expect(Object.isFrozen(shell!.basis)).toBe(true);
      expect(Object.isFrozen(shell!.basis.facts)).toBe(true);
      expect(Object.isFrozen(shell!.basis.facts[0])).toBe(true);
      expect(Object.isFrozen(shell!.basis.overviewMetrics[0])).toBe(true);
      expect(Object.isFrozen(shell!.basis.protocolSlot)).toBe(true);
      expect(
        shell!.basis.overviewMetrics.find((item) => item.id === "minted")
          ?.labelKey,
      ).toBe("mintedSupply");
      expect(
        shell!.basis.overviewMetrics.find((item) => item.id === "circulating")
          ?.labelKey,
      ).toBe("circulatingSupply");
      expect(shell!.basis.overviewMetrics.map((item) => item.labelKey)).not.toContain(
        "owned",
      );
      expect(shell!.basis.overviewMetrics.map((item) => item.labelKey)).not.toContain(
        "heldBy",
      );
      const wheatSlot = shell!.basis.protocolSlot;
      if (wheatSlot && isChainMintProofSlot(wheatSlot)) {
        expect(Object.isFrozen(wheatSlot.lookup)).toBe(true);
      }
    }
  });

  it("returns null for an unknown instrument", async () => {
    expect(await getInstrumentShellContext("NO-SUCH-INSTRUMENT", registrarActor)).toBeNull();
  });

  it("does not fall back to protocol currentVersionId", async () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    const protocol = protocolById(F2F_PROTOCOL_ID)!;
    const moved = { ...protocol, currentVersionId: "F2F-V9.9" };
    const shell = await resolveInstrumentShell({
      instrumentId: WHEAT_INSTRUMENT_ID,
      actor: registrarActor,
      canonical: {
        getInstrumentMarketContext(id: string) {
          if (id !== WHEAT_INSTRUMENT_ID) {
            return null;
          }
          return {
            instrument: wheat,
            protocol: moved,
            market: null,
            protocolVersion: protocolVersions[0]!,
          };
        },
        listHoldings: () => [],
        listAdmission: () => [],
      },
      adapters: createInstrumentBasisAdapterRegistry([]),
    });
    expect(shell?.protocolVersion?.id).toBe(F2F_V1_1_VERSION_ID);
    expect(shell?.protocol?.currentVersionId).toBe("F2F-V9.9");
    expect(shell?.instrument.protocolVersionId).toBe(F2F_V1_1_VERSION_ID);
  });

  it("does not let adapter output replace canonical identity", async () => {
    const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
    const pretender: InstrumentEconomicBasisAdapter = {
      protocolId: F2F_PROTOCOL_ID,
      supports: () => true,
      async resolve() {
        return availableResult({
          notices: [{ id: "identity", messageKey: "not-the-instrument" }],
        });
      },
    };
    const shell = await resolveInstrumentShell({
      instrumentId: WHEAT_INSTRUMENT_ID,
      actor: registrarActor,
      canonical: instrumentShellCanonicalSource(),
      adapters: createInstrumentBasisAdapterRegistry([pretender]),
    });
    expect(shell?.instrument).toBe(wheat);
    expect(shell?.instrument.id).toBe(WHEAT_INSTRUMENT_ID);
    expect(shell?.instrument.symbol).toBe("WHEAT-2027");
    expect(shell).not.toHaveProperty("id", "FAKE-INSTRUMENT");
  });
});

describe("production protocol investment", () => {
  it("withholds offer, price, yield and term and does not invoke an economics adapter", async () => {
    let adapterCalls = 0;
    const greedy: InstrumentEconomicBasisAdapter = {
      protocolId: F2F_PROTOCOL_ID,
      supports() {
        adapterCalls += 1;
        return true;
      },
      async resolve() {
        adapterCalls += 1;
        return availableResult({
          facts: [
            {
              id: "price",
              labelKey: "price",
              category: "PRICE",
              value: { kind: "TEXT", text: "99" },
            },
          ],
          terms: [
            {
              id: "offer",
              labelKey: "useOfProceeds",
              category: "USE_OF_PROCEEDS",
              value: { kind: "TEXT", text: "active offering" },
            },
          ],
        });
      },
    };
    const shell = await resolveInstrumentShell({
      instrumentId: F2F_PROTOCOL_INVESTMENT_ID,
      actor: registrarActor,
      canonical: instrumentShellCanonicalSource(),
      adapters: createInstrumentBasisAdapterRegistry([greedy]),
    });
    expect(shell?.instrument.id).toBe(F2F_PROTOCOL_INVESTMENT_ID);
    expect(shell?.instrument.status).toBe("STRUCTURING");
    expect(shell?.mayShowEconomics).toBe(false);
    expect(shell?.basis).toEqual({
      kind: "WITHHELD",
      reasonKey: ECONOMICS_WITHHELD_REASON_KEY,
    });
    expect(adapterCalls).toBe(0);
    expect(JSON.stringify(shell?.basis)).not.toMatch(/99|active offering/);
  });
});

describe("F2F wheat parity through the production shell", () => {
  it("keeps truthful WHEAT overview, terms, basis, market and audit evidence", async () => {
    const shell = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, registrarActor);
    const coverage = wheatPoolCoverageFromEngine();
    expect(shell?.basis.kind).toBe("AVAILABLE");
    if (shell?.basis.kind !== "AVAILABLE") {
      return;
    }
    expect(shell.basis.notices.map((item) => item.messageKey)).toContain(
      "basisAgriculture",
    );
    expect(shell.basis.overviewMetrics.map((item) => item.id)).toEqual([
      "minted",
      "placed",
      "circulating",
      "market",
    ]);
    expect(shell.basis.terms.map((item) => item.id)).toEqual([
      "unitClaim",
      "claimBoundary",
      "coverageNotPledge",
      "demoKzt",
      "simulation",
      "devnet",
      "redemption",
    ]);
    const gross = shell.basis.metrics.find((item) => item.id === "gross");
    expect(gross).toEqual({
      id: "gross",
      labelKey: "gross",
      value: { kind: "INTEGER", value: coverage.grossVolumeTonnes },
    });
    expect(shell.market?.phase).toBe("SECONDARY_OPEN");
    expect(shell.basis.evidence.some((item) => item.id === "primary-placement")).toBe(
      true,
    );
    expect(shell.basis.protocolSlot?.rendererId).toBe("chainMintProof");
    expect(JSON.stringify(shell.basis)).not.toMatch(/settlement finality|SETTLED/);
  });

  it("omits protocol module hrefs when the actor lacks permission", async () => {
    const shell = await getInstrumentShellContext(
      WHEAT_INSTRUMENT_ID,
      actorWith(["issuance.read", "market.read"]),
    );
    if (shell?.basis.kind !== "AVAILABLE") {
      throw new Error("expected AVAILABLE");
    }
    expect(shell.basis.links).toEqual([]);
    const pool = shell.basis.facts.find((item) => item.id === "pool");
    expect(pool?.href).toBeUndefined();
    expect(pool?.value).toEqual({
      kind: "TEXT",
      text: "POOL-WHEAT-2027-01",
    });
  });
});

describe("holdings buckets", () => {
  it("keeps owned, available, reserved, pledged and blocked distinct", async () => {
    const shell = await getInstrumentShellContext(WHEAT_INSTRUMENT_ID, registrarActor);
    expect(HOLDING_BUCKETS.map((item) => item.id)).toEqual([
      "owned",
      "available",
      "reserved",
      "pledged",
      "blocked",
    ]);
    expect(shell?.holdings.map((row) => row.holderReference)).toEqual([
      "REGISTRAR",
      "INVESTOR-0001",
      "GRAIN-DESK",
    ]);
    for (const holding of shell?.holdings ?? []) {
      const buckets = holdingBucketValues(holding);
      expect(Object.keys(buckets)).toEqual([
        "owned",
        "available",
        "reserved",
        "pledged",
        "blocked",
      ]);
      expect(buckets.available).toBe(availableBalance(holding.buckets));
      expect(buckets.owned).toBe(holding.buckets.owned);
      expect(buckets.reserved).toBe(holding.buckets.reservedForOrders);
      expect(buckets.pledged).toBe(holding.buckets.pledged);
      expect(buckets.blocked).toBe(holding.buckets.blocked);
    }
    const registrar = holdingBucketValues(
      holdings.find((row) => row.holderReference === "REGISTRAR")!,
    );
    const steppe = holdingBucketValues(
      holdings.find((row) => row.holderReference === "INVESTOR-0001")!,
    );
    const grain = holdingBucketValues(
      holdings.find((row) => row.holderReference === "GRAIN-DESK")!,
    );
    expect(registrar.owned).toBe(990);
    expect(steppe.owned).toBe(10);
    expect(grain.owned).toBe(0);
  });
});

describe("production registry wiring", () => {
  it("registers exactly one F2F adapter and does not default unknown protocols to F2F", () => {
    const registry = productionInstrumentBasisAdapterRegistry();
    expect(registry.adapters).toHaveLength(1);
    expect(registry.select(F2F_PROTOCOL_ID)?.protocolId).toBe(F2F_PROTOCOL_ID);
    expect(registry.select("TIDAL")).toBeNull();
  });
});

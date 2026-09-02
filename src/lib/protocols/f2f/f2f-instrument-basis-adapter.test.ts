import { describe, expect, it } from "vitest";
import type { ActorContext, Permission } from "@/domain/identity";
import { permissionsForRole } from "@/domain/identity";
import {
  F2F_PROTOCOL_ID,
  F2F_PROTOCOL_INVESTMENT_ID,
  WHEAT_INSTRUMENT_ID,
  instrumentById,
  protocolById,
} from "@/data/market-core/catalog";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { getScasSnapshot } from "@/services/scas-service";
import type { PlacementSnapshot } from "@/services/placement-service";
import type { InstrumentBasisAdapterInput } from "@/lib/market-core/instrument-basis-adapter";
import {
  BASIS_DATA_UNAVAILABLE_KEY,
  BASIS_FAMILY_UNAVAILABLE_KEY,
} from "@/lib/market-core/instrument-basis-adapter";
import { ECONOMICS_WITHHELD_REASON_KEY } from "@/lib/market-core/economics-visibility";
import {
  createF2fInstrumentBasisAdapter,
  type F2fInstrumentBasisDeps,
} from "./f2f-instrument-basis-adapter";

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
      roleId: "REGISTRAR_OPERATOR",
      permissions,
      producerIds: [],
    },
    isImpersonating: false,
  };
}

function wheatInput(
  overrides: Partial<InstrumentBasisAdapterInput> = {},
): InstrumentBasisAdapterInput {
  return {
    instrument: instrumentById(WHEAT_INSTRUMENT_ID)!,
    protocol: protocolById(F2F_PROTOCOL_ID)!,
    protocolVersion: null,
    market: null,
    actor: actorWith(permissionsForRole("REGISTRAR_OPERATOR")),
    ...overrides,
  };
}

function stubSnapshot(): PlacementSnapshot {
  return {
    supply: {
      mintedSupply: 1000,
      placed: 10,
      circulating: 10,
      registrarInventory: 990,
      burned: 0,
      maximumCoverageCapacity: 8300,
    },
    mintLookup: { status: "missing" },
  } as PlacementSnapshot;
}

function stubDeps(
  overrides: Partial<F2fInstrumentBasisDeps> = {},
): F2fInstrumentBasisDeps {
  return {
    getPlacementSnapshot: async () => stubSnapshot(),
    getTokenBySymbol: () => undefined,
    getCoverage: wheatPoolCoverageFromEngine,
    getScasSnapshot,
    poolId: "POOL-WHEAT-2027-01",
    moduleHref: () => undefined,
    can: () => false,
    ...overrides,
  };
}

describe("F2F economic-basis adapter", () => {
  it("supports F2F instruments only when the canonical protocol record matches", () => {
    const adapter = createF2fInstrumentBasisAdapter(stubDeps());
    expect(adapter.protocolId).toBe(F2F_PROTOCOL_ID);
    expect(adapter.supports(wheatInput())).toBe(true);
    expect(
      adapter.supports(
        wheatInput({
          instrument: {
            ...instrumentById(WHEAT_INSTRUMENT_ID)!,
            assetProtocolId: "TIDAL",
          },
          protocol: { ...protocolById(F2F_PROTOCOL_ID)!, id: "TIDAL" },
        }),
      ),
    ).toBe(false);
    expect(adapter.supports(wheatInput({ protocol: null }))).toBe(false);
  });

  it("returns WHEAT demonstrator facts when snapshots exist", async () => {
    const adapter = createF2fInstrumentBasisAdapter(stubDeps());
    const result = await adapter.resolve(wheatInput());
    expect(result.kind).toBe("AVAILABLE");
    if (result.kind !== "AVAILABLE") {
      return;
    }
    expect(result.facts.find((item) => item.id === "pool")?.value).toEqual({
      kind: "TEXT",
      text: "POOL-WHEAT-2027-01",
    });
    expect(result.metrics.find((item) => item.id === "gross")?.value).toEqual({
      kind: "INTEGER",
      value: wheatPoolCoverageFromEngine().grossVolumeTonnes,
    });
    expect(result.overviewMetrics.find((item) => item.id === "minted")?.value).toEqual(
      {
        kind: "INTEGER",
        value: 1000,
      },
    );
    expect(result.terms.find((item) => item.id === "redemption")?.value).toEqual({
      kind: "MESSAGE",
      messageKey: "workingHypothesis",
    });
    expect(result.protocolSlot?.rendererId).toBe("chainMintProof");
    expect(JSON.stringify(result)).not.toMatch(/settlement finality/);
  });

  it("fails closed when required snapshots are missing", async () => {
    const adapter = createF2fInstrumentBasisAdapter(
      stubDeps({
        getPlacementSnapshot: async () => null,
      }),
    );
    expect(await adapter.resolve(wheatInput())).toEqual({
      kind: "UNAVAILABLE",
      reasonKey: BASIS_DATA_UNAVAILABLE_KEY,
    });
  });

  it("does not apply WHEAT snapshots to another F2F instrument id", async () => {
    const adapter = createF2fInstrumentBasisAdapter(stubDeps());
    const result = await adapter.resolve(
      wheatInput({
        instrument: {
          ...instrumentById(WHEAT_INSTRUMENT_ID)!,
          id: "F2F-OTHER",
          symbol: "F2F-OTHER",
        },
      }),
    );
    expect(result).toEqual({
      kind: "UNAVAILABLE",
      reasonKey: BASIS_DATA_UNAVAILABLE_KEY,
    });
  });

  it("withholds non-issued F2F instruments and does not emit wheat economics", async () => {
    const adapter = createF2fInstrumentBasisAdapter(stubDeps());
    expect(
      await adapter.resolve(
        wheatInput({
          instrument: instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!,
        }),
      ),
    ).toEqual({
      kind: "WITHHELD",
      reasonKey: ECONOMICS_WITHHELD_REASON_KEY,
    });
  });

  it("does not treat protocol investment as an asset-token basis even if marked issued", async () => {
    const adapter = createF2fInstrumentBasisAdapter(stubDeps());
    expect(
      await adapter.resolve(
        wheatInput({
          instrument: {
            ...instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!,
            status: "ISSUED",
          },
        }),
      ),
    ).toEqual({
      kind: "UNAVAILABLE",
      reasonKey: BASIS_FAMILY_UNAVAILABLE_KEY,
    });
  });
});

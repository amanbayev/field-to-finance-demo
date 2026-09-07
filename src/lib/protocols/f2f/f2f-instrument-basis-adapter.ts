import { actorCan } from "@/domain/identity";
import type { ContractCoverage } from "@/domain";
import { ON_CHAIN_DEMO_POOL_ID } from "@/adapters/blockchain";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import {
  F2F_PROTOCOL_ID,
  WHEAT_INSTRUMENT_ID,
} from "@/data/market-core/catalog";
import { f2fModuleHref } from "@/lib/market-core/presentation";
import { getPlacementSnapshot, type PlacementSnapshot } from "@/services/placement-service";
import { getScasSnapshot, type ScasSnapshot } from "@/services/scas-service";
import { getTokenBySymbol, type TokenDetail } from "@/services/token-service";
import {
  BASIS_DATA_UNAVAILABLE_KEY,
  BASIS_FAMILY_UNAVAILABLE_KEY,
  CHAIN_MINT_PROOF_RENDERER_ID,
  freezeInstrumentBasisResult,
  type ChainMintProofSlot,
  type InstrumentBasisAdapterInput,
  type InstrumentBasisResult,
  type InstrumentEconomicBasisAdapter,
} from "@/lib/market-core/instrument-basis-adapter";
import { ECONOMICS_WITHHELD_REASON_KEY } from "@/lib/market-core/economics-visibility";

/**
 * Field to Finance economic-basis adapter.
 *
 * Selected only for the F2F protocol. It is not a fallback for unknown
 * protocols. WHEAT-2027 demonstrator facts are returned only when the
 * canonical instrument is that issued F2F asset token and required snapshots
 * exist. Missing snapshots fail closed to UNAVAILABLE, never zeros.
 *
 * Token mint proof is attached as a `chainMintProof` protocol slot. The
 * generic shell must not import this module or branch on WHEAT.
 */
export interface F2fInstrumentBasisDeps {
  getPlacementSnapshot(): Promise<PlacementSnapshot | null>;
  getTokenBySymbol(symbol: string): TokenDetail | undefined;
  getCoverage(): ContractCoverage | null;
  getScasSnapshot(): ScasSnapshot | null;
  poolId: string;
  moduleHref: typeof f2fModuleHref;
  can: typeof actorCan;
}

export function productionF2fInstrumentBasisDeps(): F2fInstrumentBasisDeps {
  return {
    getPlacementSnapshot,
    getTokenBySymbol,
    getCoverage: wheatPoolCoverageFromEngine,
    getScasSnapshot,
    poolId: ON_CHAIN_DEMO_POOL_ID,
    moduleHref: f2fModuleHref,
    can: actorCan,
  };
}

export function createF2fInstrumentBasisAdapter(
  deps: F2fInstrumentBasisDeps = productionF2fInstrumentBasisDeps(),
): InstrumentEconomicBasisAdapter {
  return {
    protocolId: F2F_PROTOCOL_ID,
    supports(input: InstrumentBasisAdapterInput): boolean {
      return (
        input.instrument.assetProtocolId === F2F_PROTOCOL_ID &&
        input.protocol?.id === F2F_PROTOCOL_ID
      );
    },
    async resolve(input: InstrumentBasisAdapterInput): Promise<InstrumentBasisResult> {
      if (!this.supports(input)) {
        return freezeInstrumentBasisResult({
          kind: "UNAVAILABLE",
          reasonKey: BASIS_DATA_UNAVAILABLE_KEY,
        });
      }
      if (
        input.instrument.status !== "ISSUED" &&
        input.instrument.status !== "ADMITTED"
      ) {
        return freezeInstrumentBasisResult({
          kind: "WITHHELD",
          reasonKey: ECONOMICS_WITHHELD_REASON_KEY,
        });
      }
      if (input.instrument.instrumentType !== "ASSET_TOKEN") {
        return freezeInstrumentBasisResult({
          kind: "UNAVAILABLE",
          reasonKey: BASIS_FAMILY_UNAVAILABLE_KEY,
        });
      }
      // WHEAT demonstrator snapshots are not a silent fallback for any other
      // F2F instrument that might exist later.
      if (input.instrument.id !== WHEAT_INSTRUMENT_ID) {
        return freezeInstrumentBasisResult({
          kind: "UNAVAILABLE",
          reasonKey: BASIS_DATA_UNAVAILABLE_KEY,
        });
      }
      return freezeInstrumentBasisResult(await buildWheatBasis(input, deps));
    },
  };
}

async function buildWheatBasis(
  input: InstrumentBasisAdapterInput,
  deps: F2fInstrumentBasisDeps,
): Promise<InstrumentBasisResult> {
  let snapshot: PlacementSnapshot | null = null;
  try {
    snapshot = await deps.getPlacementSnapshot();
  } catch {
    snapshot = null;
  }
  const coverage = deps.getCoverage();
  const scas = deps.getScasSnapshot();
  if (!snapshot || !coverage || !scas) {
    return {
      kind: "UNAVAILABLE",
      reasonKey: BASIS_DATA_UNAVAILABLE_KEY,
    };
  }
  const tokenDetail = deps.getTokenBySymbol(input.instrument.symbol);
  const poolHref = deps.can(input.actor, "pools.read")
    ? `/pools/${deps.poolId}`
    : undefined;
  const dacHref = deps.moduleHref("dacs", input.actor);
  const monitoringHref = deps.moduleHref("monitoring", input.actor);
  const protocolSlot: ChainMintProofSlot = {
    rendererId: CHAIN_MINT_PROOF_RENDERER_ID,
    lookup: snapshot.mintLookup,
    registrarInventory: snapshot.supply.registrarInventory,
  };
  return {
    kind: "AVAILABLE",
    notices: [{ id: "agriculture-basis", messageKey: "basisAgriculture" }],
    facts: [
      {
        id: "pool",
        labelKey: "pool",
        value: { kind: "TEXT", text: deps.poolId },
        href: poolHref,
      },
      {
        id: "dacs",
        labelKey: "moduleDacs",
        value: { kind: "MESSAGE", messageKey: "moduleDacs" },
        href: dacHref,
      },
      {
        id: "scas",
        labelKey: "moduleScas",
        value: { kind: "INTEGER", value: scas.attestedCount },
      },
      {
        id: "monitoring",
        labelKey: "moduleMonitoring",
        value: { kind: "MESSAGE", messageKey: "moduleMonitoring" },
        href: monitoringHref,
      },
      {
        id: "insurance",
        labelKey: "insurance",
        value: { kind: "MESSAGE", messageKey: "insurance" },
      },
    ],
    metrics: [
      {
        id: "gross",
        labelKey: "gross",
        value: { kind: "INTEGER", value: coverage.grossVolumeTonnes },
      },
      {
        id: "eligibleCoverage",
        labelKey: "eligibleCoverage",
        value: { kind: "INTEGER", value: coverage.eligibleCoverageTonnes },
      },
      {
        id: "haircut",
        labelKey: "moduleCoverage",
        value: { kind: "PERCENT", value: coverage.totalHaircutPercent },
      },
    ],
    overviewMetrics: [
      {
        id: "minted",
        labelKey: "mintedSupply",
        value: { kind: "INTEGER", value: snapshot.supply.mintedSupply },
      },
      {
        id: "placed",
        labelKey: "placement",
        value: { kind: "INTEGER", value: snapshot.supply.placed },
      },
      {
        id: "circulating",
        labelKey: "circulatingSupply",
        value: { kind: "INTEGER", value: snapshot.supply.circulating },
      },
      {
        id: "market",
        labelKey: "sectionMarket",
        value: { kind: "MESSAGE", messageKey: "primaryOnly" },
      },
    ],
    terms: [
      {
        id: "unitClaim",
        labelKey: "unitClaim",
        value: { kind: "TEXT", text: input.instrument.denomination },
      },
      {
        id: "claimBoundary",
        labelKey: "claimBoundary",
        value: { kind: "MESSAGE", messageKey: "claimBoundary" },
      },
      {
        id: "coverageNotPledge",
        labelKey: "coverageNotPledge",
        value: { kind: "MESSAGE", messageKey: "coverageNotPledge" },
      },
      {
        id: "demoKzt",
        labelKey: "demoKzt",
        value: { kind: "MESSAGE", messageKey: "demoKzt" },
      },
      {
        id: "simulation",
        labelKey: "simulation",
        value: { kind: "MESSAGE", messageKey: "simulation" },
      },
      {
        id: "devnet",
        labelKey: "devnet",
        value: { kind: "MESSAGE", messageKey: "devnet" },
      },
      {
        id: "redemption",
        labelKey: "redemption",
        category: "REDEMPTION",
        value: tokenDetail
          ? { kind: "TEXT", text: tokenDetail.token.terms.redemptionWindow }
          : { kind: "MESSAGE", messageKey: "workingHypothesis" },
      },
    ],
    risks: [
      {
        id: "riskNote",
        labelKey: "sectionRisk",
        value: { kind: "MESSAGE", messageKey: "riskNote" },
      },
      {
        id: "coverageNotPledge",
        labelKey: "coverageNotPledge",
        value: { kind: "MESSAGE", messageKey: "coverageNotPledge" },
      },
      {
        id: "coverage",
        labelKey: "moduleCoverage",
        value: { kind: "PERCENT", value: coverage.totalHaircutPercent },
      },
    ],
    links: [
      ...(poolHref
        ? [{ id: "pool", labelKey: "pool" as const, href: poolHref }]
        : []),
      ...(dacHref
        ? [{ id: "dacs", labelKey: "moduleDacs" as const, href: dacHref }]
        : []),
      ...(monitoringHref
        ? [
            {
              id: "monitoring",
              labelKey: "moduleMonitoring" as const,
              href: monitoringHref,
            },
          ]
        : []),
    ],
    evidence: [
      {
        kind: "NOTICE",
        id: "primary-placement",
        titleKey: "primaryEvidence",
        bodyKeys: ["placementId", "notSecondaryClearing"],
      },
      {
        kind: "PROTOCOL_SLOT",
        id: "token-mint-proof",
        slot: protocolSlot,
      },
    ],
    protocolSlot,
  };
}

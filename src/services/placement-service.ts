import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { tokens } from "@/data/mock/tokens";
import type { PrimaryPlacement, TokenSupplyBreakdown } from "@/domain";
import {
  INVESTOR_0001_REFERENCE,
  ON_CHAIN_DEMO_ISSUANCE_ID,
  ON_CHAIN_DEMO_PLACEMENT_ID,
  ON_CHAIN_DEMO_TOKEN_ID,
  type OnChainLookupStatus,
  type OnChainPlacementLookup,
  type OnChainTokenBalanceLookup,
  type OnChainTokenMintLookup,
} from "@/adapters/blockchain";
import {
  placementManifest,
  recordedPlacementProof,
} from "@/adapters/blockchain/solana/recorded-placement";
import { actorCan, canReadInvestorPortfolio, type ActorContext } from "@/domain/identity";
import { blockchainProvider } from "./providers";
import { getPrimaryToken } from "./token-service";

export interface PlacementSnapshot {
  recorded: ReturnType<typeof recordedPlacementProof>;
  manifest: typeof placementManifest;
  lookup: OnChainPlacementLookup;
  registrarWheat: OnChainTokenBalanceLookup;
  investorWheat: OnChainTokenBalanceLookup;
  investorSettlement?: OnChainTokenBalanceLookup;
  issuerSettlement?: OnChainTokenBalanceLookup;
  mintLookup: OnChainTokenMintLookup;
  supply: TokenSupplyBreakdown;
  liveBalances: boolean;
}

export function fallbackSupply(): TokenSupplyBreakdown {
  const recorded = recordedPlacementProof();
  const token = tokens[0];
  return {
    maximumCoverageCapacity: wheatPoolCoverageFromEngine().eligibleCoverageTonnes,
    mintedSupply: recorded.mintedSupply ?? token?.mintedSupply ?? 1000,
    registrarInventory:
      recorded.registrarInventory ?? token?.registrarInventory ?? 1000,
    placed: recorded.placed ?? token?.placed ?? 0,
    circulating: recorded.circulating ?? token?.circulating ?? 0,
    burned: recorded.burned ?? 0,
  };
}

export function liveSupplyFromLookups(
  mintLookup: OnChainTokenMintLookup,
  registrarWheat: OnChainTokenBalanceLookup,
  investorWheat: OnChainTokenBalanceLookup,
): { supply: TokenSupplyBreakdown; liveBalances: boolean } {
  const fallback = fallbackSupply();
  const minted =
    mintLookup.status === "found" && mintLookup.mint
      ? mintLookup.mint.supply
      : fallback.mintedSupply;
  const registrarLive =
    registrarWheat.status === "found" && registrarWheat.amount !== undefined;
  const investorLive =
    investorWheat.status === "found" && investorWheat.amount !== undefined;
  const registrarInventory = registrarLive
    ? registrarWheat.amount!
    : mintLookup.mint?.holderAmount ?? fallback.registrarInventory;
  const circulating = investorLive
    ? investorWheat.amount!
    : fallback.circulating;
  const placed =
    recordedPlacementProof().status === "settled"
      ? recordedPlacementProof().placed ?? circulating
      : fallback.placed;
  return {
    liveBalances: mintLookup.status === "found" && registrarLive,
    supply: {
      maximumCoverageCapacity: fallback.maximumCoverageCapacity,
      mintedSupply: minted,
      registrarInventory,
      placed,
      circulating,
      burned: 0,
    },
  };
}

export async function getPlacementSnapshot(): Promise<PlacementSnapshot> {
  const recorded = recordedPlacementProof();
  const mintLookup = await blockchainProvider.getTokenMint(ON_CHAIN_DEMO_TOKEN_ID);
  const lookup = await blockchainProvider.getPrimaryPlacement(
    ON_CHAIN_DEMO_PLACEMENT_ID,
  );
  const registrarAddress =
    recorded.registrarInstrumentAta ?? mintLookup.mint?.holder;
  const investorAddress = recorded.investorInstrumentAta;
  const [registrarWheat, investorWheat, investorSettlement, issuerSettlement] =
    await Promise.all([
      registrarAddress
        ? blockchainProvider.getTokenAccountBalance(registrarAddress)
        : Promise.resolve<OnChainTokenBalanceLookup>({ status: "missing" }),
      investorAddress
        ? blockchainProvider.getTokenAccountBalance(investorAddress)
        : Promise.resolve<OnChainTokenBalanceLookup>({ status: "missing" }),
      recorded.demoKzt?.investorAta
        ? blockchainProvider.getTokenAccountBalance(recorded.demoKzt.investorAta)
        : Promise.resolve<OnChainTokenBalanceLookup>({ status: "missing" }),
      recorded.demoKzt?.issuerSettlementAta
        ? blockchainProvider.getTokenAccountBalance(
            recorded.demoKzt.issuerSettlementAta,
          )
        : Promise.resolve<OnChainTokenBalanceLookup>({ status: "missing" }),
    ]);
  const { supply, liveBalances } = liveSupplyFromLookups(
    mintLookup,
    registrarWheat,
    investorWheat,
  );
  return {
    recorded,
    manifest: placementManifest,
    lookup,
    registrarWheat,
    investorWheat,
    investorSettlement,
    issuerSettlement,
    mintLookup,
    supply,
    liveBalances,
  };
}

export function placementFromSnapshot(
  snapshot: PlacementSnapshot,
): PrimaryPlacement {
  const { recorded, manifest, lookup, supply } = snapshot;
  const chain = lookup.status === "found" ? lookup.placement : undefined;
  return {
    id: recorded.placementId,
    issuanceId: recorded.issuanceId ?? ON_CHAIN_DEMO_ISSUANCE_ID,
    instrumentId: recorded.instrumentId,
    instrumentSymbol: recorded.instrumentSymbol,
    investorReference: recorded.investorReference ?? INVESTOR_0001_REFERENCE,
    investorWallet: recorded.investorWallet ?? chain?.investorWallet,
    quantity: chain?.quantity ?? supply.placed ?? manifest.quantity,
    settlementAssetSymbol: manifest.settlementAsset.symbol,
    settlementAmount:
      chain?.totalSettlementAmount ?? manifest.totalSettlementAmount,
    simulatedUnitPrice: chain?.unitPrice ?? manifest.simulatedUnitPrice,
    complianceLabel: recorded.compliance?.simulated
      ? "Eligible — Demo Provider"
      : "Eligible — Demo Provider",
    walletOwnership: recorded.walletOwnership?.verified
      ? "VERIFIED"
      : "PENDING",
    status:
      lookup.status === "found" || recorded.status === "settled"
        ? "SETTLED"
        : lookup.status === "unavailable"
          ? "UNAVAILABLE"
          : "PENDING",
    settlementMethod: "ATOMIC_DVP",
    network: "Solana Devnet",
    marketProgramId: recorded.marketProgramId,
    placementPda: recorded.placementPda ?? chain?.pda,
    dvpSignature: recorded.dvpSignature ?? lookup.dvpSignature,
    registrarInstrumentAta: recorded.registrarInstrumentAta,
    investorInstrumentAta: recorded.investorInstrumentAta,
    issuerSettlementAta: recorded.demoKzt?.issuerSettlementAta,
    issuerSettlementReference: recorded.issuerSettlementReference,
    issuerSettlementLabel: recorded.issuerSettlementLabel,
    settlementMint: recorded.demoKzt?.mint,
  };
}

export async function listPrimaryPlacementsForActor(actor: ActorContext) {
  const snapshot = await getPlacementSnapshot();
  const placement = placementFromSnapshot(snapshot);
  const rows = [{ placement, snapshot }];
  if (
    actorCan(actor, "placement.read.all") ||
    actorCan(actor, "regulator.read")
  ) {
    return rows;
  }
  return rows.filter((row) =>
    canReadInvestorPortfolio(actor, row.placement.investorReference),
  );
}

export function getPrimaryTokenWithSupply(supply: TokenSupplyBreakdown) {
  const { token, pool } = getPrimaryToken();
  return {
    token: {
      ...token,
      maximumCoverageCapacity: supply.maximumCoverageCapacity,
      mintedSupply: supply.mintedSupply,
      registrarInventory: supply.registrarInventory,
      placed: supply.placed,
      circulating: supply.circulating,
      burned: supply.burned,
      issued: supply.mintedSupply,
    },
    pool,
  };
}

export function rpcStatusLabel(
  status: OnChainLookupStatus,
): "live" | "unavailable" | "missing" {
  if (status === "found") {
    return "live";
  }
  if (status === "unavailable") {
    return "unavailable";
  }
  return "missing";
}

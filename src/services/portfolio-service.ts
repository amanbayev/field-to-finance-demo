import { recordedPlacementProof } from "@/adapters/blockchain/solana/recorded-placement";
import { blockchainProvider } from "@/services/providers";
import { getPlacementSnapshot } from "@/services/placement-service";
import type { ActorContext } from "@/domain/identity";
import { canReadInvestorPortfolio } from "@/domain/identity";

export async function getInvestorPortfolio(actor: ActorContext) {
  const reference = actor.effective.investorReference;
  if (!reference || !canReadInvestorPortfolio(actor, reference)) {
    return null;
  }
  const recorded = recordedPlacementProof();
  const ata =
    actor.effective.investorAta || recorded.investorInstrumentAta;
  if (!ata) {
    return {
      organizationName: actor.effective.organization?.name ?? null,
      investorReference: reference,
      wallet: actor.effective.walletAddress ?? recorded.investorWallet ?? "",
      ata: "",
      instrument: recorded.instrumentSymbol,
      placementId: recorded.placementId,
      placementStatus: recorded.status,
      quantityLive: null,
      proofStatus: "unavailable" as const,
      coverage: 0,
      minted: 0,
      circulating: 0,
      network: "Solana Devnet",
    };
  }
  const [balance, snapshot] = await Promise.all([
    blockchainProvider.getTokenAccountBalance(ata),
    getPlacementSnapshot(),
  ]);
  return {
    organizationName: actor.effective.organization?.name ?? null,
    investorReference: reference,
    wallet: actor.effective.walletAddress ?? recorded.investorWallet,
    ata,
    instrument: recorded.instrumentSymbol,
    placementId: recorded.placementId,
    placementStatus: recorded.status,
    quantityLive: balance.status === "found" ? balance.amount : null,
    proofStatus: balance.status,
    coverage: snapshot.supply.maximumCoverageCapacity,
    minted: snapshot.supply.mintedSupply,
    circulating: snapshot.supply.circulating,
    network: "Solana Devnet",
  };
}

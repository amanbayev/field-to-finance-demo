import {
  ADMISSION_STAGES,
  canReceive,
  canTrade,
  eligibilityFor,
  type AdmissionStage,
  type AssetProtocol,
  type MarketInstrument,
} from "@/domain/market-core";
import {
  assetProtocols,
  distributionChannels,
  eligibilityMatrix,
  futureCustodyAdapters,
  futureSettlementAdapters,
  holdings,
  instrumentById,
  instrumentsForProtocol,
  marketForInstrument,
  marketInstruments,
  markets,
  protocolById,
  protocolVehicles,
  settlements,
  trades,
  wheatAdmissionProgress,
} from "@/data/market-core/catalog";

export function listAssetProtocols(): AssetProtocol[] {
  return assetProtocols;
}

export function getAssetProtocol(id: string): AssetProtocol | undefined {
  return protocolById(id);
}

export function listMarketInstruments(): MarketInstrument[] {
  return marketInstruments;
}

export function listAssetInstruments(): MarketInstrument[] {
  return marketInstruments.filter((item) => item.instrumentType === "ASSET_TOKEN");
}

export function listProtocolInvestments(): MarketInstrument[] {
  return marketInstruments.filter((item) => item.instrumentType === "PROTOCOL_INVESTMENT");
}

export function getMarketInstrument(id: string): MarketInstrument | undefined {
  return instrumentById(id);
}

export function getProtocolContext(protocolId: string) {
  const protocol = protocolById(protocolId);
  if (!protocol) {
    return null;
  }
  return {
    protocol,
    instruments: instrumentsForProtocol(protocolId),
    vehicle: protocolVehicles.find((item) => item.protocolId === protocolId) ?? null,
  };
}

export function getInstrumentMarketContext(instrumentId: string) {
  const instrument = instrumentById(instrumentId);
  if (!instrument) {
    return null;
  }
  const protocol = protocolById(instrument.assetProtocolId) ?? null;
  const market = marketForInstrument(instrument.id) ?? null;
  return { instrument, protocol, market };
}

export function listHoldings(filters?: {
  protocolId?: string;
  instrumentId?: string;
  holderReference?: string;
  issuerId?: string;
  assetClass?: string;
}) {
  return holdings.filter((holding) => {
    if (filters?.instrumentId && holding.instrumentId !== filters.instrumentId) {
      return false;
    }
    if (filters?.holderReference && holding.holderReference !== filters.holderReference) {
      return false;
    }
    const instrument = instrumentById(holding.instrumentId);
    if (filters?.protocolId && instrument?.assetProtocolId !== filters.protocolId) {
      return false;
    }
    if (filters?.issuerId && instrument?.issuerId !== filters.issuerId) {
      return false;
    }
    if (filters?.assetClass && instrument?.assetClass !== filters.assetClass) {
      return false;
    }
    return true;
  });
}

export function listEligibility(participantReference?: string) {
  if (!participantReference) {
    return eligibilityMatrix;
  }
  return eligibilityMatrix.filter((row) => row.participantReference === participantReference);
}

export function tradeDecision(participantReference: string, instrumentId: string) {
  const instrument = instrumentById(instrumentId);
  const market = marketForInstrument(instrumentId);
  if (!instrument || !market) {
    return { canTrade: false, canReceive: false, eligibility: "NOT_ASSESSED" as const };
  }
  const eligibility = eligibilityFor(eligibilityMatrix, participantReference, instrumentId);
  return {
    eligibility,
    canTrade: canTrade({ eligibility, instrument, market }),
    canReceive: canReceive({ eligibility, instrument }),
  };
}

export function listAdmission(instrumentId: string): Array<{
  stage: AdmissionStage;
  complete: boolean;
}> {
  if (instrumentId !== "WHEAT-2027") {
    return ADMISSION_STAGES.map((stage) => ({ stage, complete: false }));
  }
  return ADMISSION_STAGES.map((stage) => ({
    stage,
    complete: wheatAdmissionProgress[stage],
  }));
}

export function marketCoreSnapshot() {
  return {
    protocols: assetProtocols,
    instruments: marketInstruments,
    markets,
    trades,
    settlements,
    holdings,
    eligibilityMatrix,
    distributionChannels,
    futureCustodyAdapters,
    futureSettlementAdapters,
    secondaryTrades: trades.filter((trade) => trade.kind === "SECONDARY"),
  };
}

export function noBlockchainMutationInPhase5A(): true {
  return true;
}

export function noDevnetSettlementInPhase5B(): true {
  return true;
}

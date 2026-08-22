import recordedPlacementJson from "./recorded-placement.json";
import placementManifestJson from "./placement-manifest.json";

export interface PlacementManifest {
  version: number;
  label: string;
  placementId: string;
  issuanceId: string;
  instrumentId: string;
  instrumentSymbol: string;
  investorReference: string;
  quantity: number;
  simulatedUnitPrice: number;
  totalSettlementAmount: number;
  settlementAsset: {
    symbol: string;
    decimals: number;
    disclaimer: string;
    notAStablecoin: boolean;
    notLegalTender: boolean;
    noMonetaryValue: boolean;
  };
}

export interface RecordedWalletOwnership {
  participantReference: string;
  wallet: string;
  nonce: string;
  messageUtf8: string;
  signatureBase64: string;
  algorithm: string;
  verified: boolean;
}

export interface RecordedPlacementProof {
  status: "pending" | "settled";
  placementId: string;
  issuanceId: string;
  instrumentId: string;
  instrumentSymbol: string;
  investorReference: string;
  investorWallet?: string;
  issuerSettlementReference?: string;
  issuerSettlementOwner?: string;
  issuerSettlementLabel?: string;
  quantity: number;
  simulatedUnitPrice: number;
  totalSettlementAmount: number;
  priceDisclaimer: string;
  settlementAssetDisclaimer: string;
  marketProgramId: string;
  marketProgramDeploySignature?: string;
  marketConfigPda?: string;
  placementPda?: string;
  poolPda?: string;
  instrumentMint?: string;
  registrarInstrumentAta?: string;
  investorInstrumentAta?: string;
  initializeSignature?: string;
  dvpSignature?: string;
  mintedSupply?: number;
  registrarInventory?: number;
  placed?: number;
  circulating?: number;
  burned?: number;
  demoKzt?: {
    mint: string;
    createSignature?: string;
    decimals: number;
    investorAta?: string;
    issuerSettlementAta?: string;
    investorBalance?: number;
    issuerSettlementBalance?: number;
  };
  walletOwnership?: RecordedWalletOwnership;
  compliance?: {
    providerLabel: string;
    simulated: boolean;
    identityEntityCheck: string;
    sanctions: string;
    kyt: string;
    eligibility: string;
    walletOwnership: string;
    referenceHashHex: string;
  };
  investorReferenceHashHex?: string;
}

export const placementManifest = placementManifestJson as PlacementManifest;

export function recordedPlacementProof(): RecordedPlacementProof {
  return recordedPlacementJson as RecordedPlacementProof;
}

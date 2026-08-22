import {
  LEGAL_OPERATOR,
  availableBalance,
  type AdmissionStage,
  type AssetProtocol,
  type CustodyProviderAdapter,
  type DistributionChannelRecord,
  type Holding,
  type Market,
  type MarketInstrument,
  type ParticipantInstrumentEligibility,
  type ProtocolInvestmentVehicle,
  type Settlement,
  type SettlementProviderAdapter,
  type Trade,
} from "@/domain/market-core";
import { tokens } from "@/data/mock/tokens";

const wheat = tokens[0]!;

export const F2F_PROTOCOL_ID = "F2F";
export const WHEAT_INSTRUMENT_ID = "WHEAT-2027";
export const F2F_PROTOCOL_INVESTMENT_ID = "F2F-PROTOCOL-INVESTMENT";
export const WATER_PROTOCOL_ID = "WATER";
export const MUSIC_PROTOCOL_ID = "MUSIC_RIGHTS";
export const GAMING_PROTOCOL_ID = "GAMING_ASSETS";

export const F2F_LIFECYCLE = [
  "field",
  "dac",
  "verification",
  "pool",
  "coverage",
  "instrument",
  "issuance",
  "placement",
  "market",
  "redemption",
] as const;

export const F2F_MODULES = [
  "fields",
  "dacs",
  "scas",
  "pools",
  "coverage",
  "monitoring",
] as const;

export const assetProtocols: AssetProtocol[] = [
  {
    id: F2F_PROTOCOL_ID,
    name: "Field to Finance",
    assetClass: "AGRICULTURE",
    protocolOwner: "Field to Finance",
    operator: LEGAL_OPERATOR,
    version: "5A",
    status: "ACTIVE",
    verificationModel: "SCAS / fields / DAC / coverage",
    riskModel: "Off-chain risk haircut on pooled contracts",
    coverageModel: "Eligible coverage as issuance capacity, not a legal pledge",
    issuanceModel: "Token-2022 ASSET_TOKEN against issuer claim",
    redemptionModel: "Working hypothesis · grain delivery window",
    regulatoryStatus: "DEMONSTRATOR_ONLY",
    lifecycle: F2F_LIFECYCLE,
    modules: F2F_MODULES,
  },
  {
    id: WATER_PROTOCOL_ID,
    name: "Water",
    assetClass: "WATER",
    protocolOwner: "Not appointed",
    operator: LEGAL_OPERATOR,
    version: "—",
    status: "STRUCTURING",
    verificationModel: "Structuring",
    riskModel: "Structuring",
    coverageModel: "Structuring",
    issuanceModel: "Structuring",
    redemptionModel: "Structuring",
    regulatoryStatus: "NOT_SUBMITTED",
    lifecycle: [],
    modules: [],
  },
  {
    id: MUSIC_PROTOCOL_ID,
    name: "Music Rights",
    assetClass: "MUSIC_RIGHTS",
    protocolOwner: "Not appointed",
    operator: LEGAL_OPERATOR,
    version: "—",
    status: "STRUCTURING",
    verificationModel: "Structuring",
    riskModel: "Structuring",
    coverageModel: "Structuring",
    issuanceModel: "Structuring",
    redemptionModel: "Structuring",
    regulatoryStatus: "NOT_SUBMITTED",
    lifecycle: [],
    modules: [],
  },
  {
    id: GAMING_PROTOCOL_ID,
    name: "Gaming Assets",
    assetClass: "GAMING_ASSETS",
    protocolOwner: "Not appointed",
    operator: LEGAL_OPERATOR,
    version: "—",
    status: "CONCEPT",
    verificationModel: "Concept",
    riskModel: "Concept",
    coverageModel: "Concept",
    issuanceModel: "Concept",
    redemptionModel: "Concept",
    regulatoryStatus: "NOT_SUBMITTED",
    lifecycle: [],
    modules: [],
  },
];

export const marketInstruments: MarketInstrument[] = [
  {
    id: WHEAT_INSTRUMENT_ID,
    symbol: wheat.symbol,
    name: "2027 Wheat Commodity Agricultural Token",
    instrumentType: "ASSET_TOKEN",
    assetProtocolId: F2F_PROTOCOL_ID,
    assetClass: "AGRICULTURE",
    issuerId: wheat.issuerId,
    issuerName: wheat.issuerName,
    issuanceId: "ISS-001",
    legalClassification: "Commodity Agricultural Token · claim against the Issuer",
    denomination: "1 token = 1 tonne Wheat Class 3 claim",
    decimals: 0,
    currencyOrUnit: "t",
    transferPolicy: "Registrar book of record · Devnet demonstrator",
    eligibilityPolicy: "Participant × instrument · investor eligibility required",
    settlementPolicy: "Atomic DvP on primary placement · secondary closed",
    custodyPolicy: "Unresolved: disclosed holder vs omnibus / nominee",
    status: "ISSUED",
    agriculturalTokenId: wheat.id,
  },
  {
    id: F2F_PROTOCOL_INVESTMENT_ID,
    symbol: "F2F-PROTOCOL-INVESTMENT",
    name: "Field to Finance Protocol Investment",
    instrumentType: "PROTOCOL_INVESTMENT",
    assetProtocolId: F2F_PROTOCOL_ID,
    assetClass: "AGRICULTURE",
    issuerId: "future-f2f-spv",
    issuerName: "F2F Issuer / SPV (future structuring)",
    issuanceId: null,
    legalClassification: "Not classified · not offered",
    denomination: "Not defined",
    decimals: 0,
    currencyOrUnit: "—",
    transferPolicy: "Not open",
    eligibilityPolicy: "Not assessed",
    settlementPolicy: "Not open",
    custodyPolicy: "Not structured",
    status: "FUTURE",
  },
];

export const protocolVehicles: ProtocolInvestmentVehicle[] = [
  {
    id: "spv-f2f-protocol",
    protocolId: F2F_PROTOCOL_ID,
    name: "Field to Finance Protocol Investment Vehicle",
    status: "FUTURE_STRUCTURING",
    instrumentId: F2F_PROTOCOL_INVESTMENT_ID,
    possibleModels: [
      "EQUITY_LIKE",
      "REVENUE_PARTICIPATION",
      "DEBT_LIKE",
      "CONVERTIBLE",
      "STRUCTURED_INVESTMENT_RIGHT",
    ],
    openForInvestment: false,
  },
];

export const markets: Market[] = [
  {
    id: "mkt-wheat-2027",
    instrumentId: WHEAT_INSTRUMENT_ID,
    phase: "PRIMARY_ONLY",
    activeChannel: "DIRECT_MTP",
    transacting: false,
  },
];

export const trades: Trade[] = [];

export const settlements: Settlement[] = [
  {
    id: "set-pl-iss001-0001",
    tradeId: "PL-ISS001-0001",
    status: "FINAL",
    evidenceLabel: "PRIMARY_PLACEMENT_EVIDENCE",
  },
];

const registrarBuckets = {
  owned: wheat.registrarInventory,
  reservedForOrders: 0,
  pledged: 0,
  blocked: 0,
};

const investorBuckets = {
  owned: wheat.circulating,
  reservedForOrders: 0,
  pledged: 0,
  blocked: 0,
};

export const holdings: Holding[] = [
  {
    id: "hld-registrar-wheat",
    instrumentId: WHEAT_INSTRUMENT_ID,
    holderReference: "REGISTRAR",
    holderName: "Agricultural Registrar",
    buckets: registrarBuckets,
    available: availableBalance(registrarBuckets),
  },
  {
    id: "hld-steppe-wheat",
    instrumentId: WHEAT_INSTRUMENT_ID,
    holderReference: "INVESTOR-0001",
    holderName: "Steppe Capital",
    buckets: investorBuckets,
    available: availableBalance(investorBuckets),
  },
];

export const eligibilityMatrix: ParticipantInstrumentEligibility[] = [
  {
    participantReference: "INVESTOR-0001",
    participantName: "Steppe Capital",
    instrumentId: WHEAT_INSTRUMENT_ID,
    state: "ELIGIBLE",
  },
  {
    participantReference: "INVESTOR-0001",
    participantName: "Steppe Capital",
    instrumentId: "WATER-FUTURE",
    state: "NOT_ASSESSED",
  },
  {
    participantReference: "INVESTOR-0001",
    participantName: "Steppe Capital",
    instrumentId: F2F_PROTOCOL_INVESTMENT_ID,
    state: "NOT_ASSESSED",
  },
  {
    participantReference: "RETAIL-PLACEHOLDER",
    participantName: "Retail investor (future channel)",
    instrumentId: WHEAT_INSTRUMENT_ID,
    state: "POLICY_PENDING",
  },
];

export const distributionChannels: DistributionChannelRecord[] = [
  { channel: "DIRECT_MTP", active: true, routesToMarketCore: true },
  { channel: "RETAIL_APP", active: false, routesToMarketCore: true },
  { channel: "API", active: false, routesToMarketCore: true },
  { channel: "BROKER", active: false, routesToMarketCore: true },
];

export const futureCustodyAdapters: CustodyProviderAdapter[] = [
  { id: "BinanceCustodyProvider", label: "Binance custody (future)", implemented: false },
];

export const futureSettlementAdapters: SettlementProviderAdapter[] = [
  { id: "BankSettlementProvider", label: "Bank / fiat settlement (future)", implemented: false },
  {
    id: "StablecoinSettlementProvider",
    label: "Stablecoin settlement (future)",
    implemented: false,
  },
];

export const wheatAdmissionProgress: Record<AdmissionStage, boolean> = {
  IDEA: true,
  STRUCTURING: true,
  LEGAL_CLASSIFICATION: true,
  ASSET_VERIFICATION: true,
  RISK_METHODOLOGY: true,
  SPV_OR_ISSUER_STRUCTURING: true,
  DISCLOSURE: true,
  COMPLIANCE_REVIEW: true,
  REGISTRAR_REVIEW: true,
  MARKET_ADMISSION: true,
  ISSUANCE: true,
  PRIMARY_PLACEMENT: true,
  SECONDARY_MARKET: false,
};

export function protocolById(id: string): AssetProtocol | undefined {
  return assetProtocols.find((protocol) => protocol.id === id);
}

export function instrumentById(id: string): MarketInstrument | undefined {
  return marketInstruments.find(
    (instrument) => instrument.id === id || instrument.symbol === id,
  );
}

export function instrumentsForProtocol(protocolId: string): MarketInstrument[] {
  return marketInstruments.filter((instrument) => instrument.assetProtocolId === protocolId);
}

export function marketForInstrument(instrumentId: string): Market | undefined {
  return markets.find((market) => market.instrumentId === instrumentId);
}

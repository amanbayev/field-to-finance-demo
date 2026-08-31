import {
  LEGAL_OPERATOR,
  availableBalance,
  freezeProtocolVersionRegistry,
  type AdmissionStage,
  type AssetProtocol,
  type CustodyProviderAdapter,
  type DistributionChannelRecord,
  type Holding,
  type Market,
  type MarketInstrument,
  type ParticipantInstrumentEligibility,
  type ProtocolInvestmentVehicle,
  type ProtocolVersion,
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

/**
 * The first recorded immutable version of the Field to Finance demonstrator
 * protocol.
 *
 * This is a protocol version identifier, not an engineering phase label. No
 * earlier F2F version is recorded in this registry, so this version supersedes
 * nothing.
 *
 * `activatedAt` and `frozenAt` are null: no formal legal or governance
 * activation date has been established for this version, and none is claimed.
 * Immutability is asserted by the `frozen` marker, not by a date.
 */
export const F2F_V1_1_VERSION_ID = "F2F-V1.1";

/**
 * The canonical protocol version registry. Deeply frozen at runtime and
 * readonly at compile time: neither the array nor any version, rule snapshot,
 * lifecycle or modules array it owns can be mutated by a caller.
 */
export const protocolVersions: readonly ProtocolVersion[] = freezeProtocolVersionRegistry([
  {
    id: F2F_V1_1_VERSION_ID,
    protocolId: F2F_PROTOCOL_ID,
    displayVersion: "1.1",
    state: "ACTIVE",
    frozen: true,
    activatedAt: null,
    frozenAt: null,
    supersedesVersionId: null,
    supersededByVersionId: null,
    governanceNote:
      "First recorded version of the Field to Finance demonstrator protocol. No formal legal or governance activation date has been established, and none is claimed: activation and freeze dates are deliberately unset rather than assumed. Immutability is asserted by the frozen marker — instruments issued under this version keep this exact reference and do not follow later versions.",
    rules: {
      verificationModel: "SCAS / fields / DAC / coverage",
      riskModel: "Off-chain risk haircut on pooled contracts",
      coverageModel: "Eligible coverage as issuance capacity, not a legal pledge",
      issuanceModel: "Token-2022 ASSET_TOKEN against issuer claim",
      redemptionModel: "Working hypothesis · grain delivery window",
      lifecycle: F2F_LIFECYCLE,
      modules: F2F_MODULES,
    },
  },
]);

/**
 * Water, Music Rights and Gaming Assets have no protocol version. They are
 * STRUCTURING / CONCEPT and no version is invented for them.
 */
export const assetProtocols: AssetProtocol[] = [
  {
    id: F2F_PROTOCOL_ID,
    name: "Field to Finance",
    assetClass: "AGRICULTURE",
    protocolOwner: "Field to Finance",
    operator: LEGAL_OPERATOR,
    status: "ACTIVE",
    regulatoryStatus: "DEMONSTRATOR_ONLY",
    currentVersionId: F2F_V1_1_VERSION_ID,
  },
  {
    id: WATER_PROTOCOL_ID,
    name: "Water",
    assetClass: "WATER",
    protocolOwner: "Not appointed",
    operator: LEGAL_OPERATOR,
    status: "STRUCTURING",
    regulatoryStatus: "NOT_SUBMITTED",
    currentVersionId: null,
  },
  {
    id: MUSIC_PROTOCOL_ID,
    name: "Music Rights",
    assetClass: "MUSIC_RIGHTS",
    protocolOwner: "Not appointed",
    operator: LEGAL_OPERATOR,
    status: "STRUCTURING",
    regulatoryStatus: "NOT_SUBMITTED",
    currentVersionId: null,
  },
  {
    id: GAMING_PROTOCOL_ID,
    name: "Gaming Assets",
    assetClass: "GAMING_ASSETS",
    protocolOwner: "Not appointed",
    operator: LEGAL_OPERATOR,
    status: "CONCEPT",
    regulatoryStatus: "NOT_SUBMITTED",
    currentVersionId: null,
  },
];

export const marketInstruments: MarketInstrument[] = [
  {
    id: WHEAT_INSTRUMENT_ID,
    symbol: wheat.symbol,
    name: "2027 Wheat Commodity Agricultural Token",
    instrumentType: "ASSET_TOKEN",
    assetProtocolId: F2F_PROTOCOL_ID,
    protocolVersionId: F2F_V1_1_VERSION_ID,
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
    settlementPolicy:
      "Primary placement is atomic DvP evidence. Secondary LIMIT orders settle in DEMO-KZT; Devnet DvP is not executed in Phase 5B Preview.",
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
    // CONCEPT / STRUCTURING: no offering, not issued, so no version to bind.
    protocolVersionId: null,
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
    status: "STRUCTURING",
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
    id: "MKT-WHEAT-2027-DEMO-KZT",
    instrumentId: WHEAT_INSTRUMENT_ID,
    phase: "SECONDARY_OPEN",
    activeChannel: "DIRECT_MTP",
    transacting: true,
    matchingEnabled: true,
    settlementEnabled: false,
    demonstratorStatus: "DEMO_OPEN",
    settlementAssetId: "DEMO-KZT",
    settlementAssetLabel: "DEMO-KZT",
    settlementHasMonetaryValue: false,
    marketType: "REGULATED_INSTITUTIONAL_DEMONSTRATOR",
    allowedOrderTypes: ["LIMIT"],
    wholeQuantityOnly: true,
  },
];

export const trades: Trade[] = [];

export const settlements: Settlement[] = [
  {
    id: "set-pl-iss001-0001",
    tradeId: "PL-ISS001-0001",
    status: "FINAL",
    evidenceLabel: "PRIMARY_PLACEMENT_EVIDENCE",
    kind: "PRIMARY",
  },
];

const registrarBuckets = {
  owned: wheat.registrarInventory,
  reservedForOrders: 0,
  pledged: 0,
  blocked: 0,
  pendingIn: 0,
  pendingOut: 0,
};

const investorBuckets = {
  owned: wheat.circulating,
  reservedForOrders: 0,
  pledged: 0,
  blocked: 0,
  pendingIn: 0,
  pendingOut: 0,
};

const grainDeskBuckets = {
  owned: 0,
  reservedForOrders: 0,
  pledged: 0,
  blocked: 0,
  pendingIn: 0,
  pendingOut: 0,
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
  {
    id: "hld-grain-desk-wheat",
    instrumentId: WHEAT_INSTRUMENT_ID,
    holderReference: "GRAIN-DESK",
    holderName: "Grain Desk",
    buckets: grainDeskBuckets,
    available: availableBalance(grainDeskBuckets),
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
    participantReference: "GRAIN-DESK",
    participantName: "Grain Desk",
    instrumentId: WHEAT_INSTRUMENT_ID,
    state: "ELIGIBLE",
  },
  {
    participantReference: "COMMODITY-DESK",
    participantName: "Commodity Desk",
    instrumentId: WHEAT_INSTRUMENT_ID,
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
  { id: "DemoSettlementProvider", label: "DEMO-KZT fixture (Preview)", implemented: true },
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
  SECONDARY_MARKET: true,
};

export function protocolById(id: string): AssetProtocol | undefined {
  return assetProtocols.find((protocol) => protocol.id === id);
}

export function versionById(id: string): ProtocolVersion | undefined {
  return protocolVersions.find((version) => version.id === id);
}

export function versionsForProtocol(protocolId: string): readonly ProtocolVersion[] {
  return protocolVersions.filter((version) => version.protocolId === protocolId);
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

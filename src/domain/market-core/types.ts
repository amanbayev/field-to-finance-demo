export const ASSET_CLASSES = [
  "AGRICULTURE",
  "WATER",
  "MUSIC_RIGHTS",
  "GAMING_ASSETS",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

export const INSTRUMENT_TYPES = ["ASSET_TOKEN", "PROTOCOL_INVESTMENT"] as const;

export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

export const PROTOCOL_STATUSES = [
  "CONCEPT",
  "STRUCTURING",
  "IN_REVIEW",
  "ADMITTED",
  "ACTIVE",
] as const;

export type ProtocolStatus = (typeof PROTOCOL_STATUSES)[number];

export const INSTRUMENT_STATUSES = [
  "FUTURE",
  "STRUCTURING",
  "ADMITTED",
  "ISSUED",
] as const;

export type InstrumentStatus = (typeof INSTRUMENT_STATUSES)[number];

export const REGULATORY_STATUSES = [
  "DEMONSTRATOR_ONLY",
  "NOT_SUBMITTED",
  "NOT_AN_AFSA_PERMISSION",
] as const;

export type RegulatoryStatus = (typeof REGULATORY_STATUSES)[number];

export const ADMISSION_STAGES = [
  "IDEA",
  "STRUCTURING",
  "LEGAL_CLASSIFICATION",
  "ASSET_VERIFICATION",
  "RISK_METHODOLOGY",
  "SPV_OR_ISSUER_STRUCTURING",
  "DISCLOSURE",
  "COMPLIANCE_REVIEW",
  "REGISTRAR_REVIEW",
  "MARKET_ADMISSION",
  "ISSUANCE",
  "PRIMARY_PLACEMENT",
  "SECONDARY_MARKET",
] as const;

export type AdmissionStage = (typeof ADMISSION_STAGES)[number];

export const DISTRIBUTION_CHANNELS = [
  "DIRECT_MTP",
  "RETAIL_APP",
  "API",
  "BROKER",
] as const;

export type DistributionChannel = (typeof DISTRIBUTION_CHANNELS)[number];

export const MARKET_PHASES = ["CLOSED", "PRIMARY_ONLY", "SECONDARY_OPEN"] as const;

export type MarketPhase = (typeof MARKET_PHASES)[number];

export const ORDER_SIDES = ["BUY", "SELL"] as const;

export type OrderSide = (typeof ORDER_SIDES)[number];

export const ORDER_TYPES = ["LIMIT"] as const;

export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_SOURCE_CHANNELS = ["DIRECT_MTP"] as const;

export type OrderSourceChannel = (typeof ORDER_SOURCE_CHANNELS)[number];

export const ORDER_STATUSES = [
  "OPEN",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
  "REJECTED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TRADE_STATUSES = [
  "MATCHED",
  "CLEARING_READY",
  "AWAITING_DEVNET_SETTLEMENT",
] as const;

export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const SETTLEMENT_STATUSES = [
  "NONE",
  "RESERVED",
  "DVP_COMPLETE",
  "FINAL",
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const RESERVATION_KINDS = ["ASSET", "SETTLEMENT"] as const;

export type ReservationKind = (typeof RESERVATION_KINDS)[number];

export const RESERVATION_STATUSES = [
  "ACTIVE",
  "RELEASED",
  "HELD_PENDING_SETTLEMENT",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const MARKET_EVENT_TYPES = [
  "order_submitted",
  "order_reserved",
  "order_matched",
  "order_cancelled",
  "order_rejected",
  "trade_created",
  "clearing_started",
  "eligibility_rechecked",
  "settlement_reservation_confirmed",
] as const;

export type MarketEventType = (typeof MARKET_EVENT_TYPES)[number];

export const SETTLED_EVENT_TYPES = [
  "settlement_finalized",
  "registry_transfer_completed",
] as const;

export const ELIGIBILITY_STATES = [
  "ELIGIBLE",
  "NOT_ELIGIBLE",
  "NOT_ASSESSED",
  "POLICY_PENDING",
] as const;

export type InstrumentEligibilityState = (typeof ELIGIBILITY_STATES)[number];

export const PROTOCOL_VERSION_STATES = [
  "DRAFT",
  "ACTIVE",
  "SUPERSEDED",
  "RETIRED",
] as const;

export type ProtocolVersionState = (typeof PROTOCOL_VERSION_STATES)[number];

export const PROTOCOL_INVESTMENT_MODELS = [
  "EQUITY_LIKE",
  "REVENUE_PARTICIPATION",
  "DEBT_LIKE",
  "CONVERTIBLE",
  "STRUCTURED_INVESTMENT_RIGHT",
] as const;

export type ProtocolInvestmentModel = (typeof PROTOCOL_INVESTMENT_MODELS)[number];

/**
 * The versioned rule set of an AssetProtocol. Immutable once the owning
 * ProtocolVersion is frozen. Rules live here and nowhere else: AssetProtocol
 * must not carry a second, mutable copy of them.
 */
export interface ProtocolRuleSnapshot {
  verificationModel: string;
  riskModel: string;
  coverageModel: string;
  issuanceModel: string;
  redemptionModel: string;
  lifecycle: readonly string[];
  modules: readonly string[];
}

/**
 * An approved, immutable version of an AssetProtocol. Issued instruments hold a
 * permanent reference to the exact version they were created under, so a later
 * version can never silently rewrite the rules governing an existing instrument.
 */
export interface ProtocolVersion {
  /** Stable permanent identifier referenced by instruments, e.g. "F2F-V1.1". */
  id: string;
  /** Owning protocol, e.g. "F2F". */
  protocolId: string;
  /** Human-facing version label, e.g. "1.1". Never an engineering phase label. */
  displayVersion: string;
  state: ProtocolVersionState;
  /**
   * The technical immutability marker. A frozen version's rules must never
   * change. This is the authoritative marker — it does not depend on a date.
   */
  frozen: boolean;
  /**
   * Formal legal / governance activation date, when one has been established.
   * Null means no such date is claimed. Never backfill a plausible date.
   */
  activatedAt: string | null;
  /**
   * Date the rules were frozen, when one has been established. Null means no
   * such date is claimed; immutability is asserted by `frozen`, not by this.
   */
  frozenAt: string | null;
  supersedesVersionId: string | null;
  supersededByVersionId: string | null;
  governanceNote: string;
  rules: ProtocolRuleSnapshot;
}

export interface AssetProtocol {
  id: string;
  name: string;
  assetClass: AssetClass;
  protocolOwner: string;
  operator: string;
  status: ProtocolStatus;
  regulatoryStatus: RegulatoryStatus;
  /**
   * Mutable pointer to the version new instruments would be created under.
   * Discovery only. Never resolve an already-issued instrument's rules through
   * this field — use the instrument's own `protocolVersionId`.
   */
  currentVersionId: string | null;
}

export interface MarketInstrument {
  id: string;
  symbol: string;
  name: string;
  instrumentType: InstrumentType;
  assetProtocolId: string;
  /**
   * Permanent binding to the exact ProtocolVersion this instrument was created
   * under. Required for an ISSUED instrument; null only while an instrument has
   * no issuance to bind (FUTURE / STRUCTURING).
   */
  protocolVersionId: string | null;
  assetClass: AssetClass;
  issuerId: string;
  issuerName: string;
  issuanceId: string | null;
  legalClassification: string;
  denomination: string;
  decimals: number;
  currencyOrUnit: string;
  transferPolicy: string;
  eligibilityPolicy: string;
  settlementPolicy: string;
  custodyPolicy: string;
  status: InstrumentStatus;
  agriculturalTokenId?: string;
}

export interface ProtocolInvestmentVehicle {
  id: string;
  protocolId: string;
  name: string;
  status: "FUTURE_STRUCTURING";
  instrumentId: string;
  possibleModels: readonly ProtocolInvestmentModel[];
  openForInvestment: false;
}

export interface Market {
  id: string;
  instrumentId: string;
  phase: MarketPhase;
  activeChannel: DistributionChannel;
  transacting: boolean;
  matchingEnabled: boolean;
  settlementEnabled: boolean;
  demonstratorStatus: "DEMO_OPEN" | "DEMO_CLOSED";
  settlementAssetId: string;
  settlementAssetLabel: string;
  settlementHasMonetaryValue: false;
  marketType: "REGULATED_INSTITUTIONAL_DEMONSTRATOR";
  allowedOrderTypes: readonly OrderType[];
  wholeQuantityOnly: true;
}

export interface Order {
  id: string;
  marketId: string;
  instrumentId: string;
  participantId: string;
  side: OrderSide;
  orderType: OrderType;
  price: number;
  originalQuantity: number;
  remainingQuantity: number;
  filledQuantity: number;
  status: OrderStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  sourceChannel: OrderSourceChannel;
  rejectReason?: string;
}

export interface OrderReservation {
  id: string;
  orderId: string;
  marketId: string;
  instrumentId: string;
  participantId: string;
  kind: ReservationKind;
  quantity: number;
  status: ReservationStatus;
}

export interface Trade {
  id: string;
  marketId: string;
  instrumentId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerParticipantId: string;
  sellerParticipantId: string;
  quantity: number;
  price: number;
  notional: number;
  status: TradeStatus;
  kind: "PRIMARY_PLACEMENT" | "SECONDARY";
  createdAt: string;
  updatedAt: string;
  eligibilityRecheckPassed: boolean;
  dvpStatus: "PENDING";
  registryUpdateStatus: "PENDING";
  finalSettlementStatus: "PENDING";
}

export interface Settlement {
  id: string;
  tradeId: string;
  status: SettlementStatus;
  evidenceLabel: "PRIMARY_PLACEMENT_EVIDENCE" | null;
  kind: "PRIMARY" | "SECONDARY";
}

export interface HoldingBuckets {
  owned: number;
  reservedForOrders: number;
  pledged: number;
  blocked: number;
  pendingIn: number;
  pendingOut: number;
}

export interface Holding {
  id: string;
  instrumentId: string;
  holderReference: string;
  holderName: string;
  buckets: HoldingBuckets;
  available: number;
}

export interface ParticipantInstrumentEligibility {
  participantReference: string;
  participantName: string;
  instrumentId: string;
  state: InstrumentEligibilityState;
}

export interface DistributionChannelRecord {
  channel: DistributionChannel;
  active: boolean;
  routesToMarketCore: true;
}

export interface CustodyProviderAdapter {
  id: string;
  label: string;
  implemented: false;
}

export interface SettlementProviderAdapter {
  id: string;
  label: string;
  implemented: boolean;
}

export interface SettlementAccount {
  participantId: string;
  assetId: string;
  available: number;
  reserved: number;
}

export interface MarketEvent {
  id: string;
  timestamp: string;
  actor: string;
  participantId: string | null;
  instrumentId: string;
  marketId: string;
  entityId: string;
  type: MarketEventType;
  metadata: Record<string, string | number | boolean | null>;
}

export interface EngineState {
  now: string;
  nextOrderSeq: number;
  nextOrderId: number;
  nextTradeId: number;
  nextReservationId: number;
  nextSettlementId: number;
  nextEventId: number;
  markets: Market[];
  instruments: MarketInstrument[];
  orders: Order[];
  reservations: OrderReservation[];
  trades: Trade[];
  settlements: Settlement[];
  holdings: Holding[];
  eligibility: ParticipantInstrumentEligibility[];
  settlementAccounts: SettlementAccount[];
  events: MarketEvent[];
}

export interface ClearingStep {
  id: string;
  labelKey: string;
}

export const CLEARING_STEPS = [
  "tradeMatched",
  "eligibilityRecheck",
  "sellerReservation",
  "buyerReservation",
  "dvp",
  "registryUpdate",
  "finalSettlement",
  "audit",
] as const;

export const INSTRUMENT_SECTIONS = [
  "overview",
  "terms",
  "basis",
  "risk",
  "market",
  "clearing",
  "ownership",
  "documents",
  "audit",
] as const;

export type InstrumentSection = (typeof INSTRUMENT_SECTIONS)[number];

export const LEGAL_OPERATOR = "CommoChain Ltd";

import type { Money } from "./money";

export type ContractStatus =
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "IN_POOL"
  | "SUSPENDED";

export type VerificationState = "VERIFIED" | "PASSED" | "CONFIRMED" | "PENDING" | "FAILED";

export type MonitoringHealth = "HEALTHY" | "WATCH" | "ALERT";

export type MoistureLevel = "NORMAL" | "DRY" | "EXCESS";

export type InsuranceState = "ACTIVE" | "EXPIRED" | "NONE";

export type CoverageStatus = "HEALTHY" | "WATCH" | "BREACH";

export type EligibilityStatus = "ELIGIBLE" | "WATCH" | "INELIGIBLE";

export type BlockchainDeploymentStatus = "NOT_YET_DEPLOYED" | "DEPLOYED";

export type ParticipantType = "PRODUCER" | "INVESTOR" | "ISSUER";

export type CheckResult = "VERIFIED" | "PENDING" | "FAILED" | "NOT_APPLICABLE";

export type RiskBand = "LOW_RISK" | "HIGH_RISK" | "PENDING";

export type ScreeningResult = "CLEAR" | "HIT" | "PENDING";

export type ParticipantEligibility = "APPROVED" | "BLOCKED" | "PENDING";

export type FinancingModule = "SECURED_LOAN" | "REPO";

export type FinancingModuleStatus = "COMING_NEXT" | "EXPERIMENTAL";

export interface ProducerScore {
  value: number;
  maxValue: number;
  asOf: string;
}

export interface IssuerScore {
  issuerId: string;
  value: number;
  maxValue: number;
  asOf: string;
}

export interface Producer {
  id: string;
  legalName: string;
  region: string;
  score: ProducerScore;
}

export interface ContractVerification {
  landRights: VerificationState;
  kyb: VerificationState;
  directorKyc: VerificationState;
  field: VerificationState;
  crop: VerificationState;
}

export interface FieldMonitoring {
  satellite: MonitoringHealth;
  soilMoisture: MoistureLevel;
}

export interface InsuranceCover {
  status: InsuranceState;
  provider: string;
  policyRef: string;
}

export interface FieldRecord {
  region: string;
  areaHectares: number;
  cadastralRef: string;
  centroidLabel: string;
}

export interface ProductionRecord {
  crop: string;
  quality: string;
  season: number;
  expectedProductionTonnes: number;
  deliveryPeriod: string;
}

export interface DigitalAgriculturalContract {
  id: string;
  producerId: string;
  field: FieldRecord;
  production: ProductionRecord;
  status: ContractStatus;
  verification: ContractVerification;
  monitoring: FieldMonitoring;
  insurance: InsuranceCover;
}

export interface RiskAdjustment {
  key: string;
  label: string;
  percentagePoints: number;
  basisPoints: number;
  source: string;
  status: string;
  lastUpdated: string;
  evidenceReference: string;
}

export interface ContractCoverage {
  poolId: string;
  grossVolumeTonnes: number;
  adjustments: RiskAdjustment[];
  totalHaircutPercent: number;
  totalHaircutBps: number;
  eligibleCoverageTonnes: number;
  maximumTokenIssuance: number;
  outstandingTokens: number;
  coverageRatioPercent: number | null;
  tokenIssuanceStarted: boolean;
  snapshotHashHex?: string;
  snapshotVersion: number;
  calculatedAt: string;
  status: CoverageStatus;
}

export interface PoolMember {
  contractId: string;
  volumeTonnes: number;
  eligibility: EligibilityStatus;
}

export interface ContractPool {
  id: string;
  name: string;
  crop: string;
  season: number;
  contractIds: string[];
  members: PoolMember[];
  coverage: ContractCoverage;
}

export interface AgriculturalToken {
  id: string;
  symbol: string;
  type: string;
  issuerId: string;
  issuerName: string;
  tokenUnitDescription: string;
  poolId: string;
  maximumIssuance: number;
  issued: number;
  network: string;
  blockchainStatus: BlockchainDeploymentStatus;
}

export interface Participant {
  id: string;
  name: string;
  type: ParticipantType;
}

export interface ComplianceRecord {
  participantId: string;
  providerLabel: string;
  kyc: CheckResult;
  kyb: CheckResult;
  directorKyc: CheckResult;
  kyt: RiskBand;
  walletOwnership: CheckResult;
  sanctions: ScreeningResult;
  pep: ScreeningResult;
  eligibility: ParticipantEligibility;
}

export interface FinancingPosition {
  id: string;
  module: FinancingModule;
  status: FinancingModuleStatus;
  marketValue: Money;
  haircutPercent: number;
  principal: Money;
}

export type AuditEventSource = "application" | "blockchain";

export type AuditDisplayStatus = "application" | "blockchain" | "simulationOnly";

export type AuditEventKey =
  | "contractCreated"
  | "producerVerified"
  | "contractVerified"
  | "addedToPool"
  | "riskCompleted"
  | "coverageCalculated"
  | "tokenPrepared"
  | "contractRegisteredOnChain"
  | "contractVerifiedOnChain"
  | "poolCreatedOnChain"
  | "contractAllocatedOnChain"
  | "coverageSnapshotAnchored";

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventKey: AuditEventKey;
  relatedEntityType?: string;
  relatedEntityId?: string;
  source?: AuditEventSource;
  displayStatus?: AuditDisplayStatus;
  reference?: string;
}

export interface DashboardMetrics {
  digitalContracts: number;
  verifiedOnChainContracts: number;
  contractPools: number;
  contractVolumeTonnes: number;
  grossPoolVolumeTonnes: number;
  eligibleCoverageTonnes: number;
  tokenizedVolumeTonnes: number;
  tokenIssuanceStarted: boolean;
  activeFinancing: Money;
  averageCoverageRatioPercent: number | null;
}

export interface SystemOverview {
  contracts: number;
  pools: number;
  tokenSeries: number;
  participants: number;
  blockedParticipants: number;
  coverageAlerts: number;
}

export type ScasAttestationKind =
  | "fieldContour"
  | "satellite"
  | "soilMoisture"
  | "producerScore"
  | "poolLock"
  | "coverageSnapshot";

export type ScasSubjectType = "contract" | "pool" | "producer";

export type ScasAttestationStatus =
  | "PENDING_ATTESTATION"
  | "ATTESTED"
  | "REJECTED";

export interface ScasAttestation {
  id: string;
  kind: ScasAttestationKind;
  subjectType: ScasSubjectType;
  subjectId: string;
  status: ScasAttestationStatus;
  evidenceKey: string;
  attestedAt?: string;
  operatorNote?: string;
}

export type ScasListingSide = "OFFER" | "DEMAND";

export type ScasListingStatus = "OPEN" | "MATCHED" | "CLOSED";

export type ScasBidStatus = "OPEN" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

export type ScasActorRole = "issuer" | "producer";

export interface ScasThreadMessage {
  id: string;
  authorId: string;
  bodyKey?: string;
  body?: string;
  at: string;
}

export interface ScasListing {
  id: string;
  side: ScasListingSide;
  ownerId: string;
  crop: string;
  quality: string;
  season: number;
  volumeTonnes: number;
  region: string;
  relatedContractId?: string;
  deliveryPeriod: string;
  indicativePriceKztPerTonne: number;
  status: ScasListingStatus;
  termsKey: string;
}

export interface ScasBid {
  id: string;
  listingId: string;
  bidderId: string;
  volumeTonnes: number;
  priceKztPerTonne: number;
  deliveryPeriod: string;
  status: ScasBidStatus;
  messages: ScasThreadMessage[];
  resultingContractId?: string;
}

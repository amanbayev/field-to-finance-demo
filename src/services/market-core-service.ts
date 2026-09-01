import {
  ADMISSION_STAGES,
  canReceive,
  canTrade,
  currentVersionForProtocol,
  eligibilityFor,
  explainEligibility,
  explainOnboardingMarketReadiness,
  protocolVersionSummary,
  resolveGoverningProtocolVersion,
  resolveProtocolVersionContext,
  validateEligibilityAssessmentRegistry,
  type AdmissionStage,
  type AssetProtocol,
  type EligibilityExplanation,
  type MarketInstrument,
  type MarketParticipantRecord,
  type ProtocolVersion,
  type ProtocolVersionContext,
  type ProtocolVersionRegistries,
} from "@/domain/market-core";
import {
  assetProtocols,
  distributionChannels,
  eligibilityAssessments,
  eligibilityMatrix,
  futureCustodyAdapters,
  futureSettlementAdapters,
  holdings,
  instrumentById,
  instrumentsForProtocol,
  marketForInstrument,
  marketInstruments,
  marketParticipants,
  markets,
  protocolById,
  protocolVehicles,
  protocolVersions,
  settlements,
  shippedEligibilityRegistryInput,
  trades,
  versionById,
  versionsForProtocol,
  wheatAdmissionProgress,
  WHEAT_INSTRUMENT_ID,
} from "@/data/market-core/catalog";

export function listAssetProtocols(): AssetProtocol[] {
  return assetProtocols;
}

export function getAssetProtocol(id: string): AssetProtocol | undefined {
  return protocolById(id);
}

/**
 * The canonical registry. Readonly at compile time and deeply frozen at
 * runtime: callers can read versions but cannot mutate the registry or any
 * record in it.
 */
export function listProtocolVersions(): readonly ProtocolVersion[] {
  return protocolVersions;
}

export function getProtocolVersion(id: string): ProtocolVersion | undefined {
  return versionById(id);
}

/**
 * The protocol's current version, for discovery only. Never use this to resolve
 * the rules of an already-issued instrument.
 */
export function getCurrentProtocolVersion(protocolId: string): ProtocolVersion | null {
  const protocol = protocolById(protocolId);
  if (!protocol) {
    return null;
  }
  return currentVersionForProtocol(protocolVersions, protocol);
}

/** Canonical registries for protocol-version resolution. */
function canonicalRegistries(): ProtocolVersionRegistries {
  return {
    protocols: assetProtocols,
    versions: protocolVersions,
    instruments: marketInstruments,
  };
}

/**
 * Thin wrapper: the resolution rules live in the pure, injectable
 * `resolveProtocolVersionContext`, which tests exercise directly against
 * non-agriculture registries.
 */
export function getProtocolVersionContext(
  protocolId: string,
  versionId: string,
): ProtocolVersionContext | null {
  return resolveProtocolVersionContext(canonicalRegistries(), protocolId, versionId);
}

/**
 * Every protocol with all its recorded versions and its current usable version.
 *
 * `versions` is separate from `currentVersion` on purpose: a protocol whose
 * only recorded versions are DRAFT, SUPERSEDED, RETIRED or unfrozen still has
 * recorded versions, and must not be shown as having none.
 */
export function listProtocolVersionSummaries(): Array<{
  protocol: AssetProtocol;
  versions: readonly ProtocolVersion[];
  currentVersion: ProtocolVersion | null;
}> {
  return assetProtocols.map((protocol) =>
    protocolVersionSummary(protocolVersions, protocol),
  );
}

export function listAssetProtocolsWithCurrentVersion(): Array<{
  protocol: AssetProtocol;
  currentVersion: ProtocolVersion | null;
}> {
  return assetProtocols.map((protocol) => ({
    protocol,
    currentVersion: currentVersionForProtocol(protocolVersions, protocol),
  }));
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
    currentVersion: currentVersionForProtocol(protocolVersions, protocol),
    versions: versionsForProtocol(protocolId),
  };
}

export function getInstrumentMarketContext(instrumentId: string) {
  const instrument = instrumentById(instrumentId);
  if (!instrument) {
    return null;
  }
  const protocol = protocolById(instrument.assetProtocolId) ?? null;
  const market = marketForInstrument(instrument.id) ?? null;
  // Resolved from the instrument's own permanent binding, never from the
  // protocol's mutable currentVersionId.
  const protocolVersion = resolveGoverningProtocolVersion(instrument, protocolVersions);
  return { instrument, protocol, market, protocolVersion };
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

export function listEligibilityAssessments() {
  return eligibilityAssessments;
}

export function listMarketParticipants(): readonly MarketParticipantRecord[] {
  return marketParticipants;
}

export function explainInstrumentEligibility(
  participantReference: string,
  instrumentId: string,
): EligibilityExplanation {
  const registry = shippedEligibilityRegistryInput();
  return explainEligibility({
    participantReference,
    instrumentId,
    eligibility: registry.eligibility,
    assessments: registry.assessments,
    participants: registry.participants,
    instruments: registry.instruments,
    organizations: registry.organizations,
    memberships: registry.memberships,
  });
}

export interface InstrumentEligibilityReadModelRow {
  readonly participantReference: string;
  readonly participantName: string;
  readonly instrumentId: string;
  readonly instrumentSymbol: string | null;
  readonly instrumentHref: string | null;
  readonly placeholderInstrument: boolean;
  readonly organizationName: string | null;
  readonly explanation: EligibilityExplanation;
  readonly canTrade: boolean;
  readonly canReceive: boolean;
}

/**
 * Read-only participant × instrument eligibility for operator screens.
 * Delegates reasoning to `explainEligibility`; does not persist assessments.
 */
export function listInstrumentEligibilityReadModel(): readonly InstrumentEligibilityReadModelRow[] {
  const registry = shippedEligibilityRegistryInput();
  return listEligibility().map((row) => {
    const explanation = explainInstrumentEligibility(
      row.participantReference,
      row.instrumentId,
    );
    const instrument = getMarketInstrument(row.instrumentId);
    const organization = explanation.organizationId
      ? registry.organizations.find((item) => item.id === explanation.organizationId)
      : undefined;
    const decision = tradeDecision(row.participantReference, row.instrumentId);
    return {
      participantReference: row.participantReference,
      participantName: row.participantName,
      instrumentId: row.instrumentId,
      instrumentSymbol: instrument?.symbol ?? null,
      instrumentHref: instrument ? `/instruments/${instrument.id}` : null,
      placeholderInstrument: !instrument,
      organizationName: organization?.name ?? null,
      explanation,
      canTrade: decision.canTrade,
      canReceive: decision.canReceive,
    };
  });
}

export function explainOnboardingMarketReadinessForOrganization(
  organizationId: string,
  instrumentId: string = WHEAT_INSTRUMENT_ID,
) {
  const registry = shippedEligibilityRegistryInput();
  return explainOnboardingMarketReadiness({
    organizationId,
    instrumentId,
    organizations: registry.organizations,
    memberships: registry.memberships,
    participants: registry.participants,
    assessments: registry.assessments,
    eligibility: registry.eligibility,
    instruments: registry.instruments,
  });
}

export function shippedEligibilityRegistryViolations() {
  return validateEligibilityAssessmentRegistry(shippedEligibilityRegistryInput());
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
    protocolVersions,
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

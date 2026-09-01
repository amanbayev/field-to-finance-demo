import type {
  ActorContext,
  MembershipRecord,
  OrganizationRecord,
  PlatformRoleId,
} from "@/domain/identity";
import type {
  AssessedEligibilityState,
  AssessedParticipantInstrumentEligibility,
  EligibilityReasonCode,
  InstrumentEligibilityState,
  MarketInstrument,
  MarketParticipantRecord,
  ParticipantInstrumentEligibility,
} from "./types";
import { ASSESSED_ELIGIBILITY_STATES, ELIGIBILITY_REASON_CODES } from "./types";
import { eligibilityFor } from "./eligibility";
import { participantIdForOrganizationSlug } from "./participants";

export type EligibilityAssessmentId = string;

export const ELIGIBILITY_ASSESSMENT_AUTHORITY_ROLE: PlatformRoleId =
  "COMPLIANCE_OFFICER";

export interface EligibilityAttribution {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly assessmentId: EligibilityAssessmentId;
  readonly reasonCode: EligibilityReasonCode;
}

export interface EligibilityAssessment {
  readonly id: EligibilityAssessmentId;
  readonly participantReference: string;
  readonly instrumentId: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly authorityRole: PlatformRoleId;
  readonly state: InstrumentEligibilityState;
  readonly reasonCode: EligibilityReasonCode;
  readonly evidenceRefs: readonly string[];
  readonly recordedAt: string | null;
}

export const ELIGIBILITY_REGISTRY_VIOLATIONS = [
  "DUPLICATE_ASSESSMENT_ID",
  "DUPLICATE_ASSESSMENT_PARTICIPANT_INSTRUMENT",
  "PARTICIPANT_NOT_FOUND",
  "INSTRUMENT_NOT_FOUND",
  "INSTRUMENT_NOT_ISSUED_OR_ADMITTED",
  "PLACEHOLDER_INSTRUMENT_REJECTED",
  "ORGANIZATION_NOT_FOUND",
  "MEMBERSHIP_NOT_FOUND",
  "MEMBERSHIP_ORGANIZATION_MISMATCH",
  "PARTICIPANT_ORGANIZATION_MISMATCH",
  "ELIGIBILITY_ASSESSMENT_NOT_FOUND",
  "ELIGIBILITY_ASSESSMENT_PAIR_MISMATCH",
  "ELIGIBILITY_ASSESSMENT_STATE_MISMATCH",
  "ELIGIBILITY_REASON_CODE_MISMATCH",
  "AUTHORITY_ROLE_NOT_ALLOWED",
  "MISSING_REASON_CODE",
  "ASSESSED_DECISION_MISSING_ATTRIBUTION",
  "PLACEHOLDER_PARTICIPANT_ASSESSED",
] as const;

export type EligibilityRegistryViolationCode =
  (typeof ELIGIBILITY_REGISTRY_VIOLATIONS)[number];

export interface EligibilityRegistryViolation {
  readonly code: EligibilityRegistryViolationCode;
  readonly assessmentId?: string;
  readonly participantReference?: string;
  readonly instrumentId?: string;
}

export interface EligibilityRegistryInput {
  readonly assessments: readonly EligibilityAssessment[];
  readonly eligibility: readonly ParticipantInstrumentEligibility[];
  readonly participants: readonly MarketParticipantRecord[];
  readonly instruments: readonly MarketInstrument[];
  readonly organizations: readonly OrganizationRecord[];
  readonly memberships: readonly MembershipRecord[];
}

export const ELIGIBILITY_EXPLANATION_GAPS = [
  "PARTICIPANT_MISSING",
  "INSTRUMENT_MISSING",
  "ORGANIZATION_MISSING",
  "MEMBERSHIP_MISSING",
  "ASSESSMENT_MISSING",
  "ATTRIBUTION_INCOMPLETE",
  "PLACEHOLDER_PARTICIPANT",
  "PLACEHOLDER_INSTRUMENT",
] as const;

export type EligibilityExplanationGap = (typeof ELIGIBILITY_EXPLANATION_GAPS)[number];

export const ELIGIBILITY_EXPLANATION_INCONSISTENCIES = [
  "WRONG_ORGANIZATION",
  "ASSESSMENT_STATE_MISMATCH",
  "ASSESSMENT_PAIR_MISMATCH",
  "REASON_CODE_MISMATCH",
  "AUTHORITY_ROLE_NOT_ALLOWED",
] as const;

export type EligibilityExplanationInconsistency =
  (typeof ELIGIBILITY_EXPLANATION_INCONSISTENCIES)[number];

export interface EligibilityExplanation {
  readonly participantReference: string;
  readonly instrumentId: string;
  readonly state: InstrumentEligibilityState;
  readonly organizationId: string | null;
  readonly membershipId: string | null;
  readonly assessmentId: EligibilityAssessmentId | null;
  readonly authorityRole: PlatformRoleId | null;
  readonly reasonCode: EligibilityReasonCode | null;
  readonly evidenceRefs: readonly string[];
  readonly recordedAt: string | null;
  readonly missing: readonly EligibilityExplanationGap[];
  readonly inconsistencies: readonly EligibilityExplanationInconsistency[];
  readonly attributionComplete: boolean;
}

export interface EligibilityExplanationInput {
  readonly participantReference: string;
  readonly instrumentId: string;
  readonly eligibility: readonly ParticipantInstrumentEligibility[];
  readonly assessments: readonly EligibilityAssessment[];
  readonly participants: readonly MarketParticipantRecord[];
  readonly instruments: readonly MarketInstrument[];
  readonly organizations: readonly OrganizationRecord[];
  readonly memberships: readonly MembershipRecord[];
  readonly actorOrganizationId?: string | null;
  readonly actorMembershipId?: string | null;
}

function isAssessedState(state: InstrumentEligibilityState): state is AssessedEligibilityState {
  return (ASSESSED_ELIGIBILITY_STATES as readonly string[]).includes(state);
}

function isEligibilityReasonCode(value: string | undefined): value is EligibilityReasonCode {
  return (
    typeof value === "string" &&
    (ELIGIBILITY_REASON_CODES as readonly string[]).includes(value)
  );
}

export function isAssessedEligibilityDecision(
  row: ParticipantInstrumentEligibility,
): row is AssessedParticipantInstrumentEligibility {
  return (
    isAssessedState(row.state) &&
    typeof row.organizationId === "string" &&
    row.organizationId.length > 0 &&
    typeof row.membershipId === "string" &&
    row.membershipId.length > 0 &&
    typeof row.assessmentId === "string" &&
    row.assessmentId.length > 0 &&
    isEligibilityReasonCode(row.reasonCode)
  );
}

/**
 * Returns a frozen copy of an assessment. Evidence refs are copied before
 * freezing so a shared source array is never frozen as a side effect.
 */
export function freezeEligibilityAssessment(
  assessment: EligibilityAssessment,
): EligibilityAssessment {
  return Object.freeze({
    ...assessment,
    evidenceRefs: Object.freeze([...assessment.evidenceRefs]),
  });
}

export function freezeEligibilityAssessmentRegistry(
  assessments: readonly EligibilityAssessment[],
): readonly EligibilityAssessment[] {
  return Object.freeze(assessments.map(freezeEligibilityAssessment));
}

export function freezeMarketParticipant(
  participant: MarketParticipantRecord,
): MarketParticipantRecord {
  return Object.freeze({ ...participant });
}

export function freezeMarketParticipantRegistry(
  participants: readonly MarketParticipantRecord[],
): readonly MarketParticipantRecord[] {
  return Object.freeze(participants.map(freezeMarketParticipant));
}

export function freezeParticipantInstrumentEligibility(
  row: ParticipantInstrumentEligibility,
): ParticipantInstrumentEligibility {
  return Object.freeze({ ...row });
}

export function freezeEligibilityMatrix(
  rows: readonly ParticipantInstrumentEligibility[],
): readonly ParticipantInstrumentEligibility[] {
  return Object.freeze(rows.map(freezeParticipantInstrumentEligibility));
}

export function organizationParticipantReference(
  organization: OrganizationRecord,
): string | null {
  if (organization.externalInvestorRef) {
    return organization.externalInvestorRef;
  }
  return participantIdForOrganizationSlug(organization.slug);
}

export function organizationOwnsParticipant(
  organization: OrganizationRecord,
  participantReference: string,
): boolean {
  return organizationParticipantReference(organization) === participantReference;
}

function findById<T extends { id: string }>(
  items: readonly T[],
  id: string,
): T | undefined {
  return items.find((item) => item.id === id);
}

export function validateEligibilityAssessmentRegistry(
  input: EligibilityRegistryInput,
): readonly EligibilityRegistryViolation[] {
  const violations: EligibilityRegistryViolation[] = [];
  const assessmentIds = new Set<string>();
  const assessmentPairs = new Set<string>();

  for (const assessment of input.assessments) {
    if (assessmentIds.has(assessment.id)) {
      violations.push({
        code: "DUPLICATE_ASSESSMENT_ID",
        assessmentId: assessment.id,
      });
    }
    assessmentIds.add(assessment.id);

    const pairKey = `${assessment.participantReference}::${assessment.instrumentId}`;
    if (assessmentPairs.has(pairKey)) {
      violations.push({
        code: "DUPLICATE_ASSESSMENT_PARTICIPANT_INSTRUMENT",
        assessmentId: assessment.id,
        participantReference: assessment.participantReference,
        instrumentId: assessment.instrumentId,
      });
    }
    assessmentPairs.add(pairKey);

    const participant = input.participants.find(
      (item) => item.participantReference === assessment.participantReference,
    );
    if (!participant) {
      violations.push({
        code: "PARTICIPANT_NOT_FOUND",
        assessmentId: assessment.id,
        participantReference: assessment.participantReference,
      });
    } else if (participant.kind === "PLACEHOLDER") {
      violations.push({
        code: "PLACEHOLDER_PARTICIPANT_ASSESSED",
        assessmentId: assessment.id,
        participantReference: assessment.participantReference,
      });
    }

    if (assessment.instrumentId === "WATER-FUTURE") {
      violations.push({
        code: "PLACEHOLDER_INSTRUMENT_REJECTED",
        assessmentId: assessment.id,
        instrumentId: assessment.instrumentId,
      });
    }

    const instrument = input.instruments.find((item) => item.id === assessment.instrumentId);
    if (!instrument) {
      violations.push({
        code: "INSTRUMENT_NOT_FOUND",
        assessmentId: assessment.id,
        instrumentId: assessment.instrumentId,
      });
    } else if (
      assessment.state === "ELIGIBLE" &&
      instrument.status !== "ISSUED" &&
      instrument.status !== "ADMITTED"
    ) {
      violations.push({
        code: "INSTRUMENT_NOT_ISSUED_OR_ADMITTED",
        assessmentId: assessment.id,
        instrumentId: assessment.instrumentId,
      });
    }

    const organization = findById(input.organizations, assessment.organizationId);
    if (!organization) {
      violations.push({
        code: "ORGANIZATION_NOT_FOUND",
        assessmentId: assessment.id,
      });
    } else if (
      participant &&
      participant.kind === "ORGANIZATION" &&
      !organizationOwnsParticipant(organization, assessment.participantReference)
    ) {
      violations.push({
        code: "PARTICIPANT_ORGANIZATION_MISMATCH",
        assessmentId: assessment.id,
        participantReference: assessment.participantReference,
      });
    }

    const membership = findById(input.memberships, assessment.membershipId);
    if (!membership) {
      violations.push({
        code: "MEMBERSHIP_NOT_FOUND",
        assessmentId: assessment.id,
      });
    } else if (membership.organizationId !== assessment.organizationId) {
      violations.push({
        code: "MEMBERSHIP_ORGANIZATION_MISMATCH",
        assessmentId: assessment.id,
      });
    }

    if (assessment.authorityRole !== ELIGIBILITY_ASSESSMENT_AUTHORITY_ROLE) {
      violations.push({
        code: "AUTHORITY_ROLE_NOT_ALLOWED",
        assessmentId: assessment.id,
      });
    }

    if (
      isAssessedState(assessment.state) &&
      !isEligibilityReasonCode(assessment.reasonCode)
    ) {
      violations.push({
        code: "MISSING_REASON_CODE",
        assessmentId: assessment.id,
      });
    }
  }

  for (const row of input.eligibility) {
    if (!isAssessedState(row.state)) {
      continue;
    }
    if (!isAssessedEligibilityDecision(row)) {
      violations.push({
        code: "ASSESSED_DECISION_MISSING_ATTRIBUTION",
        participantReference: row.participantReference,
        instrumentId: row.instrumentId,
      });
      continue;
    }

    const assessment = findById(input.assessments, row.assessmentId);
    if (!assessment) {
      violations.push({
        code: "ELIGIBILITY_ASSESSMENT_NOT_FOUND",
        participantReference: row.participantReference,
        instrumentId: row.instrumentId,
        assessmentId: row.assessmentId,
      });
      continue;
    }
    if (
      assessment.participantReference !== row.participantReference ||
      assessment.instrumentId !== row.instrumentId
    ) {
      violations.push({
        code: "ELIGIBILITY_ASSESSMENT_PAIR_MISMATCH",
        assessmentId: assessment.id,
        participantReference: row.participantReference,
        instrumentId: row.instrumentId,
      });
    }
    if (assessment.state !== row.state) {
      violations.push({
        code: "ELIGIBILITY_ASSESSMENT_STATE_MISMATCH",
        assessmentId: assessment.id,
        participantReference: row.participantReference,
        instrumentId: row.instrumentId,
      });
    }
    if (assessment.reasonCode !== row.reasonCode) {
      violations.push({
        code: "ELIGIBILITY_REASON_CODE_MISMATCH",
        assessmentId: assessment.id,
        participantReference: row.participantReference,
        instrumentId: row.instrumentId,
      });
    }
  }

  return violations;
}

export function assertEligibilityAssessmentRegistry(
  input: EligibilityRegistryInput,
): void {
  const violations = validateEligibilityAssessmentRegistry(input);
  if (violations.length > 0) {
    throw new Error(
      `eligibility_assessment_registry_invalid:${violations.map((item) => item.code).join(",")}`,
    );
  }
}

function pushGap(
  gaps: EligibilityExplanationGap[],
  code: EligibilityExplanationGap,
): void {
  if (!gaps.includes(code)) {
    gaps.push(code);
  }
}

function pushInconsistency(
  items: EligibilityExplanationInconsistency[],
  code: EligibilityExplanationInconsistency,
): void {
  if (!items.includes(code)) {
    items.push(code);
  }
}

/**
 * Pure explainability selector for participant × instrument eligibility.
 * Missing rows resolve to NOT_ASSESSED without fabricating an assessment.
 * Domain codes only — no localized UI copy.
 */
export function explainEligibility(
  input: EligibilityExplanationInput,
): EligibilityExplanation {
  const missing: EligibilityExplanationGap[] = [];
  const inconsistencies: EligibilityExplanationInconsistency[] = [];
  const row = input.eligibility.find(
    (item) =>
      item.participantReference === input.participantReference &&
      item.instrumentId === input.instrumentId,
  );
  const state: InstrumentEligibilityState = row
    ? row.state
    : eligibilityFor(input.eligibility, input.participantReference, input.instrumentId);

  const participant = input.participants.find(
    (item) => item.participantReference === input.participantReference,
  );
  if (!participant) {
    pushGap(missing, "PARTICIPANT_MISSING");
  } else if (participant.kind === "PLACEHOLDER") {
    pushGap(missing, "PLACEHOLDER_PARTICIPANT");
  }

  const instrumentExists = input.instruments.some((item) => item.id === input.instrumentId);
  if (input.instrumentId === "WATER-FUTURE" || !instrumentExists) {
    pushGap(missing, "PLACEHOLDER_INSTRUMENT");
    if (!instrumentExists) {
      pushGap(missing, "INSTRUMENT_MISSING");
    }
  }

  const assessment =
    row?.assessmentId != null
      ? findById(input.assessments, row.assessmentId)
      : input.assessments.find(
          (item) =>
            item.participantReference === input.participantReference &&
            item.instrumentId === input.instrumentId,
        );

  if (!assessment) {
    pushGap(missing, "ASSESSMENT_MISSING");
  }

  const organizationId =
    assessment?.organizationId ??
    row?.organizationId ??
    participant?.organizationId ??
    null;
  if (!organizationId) {
    pushGap(missing, "ORGANIZATION_MISSING");
  } else if (!findById(input.organizations, organizationId)) {
    pushGap(missing, "ORGANIZATION_MISSING");
  }

  const membershipId = assessment?.membershipId ?? row?.membershipId ?? null;
  if (!membershipId) {
    pushGap(missing, "MEMBERSHIP_MISSING");
  } else if (!findById(input.memberships, membershipId)) {
    pushGap(missing, "MEMBERSHIP_MISSING");
  }

  if (assessment) {
    if (
      assessment.participantReference !== input.participantReference ||
      assessment.instrumentId !== input.instrumentId
    ) {
      pushInconsistency(inconsistencies, "ASSESSMENT_PAIR_MISMATCH");
    }
    if (assessment.state !== state) {
      pushInconsistency(inconsistencies, "ASSESSMENT_STATE_MISMATCH");
    }
    if (row?.reasonCode && assessment.reasonCode !== row.reasonCode) {
      pushInconsistency(inconsistencies, "REASON_CODE_MISMATCH");
    }
    if (assessment.authorityRole !== ELIGIBILITY_ASSESSMENT_AUTHORITY_ROLE) {
      pushInconsistency(inconsistencies, "AUTHORITY_ROLE_NOT_ALLOWED");
    }
  }

  if (
    input.actorOrganizationId != null &&
    organizationId != null &&
    input.actorOrganizationId !== organizationId
  ) {
    pushInconsistency(inconsistencies, "WRONG_ORGANIZATION");
  }

  if (input.actorMembershipId != null) {
    const actorMembership = findById(input.memberships, input.actorMembershipId);
    if (!actorMembership) {
      pushGap(missing, "MEMBERSHIP_MISSING");
    } else if (organizationId != null && actorMembership.organizationId !== organizationId) {
      pushInconsistency(inconsistencies, "WRONG_ORGANIZATION");
    }
  } else if (input.actorOrganizationId != null) {
    pushGap(missing, "MEMBERSHIP_MISSING");
  }

  const attributionFieldsPresent =
    organizationId != null &&
    membershipId != null &&
    assessment != null &&
    isEligibilityReasonCode(assessment.reasonCode);
  if (!attributionFieldsPresent) {
    pushGap(missing, "ATTRIBUTION_INCOMPLETE");
  }

  const attributionComplete =
    attributionFieldsPresent &&
    missing.length === 0 &&
    inconsistencies.length === 0 &&
    isAssessedState(state);

  return {
    participantReference: input.participantReference,
    instrumentId: input.instrumentId,
    state,
    organizationId,
    membershipId,
    assessmentId: assessment?.id ?? null,
    authorityRole: assessment?.authorityRole ?? null,
    reasonCode: assessment?.reasonCode ?? null,
    evidenceRefs: assessment ? Object.freeze([...assessment.evidenceRefs]) : Object.freeze([]),
    recordedAt: assessment?.recordedAt ?? null,
    missing: Object.freeze([...missing]),
    inconsistencies: Object.freeze([...inconsistencies]),
    attributionComplete,
  };
}

export function explainActorEligibility(
  actor: ActorContext,
  input: Omit<EligibilityExplanationInput, "actorOrganizationId" | "actorMembershipId">,
): EligibilityExplanation {
  return explainEligibility({
    ...input,
    actorOrganizationId: actor.effective.organization?.id ?? null,
    actorMembershipId: actor.effective.membershipId ?? null,
  });
}

/**
 * Onboarding approval creates organisation membership and roles only.
 * This selector reports what is still missing for market eligibility;
 * it does not insert a decision.
 */
export function explainOnboardingMarketReadiness(input: {
  organizationId: string;
  instrumentId: string;
  organizations: readonly OrganizationRecord[];
  memberships: readonly MembershipRecord[];
  participants: readonly MarketParticipantRecord[];
  assessments: readonly EligibilityAssessment[];
  eligibility: readonly ParticipantInstrumentEligibility[];
  instruments: readonly MarketInstrument[];
}): {
  readonly hasOrganization: boolean;
  readonly hasMembership: boolean;
  readonly hasParticipant: boolean;
  readonly hasAssessment: boolean;
  readonly eligibilityState: InstrumentEligibilityState;
} {
  const organization = findById(input.organizations, input.organizationId);
  const hasOrganization = Boolean(organization);
  const hasMembership = input.memberships.some(
    (item) => item.organizationId === input.organizationId && item.status === "ACTIVE",
  );
  const participantReference = organization
    ? organizationParticipantReference(organization)
    : null;
  const participant = participantReference
    ? input.participants.find(
        (item) =>
          item.participantReference === participantReference && item.kind === "ORGANIZATION",
      )
    : undefined;
  const hasParticipant = Boolean(participant);
  const hasAssessment = Boolean(
    participant &&
      input.assessments.some(
        (item) =>
          item.participantReference === participant.participantReference &&
          item.instrumentId === input.instrumentId,
      ),
  );
  const eligibilityState = participant
    ? eligibilityFor(input.eligibility, participant.participantReference, input.instrumentId)
    : "NOT_ASSESSED";
  return {
    hasOrganization,
    hasMembership,
    hasParticipant,
    hasAssessment,
    eligibilityState,
  };
}

export function explanationAllowsTrade(explanation: EligibilityExplanation): boolean {
  if (
    explanation.state === "NOT_ASSESSED" ||
    explanation.state === "POLICY_PENDING" ||
    explanation.state === "NOT_ELIGIBLE"
  ) {
    return false;
  }
  return (
    explanation.state === "ELIGIBLE" &&
    explanation.attributionComplete &&
    explanation.inconsistencies.length === 0
  );
}

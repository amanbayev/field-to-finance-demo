import type { OrganizationType } from "@/domain/identity";
import {
  ELIGIBILITY_EXPLANATION_GAPS,
  ELIGIBILITY_EXPLANATION_INCONSISTENCIES,
  ELIGIBILITY_REASON_CODES,
  ELIGIBILITY_STATES,
  explanationAllowsTrade,
  type EligibilityExplanation,
  type EligibilityExplanationGap,
  type EligibilityExplanationInconsistency,
  type EligibilityReasonCode,
  type InstrumentEligibilityState,
} from "@/domain/market-core";

type OnboardingMarketReadiness = {
  readonly hasOrganization: boolean;
  readonly hasMembership: boolean;
  readonly hasParticipant: boolean;
  readonly hasAssessment: boolean;
  readonly eligibilityState: InstrumentEligibilityState;
};

/**
 * Localized presentation of an existing 5C.3A eligibility explanation.
 * Helpers return message keys or typed descriptors. They do not recalculate
 * eligibility, invent attribution, or emit raw domain codes as UI text.
 */
export const ELIGIBILITY_STATE_LABEL_KEYS = {
  ELIGIBLE: "stateEligible",
  NOT_ELIGIBLE: "stateNotEligible",
  NOT_ASSESSED: "stateNotAssessed",
  POLICY_PENDING: "statePolicyPending",
} as const satisfies Record<InstrumentEligibilityState, string>;

export const ELIGIBILITY_GAP_KEYS = {
  PARTICIPANT_MISSING: "gapParticipantMissing",
  INSTRUMENT_MISSING: "gapInstrumentMissing",
  ORGANIZATION_MISSING: "gapOrganizationMissing",
  MEMBERSHIP_MISSING: "gapMembershipMissing",
  ASSESSMENT_MISSING: "gapAssessmentMissing",
  ATTRIBUTION_INCOMPLETE: "gapAttributionIncomplete",
  PLACEHOLDER_PARTICIPANT: "gapPlaceholderParticipant",
  PLACEHOLDER_INSTRUMENT: "gapPlaceholderInstrument",
} as const satisfies Record<EligibilityExplanationGap, string>;

export const ELIGIBILITY_INCONSISTENCY_KEYS = {
  WRONG_ORGANIZATION: "inconsistencyWrongOrganization",
  ASSESSMENT_STATE_MISMATCH: "inconsistencyAssessmentStateMismatch",
  ASSESSMENT_PAIR_MISMATCH: "inconsistencyAssessmentPairMismatch",
  REASON_CODE_MISMATCH: "inconsistencyReasonCodeMismatch",
  AUTHORITY_ROLE_NOT_ALLOWED: "inconsistencyAuthorityRoleNotAllowed",
} as const satisfies Record<EligibilityExplanationInconsistency, string>;

export const ELIGIBILITY_REASON_KEYS = {
  DEMO_RECORDED_ELIGIBLE: "reasonRecordedEligible",
  DEMO_RECORDED_NOT_ELIGIBLE: "reasonRecordedNotEligible",
} as const satisfies Record<EligibilityReasonCode, string>;

export const ELIGIBILITY_UNAVAILABLE_KEY = "summaryUnavailable";
export const ELIGIBILITY_INCONSISTENT_KEY = "summaryInconsistent";
export const ELIGIBILITY_INCOMPLETE_KEY = "summaryAttributionIncomplete";
export const DATE_NOT_CLAIMED_KEY = "dateNotClaimed";
export const NO_EVIDENCE_REFERENCES_KEY = "noEvidenceReferencesRecorded";
export const EVIDENCE_REFERENCES_RECORDED_KEY = "evidenceReferencesRecorded";
export const AUTHORITY_COMPLIANCE_OFFICER_KEY = "authorityComplianceOfficer";
export const AUTHORITY_UNAVAILABLE_KEY = "authorityUnavailable";

export const ORGANIZATION_TYPE_LABEL_KEYS = {
  PLATFORM: "orgTypePlatform",
  REGULATOR: "orgTypeRegulator",
  REGISTRAR: "orgTypeRegistrar",
  SCAS: "orgTypeScas",
  PRODUCER: "orgTypeProducer",
  ISSUER: "orgTypeIssuer",
  INVESTMENT_FUND: "orgTypeInvestmentFund",
  TRADING_FIRM: "orgTypeTradingFirm",
  COMPLIANCE_PROVIDER: "orgTypeComplianceProvider",
} as const satisfies Record<OrganizationType, string>;

export function organizationTypeLabelKey(type: OrganizationType): string {
  return ORGANIZATION_TYPE_LABEL_KEYS[type] ?? ELIGIBILITY_UNAVAILABLE_KEY;
}

export type EligibilityStateTone =
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "NOT_ASSESSED"
  | "POLICY_PENDING";

export type NewOrderAdmissionKind =
  | "ALLOWED"
  | "NOT_ASSESSED"
  | "POLICY_PENDING"
  | "NOT_ELIGIBLE"
  | "ATTRIBUTION_INCOMPLETE"
  | "INCONSISTENT"
  | "NO_PARTICIPANT"
  | "UNAVAILABLE";

export interface EligibilityPresentation {
  readonly state: InstrumentEligibilityState;
  readonly stateKey: (typeof ELIGIBILITY_STATE_LABEL_KEYS)[InstrumentEligibilityState];
  readonly tone: EligibilityStateTone;
  readonly summaryKey: string;
  readonly assessed: boolean;
  readonly assessmentRecorded: boolean;
  readonly organizationRecorded: boolean;
  readonly membershipRecorded: boolean;
  readonly attributionComplete: boolean;
  readonly allowsNewOrders: boolean;
  readonly authorityKey: string | null;
  readonly reasonKey: string | null;
  readonly recordedAtKey: string | null;
  readonly recordedAt: string | null;
  readonly evidenceKey: string;
  readonly evidenceCount: number;
  readonly gapKeys: readonly string[];
  readonly inconsistencyKeys: readonly string[];
  readonly failClosedKey: string | null;
}

export interface NewOrderAdmissionPresentation {
  readonly kind: NewOrderAdmissionKind;
  readonly summaryKey: string;
  readonly stateKey: string | null;
}

export interface OnboardingReadinessPresentation {
  readonly hasOrganization: boolean;
  readonly hasMembership: boolean;
  readonly hasParticipant: boolean;
  readonly hasAssessment: boolean;
  readonly eligibilityStateKey: string;
  readonly eligibilityTone: EligibilityStateTone;
  readonly onboardingDoesNotGrantEligibilityKey: "onboardingDoesNotGrantEligibility";
}

function isEligibilityState(value: string): value is InstrumentEligibilityState {
  return (ELIGIBILITY_STATES as readonly string[]).includes(value);
}

function isEligibilityReasonCode(value: string): value is EligibilityReasonCode {
  return (ELIGIBILITY_REASON_CODES as readonly string[]).includes(value);
}

function isEligibilityGap(value: string): value is EligibilityExplanationGap {
  return (ELIGIBILITY_EXPLANATION_GAPS as readonly string[]).includes(value);
}

function isEligibilityInconsistency(
  value: string,
): value is EligibilityExplanationInconsistency {
  return (ELIGIBILITY_EXPLANATION_INCONSISTENCIES as readonly string[]).includes(value);
}

export function eligibilityStateLabelKey(state: string): string {
  if (!isEligibilityState(state)) {
    return ELIGIBILITY_UNAVAILABLE_KEY;
  }
  return ELIGIBILITY_STATE_LABEL_KEYS[state];
}

export function eligibilityStateTone(state: string): EligibilityStateTone {
  if (!isEligibilityState(state)) {
    return "NOT_ASSESSED";
  }
  return state;
}

export function eligibilityGapKey(code: EligibilityExplanationGap): string {
  if (!isEligibilityGap(code)) {
    return ELIGIBILITY_UNAVAILABLE_KEY;
  }
  return ELIGIBILITY_GAP_KEYS[code];
}

export function eligibilityInconsistencyKey(
  code: EligibilityExplanationInconsistency,
): string {
  if (!isEligibilityInconsistency(code)) {
    return ELIGIBILITY_INCONSISTENT_KEY;
  }
  return ELIGIBILITY_INCONSISTENCY_KEYS[code];
}

export function eligibilityReasonKey(code: EligibilityReasonCode | null): string | null {
  if (code == null) {
    return null;
  }
  if (!isEligibilityReasonCode(code)) {
    return ELIGIBILITY_UNAVAILABLE_KEY;
  }
  return ELIGIBILITY_REASON_KEYS[code];
}

function summaryKeyForState(state: InstrumentEligibilityState): string {
  switch (state) {
    case "ELIGIBLE":
      return "summaryEligible";
    case "NOT_ELIGIBLE":
      return "summaryNotEligible";
    case "NOT_ASSESSED":
      return "summaryNotAssessed";
    case "POLICY_PENDING":
      return "summaryPolicyPending";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/**
 * Maps a production `EligibilityExplanation` to localized presentation keys.
 * Does not invent organisation, membership, assessment, reason, evidence or date.
 */
export function presentEligibilityExplanation(
  explanation: EligibilityExplanation,
): EligibilityPresentation {
  const state = isEligibilityState(explanation.state)
    ? explanation.state
    : "NOT_ASSESSED";
  const assessed = state === "ELIGIBLE" || state === "NOT_ELIGIBLE";
  const inconsistencyKeys = explanation.inconsistencies.map(eligibilityInconsistencyKey);
  const gapKeys = explanation.missing.map(eligibilityGapKey);
  const failClosed =
    inconsistencyKeys.length > 0
      ? ELIGIBILITY_INCONSISTENT_KEY
      : !isEligibilityState(explanation.state)
        ? ELIGIBILITY_UNAVAILABLE_KEY
        : assessed && !explanation.attributionComplete
          ? ELIGIBILITY_INCOMPLETE_KEY
          : null;
  const assessmentRecorded = explanation.assessmentId != null;
  const organizationRecorded =
    explanation.organizationId != null &&
    !explanation.missing.includes("ORGANIZATION_MISSING");
  const membershipRecorded =
    explanation.membershipId != null &&
    !explanation.missing.includes("MEMBERSHIP_MISSING");

  return {
    state,
    stateKey: ELIGIBILITY_STATE_LABEL_KEYS[state],
    tone: eligibilityStateTone(state),
    summaryKey: failClosed ?? summaryKeyForState(state),
    assessed,
    assessmentRecorded,
    organizationRecorded,
    membershipRecorded,
    attributionComplete: explanation.attributionComplete,
    allowsNewOrders: explanationAllowsTrade(explanation),
    authorityKey: assessmentRecorded
      ? explanation.authorityRole === "COMPLIANCE_OFFICER"
        ? AUTHORITY_COMPLIANCE_OFFICER_KEY
        : AUTHORITY_UNAVAILABLE_KEY
      : null,
    reasonKey: assessmentRecorded ? eligibilityReasonKey(explanation.reasonCode) : null,
    recordedAtKey: explanation.recordedAt == null ? DATE_NOT_CLAIMED_KEY : null,
    recordedAt: explanation.recordedAt,
    evidenceKey:
      explanation.evidenceRefs.length > 0
        ? EVIDENCE_REFERENCES_RECORDED_KEY
        : NO_EVIDENCE_REFERENCES_KEY,
    evidenceCount: explanation.evidenceRefs.length,
    gapKeys,
    inconsistencyKeys,
    failClosedKey: failClosed,
  };
}

/**
 * Explains why new-order entry is available or unavailable from production
 * `canSubmit` plus the existing eligibility explanation. Does not re-run
 * admission policy.
 */
export function presentNewOrderAdmission(input: {
  readonly canSubmit: boolean;
  readonly hasParticipant: boolean;
  readonly explanation: EligibilityExplanation | null;
}): NewOrderAdmissionPresentation {
  if (!input.hasParticipant || input.explanation == null) {
    return {
      kind: "NO_PARTICIPANT",
      summaryKey: "summaryNoParticipant",
      stateKey: null,
    };
  }
  const presented = presentEligibilityExplanation(input.explanation);
  if (input.canSubmit) {
    return {
      kind: "ALLOWED",
      summaryKey: "summaryEligible",
      stateKey: presented.stateKey,
    };
  }
  if (presented.inconsistencyKeys.length > 0) {
    return {
      kind: "INCONSISTENT",
      summaryKey: ELIGIBILITY_INCONSISTENT_KEY,
      stateKey: presented.stateKey,
    };
  }
  if (presented.state === "NOT_ASSESSED") {
    return {
      kind: "NOT_ASSESSED",
      summaryKey: "summaryNotAssessed",
      stateKey: presented.stateKey,
    };
  }
  if (presented.state === "POLICY_PENDING") {
    return {
      kind: "POLICY_PENDING",
      summaryKey: "summaryPolicyPending",
      stateKey: presented.stateKey,
    };
  }
  if (presented.state === "NOT_ELIGIBLE") {
    return {
      kind: "NOT_ELIGIBLE",
      summaryKey: "summaryNotEligible",
      stateKey: presented.stateKey,
    };
  }
  if (!presented.attributionComplete) {
    return {
      kind: "ATTRIBUTION_INCOMPLETE",
      summaryKey: ELIGIBILITY_INCOMPLETE_KEY,
      stateKey: presented.stateKey,
    };
  }
  return {
    kind: "UNAVAILABLE",
    summaryKey: ELIGIBILITY_UNAVAILABLE_KEY,
    stateKey: presented.stateKey,
  };
}

export function allEligibilityPresentationKeys(): readonly string[] {
  return Object.freeze([
    ...Object.values(ELIGIBILITY_STATE_LABEL_KEYS),
    ...Object.values(ELIGIBILITY_GAP_KEYS),
    ...Object.values(ELIGIBILITY_INCONSISTENCY_KEYS),
    ...Object.values(ELIGIBILITY_REASON_KEYS),
    ELIGIBILITY_UNAVAILABLE_KEY,
    ELIGIBILITY_INCONSISTENT_KEY,
    ELIGIBILITY_INCOMPLETE_KEY,
    DATE_NOT_CLAIMED_KEY,
    NO_EVIDENCE_REFERENCES_KEY,
    EVIDENCE_REFERENCES_RECORDED_KEY,
    AUTHORITY_COMPLIANCE_OFFICER_KEY,
    AUTHORITY_UNAVAILABLE_KEY,
    "summaryEligible",
    "summaryNotEligible",
    "summaryNotAssessed",
    "summaryPolicyPending",
    "summaryNoParticipant",
    "organizationRecorded",
    "organizationMissing",
    "membershipRecorded",
    "membershipMissing",
    "assessmentRecorded",
    "noAssessmentRecorded",
    "attributionComplete",
    "attributionIncomplete",
    "newOrderAllowed",
    "newOrderUnavailable",
    "canReceiveAllowed",
    "canReceiveUnavailable",
    "placeholderInstrument",
    "labelNewOrderAdmission",
    "labelInstrumentEligibility",
    "labelComplianceScreening",
    "onboardingDoesNotGrantEligibility",
  ]);
}

/**
 * Attribution details are shown only when an assessment record exists.
 * Unassessed and policy-pending rows must not invent an assessment panel.
 */
export function showAssessmentAttribution(
  presented: EligibilityPresentation,
): boolean {
  return presented.assessmentRecorded;
}

export function presentOnboardingReadiness(
  readiness: OnboardingMarketReadiness,
): OnboardingReadinessPresentation {
  return {
    hasOrganization: readiness.hasOrganization,
    hasMembership: readiness.hasMembership,
    hasParticipant: readiness.hasParticipant,
    hasAssessment: readiness.hasAssessment,
    eligibilityStateKey: eligibilityStateLabelKey(readiness.eligibilityState),
    eligibilityTone: eligibilityStateTone(readiness.eligibilityState),
    onboardingDoesNotGrantEligibilityKey: "onboardingDoesNotGrantEligibility",
  };
}

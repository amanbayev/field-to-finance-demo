import { describe, expect, it } from "vitest";
import {
  ELIGIBILITY_EXPLANATION_GAPS,
  ELIGIBILITY_EXPLANATION_INCONSISTENCIES,
  ELIGIBILITY_REASON_CODES,
  ELIGIBILITY_STATES,
  explainEligibility,
  explanationAllowsTrade,
  type EligibilityExplanation,
  type EligibilityAssessment,
  type ParticipantInstrumentEligibility,
} from "@/domain/market-core";
import {
  DEMO_EAS_STEPPE_WHEAT_001,
  WHEAT_INSTRUMENT_ID,
  shippedEligibilityRegistryInput,
} from "@/data/market-core/catalog";
import { DEMO_ORGANIZATIONS, demoMembershipForPersona } from "@/data/identity/demo-catalog";
import { explainInstrumentEligibility, explainOnboardingMarketReadinessForOrganization } from "@/services/market-core-service";
import en from "../../../messages/en.json";
import ru from "../../../messages/ru.json";
import kk from "../../../messages/kk.json";
import {
  AUTHORITY_COMPLIANCE_OFFICER_KEY,
  DATE_NOT_CLAIMED_KEY,
  ELIGIBILITY_GAP_KEYS,
  ELIGIBILITY_INCOMPLETE_KEY,
  ELIGIBILITY_INCONSISTENCY_KEYS,
  ELIGIBILITY_INCONSISTENT_KEY,
  ELIGIBILITY_REASON_KEYS,
  ELIGIBILITY_STATE_LABEL_KEYS,
  ELIGIBILITY_UNAVAILABLE_KEY,
  NO_EVIDENCE_REFERENCES_KEY,
  allEligibilityPresentationKeys,
  eligibilityGapKey,
  eligibilityInconsistencyKey,
  eligibilityReasonKey,
  eligibilityStateLabelKey,
  eligibilityStateTone,
  presentEligibilityExplanation,
  presentNewOrderAdmission,
  presentOnboardingReadiness,
  showAssessmentAttribution,
  eligibilityAttributionFields,
} from "./eligibility-presentation";

const registry = shippedEligibilityRegistryInput();
const steppeOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "steppe-capital")!;
const grainOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "grain-desk")!;
const issuerOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "agro-issuer")!;
const catalogs = {
  en: en.eligibility,
  ru: ru.eligibility,
  kk: kk.eligibility,
};

function explain(
  participantReference: string,
  instrumentId: string,
  overrides: Partial<typeof registry> & {
    actorOrganizationId?: string | null;
    actorMembershipId?: string | null;
    eligibility?: readonly ParticipantInstrumentEligibility[];
    assessments?: readonly EligibilityAssessment[];
  } = {},
): EligibilityExplanation {
  return explainEligibility({
    participantReference,
    instrumentId,
    eligibility: overrides.eligibility ?? registry.eligibility,
    assessments: overrides.assessments ?? registry.assessments,
    participants: overrides.participants ?? registry.participants,
    instruments: overrides.instruments ?? registry.instruments,
    organizations: overrides.organizations ?? registry.organizations,
    memberships: overrides.memberships ?? registry.memberships,
    actorOrganizationId: overrides.actorOrganizationId,
    actorMembershipId: overrides.actorMembershipId,
  });
}

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

describe("exhaustive presentation maps", () => {
  it("maps every eligibility state without using the raw code as UI text", () => {
    for (const state of ELIGIBILITY_STATES) {
      const key = eligibilityStateLabelKey(state);
      expect(key).toBe(ELIGIBILITY_STATE_LABEL_KEYS[state]);
      expect(key).not.toBe(state);
      expect(eligibilityStateTone(state)).toBe(state);
    }
  });

  it("maps every current gap code without a raw-code fallback", () => {
    for (const gap of ELIGIBILITY_EXPLANATION_GAPS) {
      const key = eligibilityGapKey(gap);
      expect(key).toBe(ELIGIBILITY_GAP_KEYS[gap]);
      expect(key).not.toBe(gap);
    }
  });

  it("maps every current inconsistency code without a raw-code fallback", () => {
    for (const code of ELIGIBILITY_EXPLANATION_INCONSISTENCIES) {
      const key = eligibilityInconsistencyKey(code);
      expect(key).toBe(ELIGIBILITY_INCONSISTENCY_KEYS[code]);
      expect(key).not.toBe(code);
    }
  });

  it("maps every reason code to a localized key and never emits the domain identifier", () => {
    for (const code of ELIGIBILITY_REASON_CODES) {
      const key = eligibilityReasonKey(code);
      expect(key).toBe(ELIGIBILITY_REASON_KEYS[code]);
      expect(key).not.toBe(code);
      expect(key).not.toMatch(/^DEMO_RECORDED_/);
    }
  });

  it("fails unknown codes closed to unavailable or inconsistent, never the raw value", () => {
    expect(eligibilityStateLabelKey("UNKNOWN_STATE")).toBe(ELIGIBILITY_UNAVAILABLE_KEY);
    expect(eligibilityGapKey("UNKNOWN_GAP" as never)).toBe(ELIGIBILITY_UNAVAILABLE_KEY);
    expect(eligibilityInconsistencyKey("UNKNOWN_INCONSISTENCY" as never)).toBe(
      ELIGIBILITY_INCONSISTENT_KEY,
    );
    expect(eligibilityReasonKey("UNKNOWN_REASON" as never)).toBe(ELIGIBILITY_UNAVAILABLE_KEY);
    expect(eligibilityReasonKey(null)).toBeNull();
  });
});

describe("presentEligibilityExplanation", () => {
  it("presents assessed eligible Steppe × WHEAT with truthful attribution", () => {
    const explanation = explainInstrumentEligibility("INVESTOR-0001", WHEAT_INSTRUMENT_ID);
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.state).toBe("ELIGIBLE");
    expect(presented.stateKey).toBe("stateEligible");
    expect(presented.summaryKey).toBe("summaryEligible");
    expect(presented.assessed).toBe(true);
    expect(presented.assessmentRecorded).toBe(true);
    expect(presented.organizationRecorded).toBe(true);
    expect(presented.membershipRecorded).toBe(true);
    expect(presented.attributionComplete).toBe(true);
    expect(presented.allowsNewOrders).toBe(true);
    expect(presented.authorityKey).toBe(AUTHORITY_COMPLIANCE_OFFICER_KEY);
    expect(presented.reasonKey).toBe("reasonRecordedEligible");
    expect(presented.recordedAt).toBeNull();
    expect(presented.recordedAtKey).toBe(DATE_NOT_CLAIMED_KEY);
    expect(presented.evidenceCount).toBe(0);
    expect(presented.evidenceKey).toBe(NO_EVIDENCE_REFERENCES_KEY);
    expect(showAssessmentAttribution(presented)).toBe(true);
    expect(serialized(presented)).not.toMatch(/DEMO_RECORDED_/);
    expect(serialized(presented)).not.toMatch(/DEMO-EAS-/);
    expect(serialized(presented)).not.toMatch(/DEMO-MEM-/);
  });

  it("presents assessed not eligible without collapsing it into not assessed", () => {
    const notEligible: EligibilityAssessment = {
      id: "DEMO-EAS-SYNTHETIC-NOT-ELIGIBLE",
      participantReference: "INVESTOR-0001",
      instrumentId: WHEAT_INSTRUMENT_ID,
      organizationId: steppeOrg.id,
      membershipId: demoMembershipForPersona("DEMO-FUND-001")!.id,
      authorityRole: "COMPLIANCE_OFFICER",
      state: "NOT_ELIGIBLE",
      reasonCode: "DEMO_RECORDED_NOT_ELIGIBLE",
      evidenceRefs: [],
      recordedAt: null,
    };
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      assessments: [notEligible],
      eligibility: [
        {
          participantReference: "INVESTOR-0001",
          participantName: "Steppe Capital",
          instrumentId: WHEAT_INSTRUMENT_ID,
          state: "NOT_ELIGIBLE",
          organizationId: steppeOrg.id,
          membershipId: notEligible.membershipId,
          assessmentId: notEligible.id,
          reasonCode: "DEMO_RECORDED_NOT_ELIGIBLE",
        },
      ],
    });
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.state).toBe("NOT_ELIGIBLE");
    expect(presented.stateKey).toBe("stateNotEligible");
    expect(presented.summaryKey).toBe("summaryNotEligible");
    expect(presented.state).not.toBe("NOT_ASSESSED");
    expect(presented.allowsNewOrders).toBe(false);
    expect(presented.reasonKey).toBe("reasonRecordedNotEligible");
    expect(showAssessmentAttribution(presented)).toBe(true);
  });

  it("presents unassessed Commodity Desk without inventing attribution", () => {
    const explanation = explainInstrumentEligibility("COMMODITY-DESK", WHEAT_INSTRUMENT_ID);
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.state).toBe("NOT_ASSESSED");
    expect(presented.stateKey).toBe("stateNotAssessed");
    expect(presented.summaryKey).toBe("summaryNotAssessed");
    expect(presented.assessed).toBe(false);
    expect(presented.assessmentRecorded).toBe(false);
    expect(presented.authorityKey).toBeNull();
    expect(presented.reasonKey).toBeNull();
    expect(presented.recordedAt).toBeNull();
    expect(presented.recordedAtKey).toBe(DATE_NOT_CLAIMED_KEY);
    expect(presented.gapKeys).toContain("gapAssessmentMissing");
    expect(showAssessmentAttribution(presented)).toBe(false);
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("presents policy pending without approval language or an assessment panel", () => {
    const explanation = explain("RETAIL-PLACEHOLDER", WHEAT_INSTRUMENT_ID);
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.state).toBe("POLICY_PENDING");
    expect(presented.stateKey).toBe("statePolicyPending");
    expect(presented.summaryKey).toBe("summaryPolicyPending");
    expect(presented.tone).toBe("POLICY_PENDING");
    expect(presented.tone).not.toBe("ELIGIBLE");
    expect(presented.assessmentRecorded).toBe(false);
    expect(showAssessmentAttribution(presented)).toBe(false);
    expect(presented.reasonKey).toBeNull();
    expect(presented.authorityKey).toBeNull();
  });

  it("fails closed for incomplete attribution", () => {
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      actorOrganizationId: steppeOrg.id,
      actorMembershipId: null,
    });
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.attributionComplete).toBe(false);
    expect(presented.allowsNewOrders).toBe(false);
    expect(presented.gapKeys).toContain("gapMembershipMissing");
    expect(presented.summaryKey).not.toBe("summaryEligible");
  });

  it("fails closed for overlay / state mismatch without collapsing to not assessed", () => {
    const eligibility = registry.eligibility.map((row) =>
      row.assessmentId === DEMO_EAS_STEPPE_WHEAT_001
        ? { ...row, state: "NOT_ELIGIBLE" as const }
        : row,
    );
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, { eligibility });
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.state).toBe("NOT_ELIGIBLE");
    expect(presented.inconsistencyKeys).toContain("inconsistencyAssessmentStateMismatch");
    expect(presented.summaryKey).toBe(ELIGIBILITY_INCONSISTENT_KEY);
    expect(presented.allowsNewOrders).toBe(false);
    expect(presented.failClosedKey).toBe(ELIGIBILITY_INCONSISTENT_KEY);
  });

  it("fails closed for the wrong organisation", () => {
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      actorOrganizationId: grainOrg.id,
      actorMembershipId: demoMembershipForPersona("DEMO-TRADER-001")?.id,
    });
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.inconsistencyKeys).toContain("inconsistencyWrongOrganization");
    expect(presented.summaryKey).toBe(ELIGIBILITY_INCONSISTENT_KEY);
    expect(presented.allowsNewOrders).toBe(false);
  });

  it("fails closed when the assessment is missing from an eligible row", () => {
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      assessments: [],
    });
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.assessmentRecorded).toBe(false);
    expect(presented.gapKeys).toContain("gapAssessmentMissing");
    expect(presented.allowsNewOrders).toBe(false);
    expect(showAssessmentAttribution(presented)).toBe(false);
  });

  it("renders a claimed recorded date instead of date-not-claimed", () => {
    const assessments = registry.assessments.map((item) =>
      item.id === DEMO_EAS_STEPPE_WHEAT_001
        ? { ...item, recordedAt: "2026-03-01T00:00:00.000Z" }
        : item,
    );
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, { assessments });
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.recordedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(presented.recordedAtKey).toBeNull();
  });

  it("renders empty evidence as no evidence references recorded, not verified", () => {
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID);
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.evidenceCount).toBe(0);
    expect(presented.evidenceKey).toBe(NO_EVIDENCE_REFERENCES_KEY);
    expect(presented.evidenceKey).not.toMatch(/verified/i);
  });

  it("presents recorded evidence without treating it as verified", () => {
    const assessments = registry.assessments.map((item) =>
      item.id === DEMO_EAS_STEPPE_WHEAT_001
        ? { ...item, evidenceRefs: ["demo-policy-note"] }
        : item,
    );
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, { assessments });
    const presented = presentEligibilityExplanation(explanation);
    expect(presented.evidenceCount).toBe(1);
    expect(presented.evidenceKey).toBe("evidenceReferencesRecorded");
  });

  it("presents COMPLIANCE_OFFICER as an authority role, not a named assessor", () => {
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID);
    const presented = presentEligibilityExplanation(explanation);
    expect(explanation.authorityRole).toBe("COMPLIANCE_OFFICER");
    expect(presented.authorityKey).toBe(AUTHORITY_COMPLIANCE_OFFICER_KEY);
    expect(serialized(presented)).not.toMatch(/assessor/i);
    expect(serialized(presented)).not.toContain("COMPLIANCE_OFFICER");
  });

  it("maps pair mismatch, reason mismatch and authority-role mismatch", () => {
    const pairMismatch: EligibilityExplanation = {
      ...explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID),
      inconsistencies: ["ASSESSMENT_PAIR_MISMATCH"],
      attributionComplete: false,
    };
    const reasonMismatch: EligibilityExplanation = {
      ...explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID),
      inconsistencies: ["REASON_CODE_MISMATCH"],
      attributionComplete: false,
    };
    const authorityMismatch: EligibilityExplanation = {
      ...explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID),
      inconsistencies: ["AUTHORITY_ROLE_NOT_ALLOWED"],
      attributionComplete: false,
    };
    expect(presentEligibilityExplanation(pairMismatch).inconsistencyKeys).toEqual([
      "inconsistencyAssessmentPairMismatch",
    ]);
    expect(presentEligibilityExplanation(reasonMismatch).inconsistencyKeys).toEqual([
      "inconsistencyReasonCodeMismatch",
    ]);
    expect(presentEligibilityExplanation(authorityMismatch).inconsistencyKeys).toEqual([
      "inconsistencyAuthorityRoleNotAllowed",
    ]);
    expect(presentEligibilityExplanation(pairMismatch).summaryKey).toBe(
      ELIGIBILITY_INCONSISTENT_KEY,
    );
  });
});

describe("presentNewOrderAdmission", () => {
  it("allows new-order entry only when production canSubmit is true", () => {
    const explanation = explainInstrumentEligibility("INVESTOR-0001", WHEAT_INSTRUMENT_ID);
    const presented = presentNewOrderAdmission({
      canSubmit: true,
      hasParticipant: true,
      explanation,
    });
    expect(presented.kind).toBe("ALLOWED");
    expect(presented.summaryKey).toBe("summaryEligible");
  });

  it("denies not assessed, policy pending and not eligible with the matching presentation", () => {
    expect(
      presentNewOrderAdmission({
        canSubmit: false,
        hasParticipant: true,
        explanation: explain("COMMODITY-DESK", WHEAT_INSTRUMENT_ID),
      }).kind,
    ).toBe("NOT_ASSESSED");
    expect(
      presentNewOrderAdmission({
        canSubmit: false,
        hasParticipant: true,
        explanation: explain("RETAIL-PLACEHOLDER", WHEAT_INSTRUMENT_ID),
      }).kind,
    ).toBe("POLICY_PENDING");
    const notEligible = presentNewOrderAdmission({
      canSubmit: false,
      hasParticipant: true,
      explanation: explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
        assessments: [
          {
            id: "DEMO-EAS-SYNTHETIC-NOT-ELIGIBLE",
            participantReference: "INVESTOR-0001",
            instrumentId: WHEAT_INSTRUMENT_ID,
            organizationId: steppeOrg.id,
            membershipId: demoMembershipForPersona("DEMO-FUND-001")!.id,
            authorityRole: "COMPLIANCE_OFFICER",
            state: "NOT_ELIGIBLE",
            reasonCode: "DEMO_RECORDED_NOT_ELIGIBLE",
            evidenceRefs: [],
            recordedAt: null,
          },
        ],
        eligibility: [
          {
            participantReference: "INVESTOR-0001",
            participantName: "Steppe Capital",
            instrumentId: WHEAT_INSTRUMENT_ID,
            state: "NOT_ELIGIBLE",
            organizationId: steppeOrg.id,
            membershipId: demoMembershipForPersona("DEMO-FUND-001")!.id,
            assessmentId: "DEMO-EAS-SYNTHETIC-NOT-ELIGIBLE",
            reasonCode: "DEMO_RECORDED_NOT_ELIGIBLE",
          },
        ],
      }),
    });
    expect(notEligible.kind).toBe("NOT_ELIGIBLE");
    expect(notEligible.summaryKey).toBe("summaryNotEligible");
  });

  it("denies incomplete attribution and overlay mismatch without a second policy", () => {
    const incomplete = presentNewOrderAdmission({
      canSubmit: false,
      hasParticipant: true,
      explanation: explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
        actorOrganizationId: steppeOrg.id,
        actorMembershipId: null,
      }),
    });
    expect(incomplete.kind).toBe("ATTRIBUTION_INCOMPLETE");
    expect(incomplete.summaryKey).toBe(ELIGIBILITY_INCOMPLETE_KEY);

    const mismatched = presentNewOrderAdmission({
      canSubmit: false,
      hasParticipant: true,
      explanation: explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
        actorOrganizationId: grainOrg.id,
        actorMembershipId: demoMembershipForPersona("DEMO-TRADER-001")?.id,
      }),
    });
    expect(mismatched.kind).toBe("INCONSISTENT");
    expect(mismatched.summaryKey).toBe(ELIGIBILITY_INCONSISTENT_KEY);
  });

  it("explains view-only access when no participant identity is resolved", () => {
    const presented = presentNewOrderAdmission({
      canSubmit: false,
      hasParticipant: false,
      explanation: null,
    });
    expect(presented.kind).toBe("NO_PARTICIPANT");
    expect(presented.summaryKey).toBe("summaryNoParticipant");
    expect(presented.stateKey).toBeNull();
  });
});

describe("presentOnboardingReadiness", () => {
  it("does not treat organisation membership as instrument eligibility", () => {
    const presented = presentOnboardingReadiness(
      explainOnboardingMarketReadinessForOrganization(issuerOrg.id),
    );
    expect(presented.hasOrganization).toBe(true);
    expect(presented.hasMembership).toBe(true);
    expect(presented.hasParticipant).toBe(false);
    expect(presented.hasAssessment).toBe(false);
    expect(presented.eligibilityStateKey).toBe("stateNotAssessed");
    expect(presented.instrumentId).toBe(WHEAT_INSTRUMENT_ID);
    expect(presented.instrumentSymbol).toBe("WHEAT-2027");
    expect(presented.onboardingDoesNotGrantEligibilityKey).toBe(
      "onboardingDoesNotGrantEligibility",
    );
  });
});

describe("eligibilityAttributionFields", () => {
  it("uses distinct field labels and recorded/not-recorded values", () => {
    const assessed = presentEligibilityExplanation(
      explainInstrumentEligibility("INVESTOR-0001", WHEAT_INSTRUMENT_ID),
    );
    const fields = eligibilityAttributionFields(assessed);
    expect(fields).not.toBeNull();
    expect(fields?.membership.labelKey).toBe("membershipField");
    expect(fields?.membership.valueKey).toBe("fieldRecorded");
    expect(fields?.assessment.labelKey).toBe("assessmentField");
    expect(fields?.assessment.valueKey).toBe("fieldRecorded");
    expect(fields?.membership.labelKey).not.toBe(fields?.membership.valueKey);
    expect(fields?.assessment.labelKey).not.toBe(fields?.assessment.valueKey);

    const unassessed = presentEligibilityExplanation(
      explainInstrumentEligibility("COMMODITY-DESK", WHEAT_INSTRUMENT_ID),
    );
    expect(eligibilityAttributionFields(unassessed)).toBeNull();
    expect(showAssessmentAttribution(unassessed)).toBe(false);
  });
});

describe("eligibility message catalog", () => {
  it("defines every presentation key in EN/RU/KK without empty or raw-code values", () => {
    for (const key of allEligibilityPresentationKeys()) {
      for (const [locale, catalog] of Object.entries(catalogs)) {
        const value = catalog[key as keyof typeof catalog];
        expect(typeof value, `${locale}.${key}`).toBe("string");
        expect(String(value).trim().length, `${locale}.${key}`).toBeGreaterThan(0);
        expect(String(value), `${locale}.${key}`).not.toBe(key);
        expect(String(value), `${locale}.${key}`).not.toMatch(/DEMO_RECORDED_/);
        expect(String(value), `${locale}.${key}`).not.toMatch(/DEMO-EAS-/);
        expect(String(value), `${locale}.${key}`).not.toMatch(/DEMO-MEM-/);
        expect(String(value), `${locale}.${key}`).not.toMatch(
          /\b(ELIGIBLE|NOT_ELIGIBLE|NOT_ASSESSED|POLICY_PENDING)\b/,
        );
      }
    }
  });

  it("keeps Russian and Kazakh distinct from English", () => {
    for (const key of allEligibilityPresentationKeys()) {
      expect(catalogs.ru[key as keyof typeof catalogs.ru]).not.toBe(
        catalogs.en[key as keyof typeof catalogs.en],
      );
      expect(catalogs.kk[key as keyof typeof catalogs.kk]).not.toBe(
        catalogs.en[key as keyof typeof catalogs.en],
      );
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  canTrade,
  eligibilityFor,
  explainActorEligibility,
  explainEligibility,
  explainOnboardingMarketReadiness,
  explanationAllowsTrade,
  freezeEligibilityAssessment,
  freezeEligibilityAssessmentRegistry,
  isAssessedEligibilityDecision,
  organizationOwnsParticipant,
  organizationParticipantReference,
  validateEligibilityAssessmentRegistry,
  type EligibilityAssessment,
  type EligibilityExplanation,
  type ParticipantInstrumentEligibility,
} from "@/domain/market-core";
import * as marketCore from "@/domain/market-core";
import {
  DEMO_EAS_GRAIN_WHEAT_001,
  DEMO_EAS_STEPPE_WHEAT_001,
  F2F_PROTOCOL_INVESTMENT_ID,
  WHEAT_INSTRUMENT_ID,
  eligibilityAssessments,
  eligibilityMatrix,
  instrumentById,
  marketForInstrument,
  marketInstruments,
  marketParticipants,
  shippedEligibilityRegistryInput,
} from "@/data/market-core/catalog";
import {
  DEMO_ORGANIZATIONS,
  demoMembershipForPersona,
  demoPersonaById,
} from "@/data/identity/demo-catalog";
import {
  buildPrincipal,
  resolveActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import { explainInstrumentEligibility, shippedEligibilityRegistryViolations } from "@/services/market-core-service";

const registry = shippedEligibilityRegistryInput();
const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
const wheatMarket = marketForInstrument(WHEAT_INSTRUMENT_ID)!;
const steppeOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "steppe-capital")!;
const grainOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "grain-desk")!;
const commodityOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "commodity-desk")!;
const issuerOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "agro-issuer")!;
const platformOrg = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;

function explain(
  participantReference: string,
  instrumentId: string,
  overrides: Partial<typeof registry> & {
    actorOrganizationId?: string | null;
    actorMembershipId?: string | null;
    eligibility?: readonly ParticipantInstrumentEligibility[];
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

function membership(overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "roleIds">): MembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    userId: overrides.userId ?? "user-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

describe("shipped eligibility assessment registry", () => {
  it("produces zero validation violations", () => {
    expect(validateEligibilityAssessmentRegistry(registry)).toEqual([]);
    expect(shippedEligibilityRegistryViolations()).toEqual([]);
  });

  it("does not introduce a global organisation eligibility helper", () => {
    expect("isEligible" in marketCore).toBe(false);
    expect(Object.keys(marketCore).some((key) => /isEligible/i.test(key))).toBe(false);
    expect(Object.keys(marketCore).some((key) => /organizationEligible/i.test(key))).toBe(false);
  });
});

describe("assessed attribution", () => {
  it("keeps Steppe × WHEAT eligible with complete truthful attribution", () => {
    const row = eligibilityMatrix.find(
      (item) =>
        item.participantReference === "INVESTOR-0001" &&
        item.instrumentId === WHEAT_INSTRUMENT_ID,
    )!;
    expect(row.state).toBe("ELIGIBLE");
    expect(isAssessedEligibilityDecision(row)).toBe(true);
    expect(row.organizationId).toBe(steppeOrg.id);
    expect(row.membershipId).toBe(demoMembershipForPersona("DEMO-FUND-001")?.id);
    expect(row.assessmentId).toBe(DEMO_EAS_STEPPE_WHEAT_001);
    expect(row.reasonCode).toBe("DEMO_RECORDED_ELIGIBLE");
    expect(organizationOwnsParticipant(steppeOrg, "INVESTOR-0001")).toBe(true);
    expect(organizationParticipantReference(steppeOrg)).toBe("INVESTOR-0001");

    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID);
    expect(explanation.state).toBe("ELIGIBLE");
    expect(explanation.organizationId).toBe(steppeOrg.id);
    expect(explanation.membershipId).toBe(row.membershipId);
    expect(explanation.assessmentId).toBe(DEMO_EAS_STEPPE_WHEAT_001);
    expect(explanation.authorityRole).toBe("COMPLIANCE_OFFICER");
    expect(explanation.reasonCode).toBe("DEMO_RECORDED_ELIGIBLE");
    expect(explanation.evidenceRefs).toEqual([]);
    expect(explanation.recordedAt).toBeNull();
    expect(explanation.attributionComplete).toBe(true);
    expect(explanation.missing).toEqual([]);
    expect(explanation.inconsistencies).toEqual([]);
    expect(explanationAllowsTrade(explanation)).toBe(true);
    expect(
      canTrade({ eligibility: explanation.state, instrument: wheat, market: wheatMarket }),
    ).toBe(true);
  });

  it("keeps Grain Desk × WHEAT eligible as an organisation-level participant", () => {
    const row = eligibilityMatrix.find(
      (item) =>
        item.participantReference === "GRAIN-DESK" && item.instrumentId === WHEAT_INSTRUMENT_ID,
    )!;
    expect(row.state).toBe("ELIGIBLE");
    expect(isAssessedEligibilityDecision(row)).toBe(true);
    expect(row.organizationId).toBe(grainOrg.id);
    expect(row.membershipId).toBe(demoMembershipForPersona("DEMO-TRADER-001")?.id);
    expect(row.assessmentId).toBe(DEMO_EAS_GRAIN_WHEAT_001);
    expect(organizationParticipantReference(grainOrg)).toBe("GRAIN-DESK");
    expect(grainOrg.externalInvestorRef ?? null).toBeNull();

    const explanation = explain("GRAIN-DESK", WHEAT_INSTRUMENT_ID);
    expect(explanation.state).toBe("ELIGIBLE");
    expect(explanation.organizationId).toBe(grainOrg.id);
    expect(explanation.attributionComplete).toBe(true);
    expect(explanationAllowsTrade(explanation)).toBe(true);
  });
});

describe("unassessed and placeholder rows", () => {
  it("treats Commodity Desk × WHEAT as NOT_ASSESSED without a fake assessment", () => {
    expect(eligibilityFor(eligibilityMatrix, "COMMODITY-DESK", WHEAT_INSTRUMENT_ID)).toBe(
      "NOT_ASSESSED",
    );
    const explanation = explain("COMMODITY-DESK", WHEAT_INSTRUMENT_ID);
    expect(explanation.state).toBe("NOT_ASSESSED");
    expect(explanation.assessmentId).toBeNull();
    expect(explanation.authorityRole).toBeNull();
    expect(explanation.reasonCode).toBeNull();
    expect(explanation.recordedAt).toBeNull();
    expect(explanation.evidenceRefs).toEqual([]);
    expect(explanation.missing).toContain("ASSESSMENT_MISSING");
    expect(explanation.attributionComplete).toBe(false);
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("never treats the retail future placeholder as an admitted participant or approved assessment", () => {
    const participant = marketParticipants.find(
      (item) => item.participantReference === "RETAIL-PLACEHOLDER",
    )!;
    expect(participant.kind).toBe("PLACEHOLDER");
    expect(participant.organizationId).toBeNull();
    const explanation = explain("RETAIL-PLACEHOLDER", WHEAT_INSTRUMENT_ID);
    expect(explanation.state).toBe("POLICY_PENDING");
    expect(explanation.state).not.toBe("NOT_ASSESSED");
    expect(explanation.assessmentId).toBeNull();
    expect(explanation.missing).toContain("PLACEHOLDER_PARTICIPANT");
    expect(explanation.attributionComplete).toBe(false);
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("does not invent a WATER-FUTURE instrument and cannot trade it", () => {
    expect(marketInstruments.some((item) => item.id === "WATER-FUTURE")).toBe(false);
    const explanation = explain("INVESTOR-0001", "WATER-FUTURE");
    expect(explanation.state).toBe("NOT_ASSESSED");
    expect(explanation.assessmentId).toBeNull();
    expect(explanation.missing).toContain("PLACEHOLDER_INSTRUMENT");
    expect(explanation.missing).toContain("INSTRUMENT_MISSING");
    expect(explanationAllowsTrade(explanation)).toBe(false);
    expect(instrumentById("WATER-FUTURE")).toBeUndefined();
  });

  it("keeps protocol investment non-tradeable", () => {
    const instrument = instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!;
    const explanation = explain("INVESTOR-0001", F2F_PROTOCOL_INVESTMENT_ID);
    expect(explanation.state).toBe("NOT_ASSESSED");
    expect(explanation.assessmentId).toBeNull();
    expect(explanationAllowsTrade(explanation)).toBe(false);
    expect(
      canTrade({
        eligibility: "ELIGIBLE",
        instrument,
        market: { ...wheatMarket, instrumentId: instrument.id },
      }),
    ).toBe(false);
  });

  it("resolves a missing row to NOT_ASSESSED without fabricating an assessment", () => {
    const explanation = explain("INVESTOR-0001", "NO-SUCH-INSTRUMENT");
    expect(explanation.state).toBe("NOT_ASSESSED");
    expect(explanation.assessmentId).toBeNull();
    expect(explanation.authorityRole).toBeNull();
    expect(explanation.reasonCode).toBeNull();
    expect(explanation.recordedAt).toBeNull();
    expect(explanation.missing).toContain("ASSESSMENT_MISSING");
    expect(explainInstrumentEligibility("INVESTOR-0001", "NO-SUCH-INSTRUMENT").assessmentId).toBeNull();
  });
});

describe("fail-closed attribution", () => {
  it("fails closed for the wrong organisation", () => {
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      actorOrganizationId: grainOrg.id,
      actorMembershipId: demoMembershipForPersona("DEMO-TRADER-001")?.id,
    });
    expect(explanation.inconsistencies).toContain("WRONG_ORGANIZATION");
    expect(explanation.attributionComplete).toBe(false);
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("fails closed when membership is missing from an assessed decision", () => {
    const assessments = registry.assessments.map((item) =>
      item.id === DEMO_EAS_STEPPE_WHEAT_001 ? { ...item, membershipId: "" } : item,
    );
    const eligibility = registry.eligibility.map((row) =>
      row.assessmentId === DEMO_EAS_STEPPE_WHEAT_001
        ? { ...row, membershipId: undefined }
        : row,
    );
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      assessments,
      eligibility,
    });
    expect(explanation.missing).toContain("MEMBERSHIP_MISSING");
    expect(explanation.attributionComplete).toBe(false);
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("fails closed when the actor has no membership", () => {
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      actorOrganizationId: steppeOrg.id,
      actorMembershipId: null,
    });
    expect(explanation.missing).toContain("MEMBERSHIP_MISSING");
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("fails closed when the assessment is missing from an eligible row", () => {
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      assessments: [],
    });
    expect(explanation.missing).toContain("ASSESSMENT_MISSING");
    expect(explanation.assessmentId).toBeNull();
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("reports assessment/eligibility state mismatch and fails closed", () => {
    const eligibility = registry.eligibility.map((row) =>
      row.assessmentId === DEMO_EAS_STEPPE_WHEAT_001
        ? { ...row, state: "NOT_ELIGIBLE" as const }
        : row,
    );
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, { eligibility });
    expect(explanation.state).toBe("NOT_ELIGIBLE");
    expect(explanation.inconsistencies).toContain("ASSESSMENT_STATE_MISMATCH");
    expect(explanation.attributionComplete).toBe(false);
    expect(explanationAllowsTrade(explanation)).toBe(false);
    expect(explanation.state).not.toBe("NOT_ASSESSED");
  });

  it("keeps POLICY_PENDING distinct from approval", () => {
    const explanation = explain("RETAIL-PLACEHOLDER", WHEAT_INSTRUMENT_ID);
    expect(explanation.state).toBe("POLICY_PENDING");
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("keeps NOT_ELIGIBLE distinct from NOT_ASSESSED and cannot submit", () => {
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
    const eligibility: ParticipantInstrumentEligibility[] = [
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
    ];
    const explanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID, {
      assessments: [notEligible],
      eligibility,
    });
    expect(explanation.state).toBe("NOT_ELIGIBLE");
    expect(explanation.state).not.toBe("NOT_ASSESSED");
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });
});

describe("onboarding is not eligibility", () => {
  it("does not treat issuer membership as a trading participant or assessment", () => {
    const readiness = explainOnboardingMarketReadiness({
      organizationId: issuerOrg.id,
      instrumentId: WHEAT_INSTRUMENT_ID,
      organizations: registry.organizations,
      memberships: registry.memberships,
      participants: registry.participants,
      assessments: registry.assessments,
      eligibility: registry.eligibility,
      instruments: registry.instruments,
    });
    expect(readiness.hasOrganization).toBe(true);
    expect(readiness.hasMembership).toBe(true);
    expect(readiness.hasParticipant).toBe(false);
    expect(readiness.hasAssessment).toBe(false);
    expect(readiness.eligibilityState).toBe("NOT_ASSESSED");
    expect(organizationParticipantReference(issuerOrg)).toBeNull();
  });

  it("explains Commodity Desk membership without granting eligibility", () => {
    const readiness = explainOnboardingMarketReadiness({
      organizationId: commodityOrg.id,
      instrumentId: WHEAT_INSTRUMENT_ID,
      organizations: registry.organizations,
      memberships: registry.memberships,
      participants: registry.participants,
      assessments: registry.assessments,
      eligibility: registry.eligibility,
      instruments: registry.instruments,
    });
    expect(readiness.hasParticipant).toBe(true);
    expect(readiness.hasAssessment).toBe(false);
    expect(readiness.eligibilityState).toBe("NOT_ASSESSED");
  });
});

describe("validation rejects invented attribution", () => {
  it("rejects WATER-FUTURE as an assessed instrument", () => {
    const bogus: EligibilityAssessment = {
      id: "DEMO-EAS-WATER",
      participantReference: "INVESTOR-0001",
      instrumentId: "WATER-FUTURE",
      organizationId: steppeOrg.id,
      membershipId: demoMembershipForPersona("DEMO-FUND-001")!.id,
      authorityRole: "COMPLIANCE_OFFICER",
      state: "ELIGIBLE",
      reasonCode: "DEMO_RECORDED_ELIGIBLE",
      evidenceRefs: [],
      recordedAt: null,
    };
    const violations = validateEligibilityAssessmentRegistry({
      ...registry,
      assessments: [...registry.assessments, bogus],
    });
    expect(violations.map((item) => item.code)).toEqual(
      expect.arrayContaining(["PLACEHOLDER_INSTRUMENT_REJECTED", "INSTRUMENT_NOT_FOUND"]),
    );
  });

  it("rejects a stored ELIGIBLE decision without attribution", () => {
    const violations = validateEligibilityAssessmentRegistry({
      ...registry,
      eligibility: [
        {
          participantReference: "INVESTOR-0001",
          participantName: "Steppe Capital",
          instrumentId: WHEAT_INSTRUMENT_ID,
          state: "ELIGIBLE",
        },
      ],
    });
    expect(violations.map((item) => item.code)).toContain(
      "ASSESSED_DECISION_MISSING_ATTRIBUTION",
    );
  });
});

describe("runtime immutability", () => {
  it("freezes owned copies without freezing shared evidence arrays", () => {
    const shared = ["evidence-a"];
    const frozen = freezeEligibilityAssessment({
      id: "DEMO-EAS-FREEZE",
      participantReference: "INVESTOR-0001",
      instrumentId: WHEAT_INSTRUMENT_ID,
      organizationId: steppeOrg.id,
      membershipId: demoMembershipForPersona("DEMO-FUND-001")!.id,
      authorityRole: "COMPLIANCE_OFFICER",
      state: "ELIGIBLE",
      reasonCode: "DEMO_RECORDED_ELIGIBLE",
      evidenceRefs: shared,
      recordedAt: null,
    });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.evidenceRefs)).toBe(true);
    expect(Object.isFrozen(shared)).toBe(false);
    expect(frozen.evidenceRefs).not.toBe(shared);
    expect(() => {
      (frozen.evidenceRefs as string[]).push("tampered");
    }).toThrow(TypeError);
    expect(shared).toEqual(["evidence-a"]);
  });

  it("freezes the shipped assessment registry and eligibility matrix", () => {
    expect(Object.isFrozen(eligibilityAssessments)).toBe(true);
    expect(Object.isFrozen(eligibilityMatrix)).toBe(true);
    expect(Object.isFrozen(eligibilityAssessments[0])).toBe(true);
    expect(Object.isFrozen(eligibilityMatrix[0])).toBe(true);
    expect(() => {
      (eligibilityAssessments as EligibilityAssessment[]).push(
        eligibilityAssessments[0]!,
      );
    }).toThrow(TypeError);
    expect(() => {
      (eligibilityMatrix as ParticipantInstrumentEligibility[]).push(eligibilityMatrix[0]!);
    }).toThrow(TypeError);
    const exposed = freezeEligibilityAssessmentRegistry(eligibilityAssessments);
    expect(Object.isFrozen(exposed)).toBe(true);
  });

  it("exposes readonly explanation collections", () => {
    const explanation: EligibilityExplanation = explain("INVESTOR-0001", WHEAT_INSTRUMENT_ID);
    expect(Object.isFrozen(explanation.evidenceRefs)).toBe(true);
    expect(Object.isFrozen(explanation.missing)).toBe(true);
    expect(Object.isFrozen(explanation.inconsistencies)).toBe(true);
    const readonlyExplanation: EligibilityExplanation = explanation;
    expect(readonlyExplanation.assessmentId).toBe(DEMO_EAS_STEPPE_WHEAT_001);
  });
});

describe("actor membership attribution", () => {
  it("attaches the demo membership when impersonating the Steppe investor", () => {
    const principal = buildPrincipal({
      userId: "admin-1",
      email: "admin@example.com",
      displayName: "Admin",
      status: "ACTIVE",
      organizations: [platformOrg],
      memberships: [
        membership({
          userId: "admin-1",
          organizationId: platformOrg.id,
          roleIds: ["SYSTEM_ADMIN"],
        }),
      ],
    });
    const context = resolveActorContext({
      principal,
      session: { principalUserId: "admin-1", effectiveDemoPersonaId: "DEMO-FUND-001" },
      persona: demoPersonaById("DEMO-FUND-001"),
      personaOrganization: steppeOrg,
    });
    expect(context.effective.membershipId).toBe(demoMembershipForPersona("DEMO-FUND-001")?.id);
    expect(context.effective.organization?.id).toBe(steppeOrg.id);
    const explanation = explainActorEligibility(context, {
      participantReference: "INVESTOR-0001",
      instrumentId: WHEAT_INSTRUMENT_ID,
      eligibility: registry.eligibility,
      assessments: registry.assessments,
      participants: registry.participants,
      instruments: registry.instruments,
      organizations: registry.organizations,
      memberships: registry.memberships,
    });
    expect(explanation.attributionComplete).toBe(true);
    expect(explanationAllowsTrade(explanation)).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  actorMayCancelSecondaryOrder,
  actorMaySubmitSecondaryOrder,
  explainSecondaryActorEligibility,
} from "@/services/secondary-market-service";
import {
  explainOnboardingMarketReadinessForOrganization,
  listEligibility,
  listInstrumentEligibilityReadModel,
} from "@/services/market-core-service";
import { listParticipantCompliance } from "@/services/compliance-service";
import {
  WHEAT_INSTRUMENT_ID,
  instrumentById,
  marketForInstrument,
} from "@/data/market-core/catalog";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
  organizationById,
} from "@/data/identity/demo-catalog";
import {
  ORGANIZATION_TYPES,
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import {
  ORGANIZATION_TYPE_LABEL_KEYS,
  organizationTypeLabelKey,
  presentEligibilityExplanation,
  presentNewOrderAdmission,
  presentOnboardingReadiness,
  showAssessmentAttribution,
} from "@/lib/market-core/eligibility-presentation";
import { actorMayCancelOrder, type Order } from "@/domain/market-core";
import en from "../../../messages/en.json";
import ru from "../../../messages/ru.json";
import kk from "../../../messages/kk.json";

const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
const wheatMarket = marketForInstrument(WHEAT_INSTRUMENT_ID)!;
const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;

function membership(
  overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "roleIds">,
): MembershipRecord {
  return {
    id: overrides.id ?? "mem-1",
    userId: overrides.userId ?? "admin-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

function asPersona(personaId: string): ActorContext {
  const persona = demoPersonaById(personaId)!;
  const organization = organizationById(persona.organizationId)!;
  const principal = buildPrincipal({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "Admin",
    status: "ACTIVE",
    organizations: [platform, organization],
    memberships: [
      membership({
        userId: "admin-1",
        organizationId: platform.id,
        roleIds: ["SYSTEM_ADMIN"],
      }),
    ],
  });
  return resolveActorContext({
    principal,
    session: {
      principalUserId: "admin-1",
      effectiveDemoPersonaId: persona.id,
    },
    persona,
    personaOrganization: organization,
  });
}

function openOrder(participantId: string): Order {
  return {
    id: `ORD-${participantId}-OPEN`,
    marketId: wheatMarket.id,
    instrumentId: wheat.id,
    participantId,
    side: "SELL",
    orderType: "LIMIT",
    price: 105000,
    originalQuantity: 2,
    remainingQuantity: 2,
    filledQuantity: 0,
    status: "OPEN",
    sequence: 1,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    sourceChannel: "DIRECT_MTP",
  };
}

const operatorSources = [
  "src/app/participants/page.tsx",
  "src/app/compliance/eligibility/page.tsx",
  "src/app/onboarding/page.tsx",
  "src/app/secondary/page.tsx",
  "src/app/secondary/order-entry.tsx",
  "src/components/market-core/instrument-eligibility-table.tsx",
];

describe("instrument eligibility read model", () => {
  it("represents every matrix pair once", () => {
    const matrix = listEligibility();
    const rows = listInstrumentEligibilityReadModel();
    const pairs = rows.map((row) => `${row.participantReference}::${row.instrumentId}`);
    expect(pairs).toHaveLength(matrix.length);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("includes truthful attribution only when an assessment exists", () => {
    const rows = listInstrumentEligibilityReadModel();
    const steppe = rows.find(
      (row) =>
        row.participantReference === "INVESTOR-0001" && row.instrumentId === WHEAT_INSTRUMENT_ID,
    )!;
    const presented = presentEligibilityExplanation(steppe.explanation);
    expect(presented.state).toBe("ELIGIBLE");
    expect(showAssessmentAttribution(presented)).toBe(true);
    expect(presented.authorityKey).toBe("authorityComplianceOfficer");
    expect(presented.recordedAtKey).toBe("dateNotClaimed");
    expect(presented.evidenceKey).toBe("noEvidenceReferencesRecorded");
    expect(steppe.organizationName).toBeTruthy();

    const commodity = rows.find(
      (row) =>
        row.participantReference === "COMMODITY-DESK" && row.instrumentId === WHEAT_INSTRUMENT_ID,
    )!;
    const unassessed = presentEligibilityExplanation(commodity.explanation);
    expect(unassessed.state).toBe("NOT_ASSESSED");
    expect(showAssessmentAttribution(unassessed)).toBe(false);
    expect(unassessed.authorityKey).toBeNull();
    expect(unassessed.reasonKey).toBeNull();
  });

  it("keeps screening states off the market eligibility matrix", () => {
    const screening = listParticipantCompliance().map((row) => row.record.eligibility);
    expect(screening.every((state) => ["APPROVED", "BLOCKED", "PENDING"].includes(state))).toBe(
      true,
    );
    const marketStates = listInstrumentEligibilityReadModel().map((row) => row.explanation.state);
    expect(
      marketStates.some((state) => ["APPROVED", "BLOCKED", "PENDING"].includes(state as string)),
    ).toBe(false);
  });
});

describe("compliance read-only workspace", () => {
  it("does not introduce assessment mutation controls", () => {
    const source = readFileSync("src/app/compliance/eligibility/page.tsx", "utf8");
    for (const verb of ["Approve", "Reject", "Suspend", "Revoke", "Reassess", "Save assessment"]) {
      expect(source).not.toContain(verb);
    }
    expect(source).toContain("compliance.manage");
    expect(source).toContain("listInstrumentEligibilityReadModel");
    expect(source).toContain("listParticipantCompliance");
  });
});

describe("onboarding explanation", () => {
  it("does not claim that onboarding grants eligibility", () => {
    const source = readFileSync("src/app/onboarding/page.tsx", "utf8");
    expect(source).toContain("noEligibilityGranted");
    expect(source).toContain("onboardingAction");
    expect(source).not.toMatch(/Approve|Reject|Reassess/);
    const issuer = DEMO_ORGANIZATIONS.find((item) => item.slug === "agro-issuer")!;
    const presented = presentOnboardingReadiness(
      explainOnboardingMarketReadinessForOrganization(issuer.id),
    );
    expect(presented.hasParticipant).toBe(false);
    expect(presented.hasAssessment).toBe(false);
    expect(presented.eligibilityStateKey).toBe("stateNotAssessed");
  });
});

describe("secondary new-order explanation", () => {
  it("allows an eligible actor with an explanation consistent with canSubmit", () => {
    const actor = asPersona("DEMO-FUND-001");
    const eligibility = listEligibility();
    const explanation = explainSecondaryActorEligibility(actor, wheat, eligibility);
    const canSubmit = actorMaySubmitSecondaryOrder(actor, wheat, wheatMarket, eligibility);
    const presented = presentNewOrderAdmission({
      canSubmit,
      hasParticipant: true,
      explanation,
    });
    expect(canSubmit).toBe(true);
    expect(presented.kind).toBe("ALLOWED");
    expect(presented.summaryKey).toBe("summaryEligible");
  });

  it("denies a Commodity Desk trader as not assessed", () => {
    const trader = asPersona("DEMO-TRADER-002");
    const eligibility = listEligibility();
    const explanation = explainSecondaryActorEligibility(trader, wheat, eligibility);
    const canSubmit = actorMaySubmitSecondaryOrder(trader, wheat, wheatMarket, eligibility);
    const presented = presentNewOrderAdmission({
      canSubmit,
      hasParticipant: true,
      explanation,
    });
    expect(canSubmit).toBe(false);
    expect(presented.kind).toBe("NOT_ASSESSED");
  });

  it("keeps cancellation available after eligibility loss", () => {
    const actor = asPersona("DEMO-FUND-001");
    const owned = openOrder("INVESTOR-0001");
    expect(actorMayCancelSecondaryOrder(actor, owned)).toBe(true);
    expect(actorMayCancelOrder({ actor, order: owned })).toBe(true);
  });
});

describe("operator surfaces do not leak raw codes", () => {
  it("does not render DEMO assessment identifiers on operator pages", () => {
    for (const file of operatorSources) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/DEMO_RECORDED_/);
      expect(source, file).not.toMatch(/DEMO-EAS-/);
      expect(source, file).not.toMatch(/DEMO-MEM-/);
    }
  });

  it("maps every organisation type without using the raw enum as copy", () => {
    for (const type of ORGANIZATION_TYPES) {
      expect(organizationTypeLabelKey(type)).toBe(ORGANIZATION_TYPE_LABEL_KEYS[type]);
      expect(organizationTypeLabelKey(type)).not.toBe(type);
    }
  });

  it("localizes compact organisation types in EN/RU/KK", () => {
    for (const type of ORGANIZATION_TYPES) {
      const key = organizationTypeLabelKey(type);
      expect(en.eligibility[key as keyof typeof en.eligibility]).toBeTruthy();
      expect(ru.eligibility[key as keyof typeof ru.eligibility]).toBeTruthy();
      expect(kk.eligibility[key as keyof typeof kk.eligibility]).toBeTruthy();
    }
  });
});

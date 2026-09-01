import { describe, expect, it } from "vitest";
import {
  actorCan,
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
  type MembershipRecord,
} from "@/domain/identity";
import {
  TRADE_ADMISSION_AUTHORIZATION,
  actorMaySubmitOrder,
  explainEligibility,
  explanationAllowsTrade,
  participantIdForActor,
  type MarketInstrument,
} from "@/domain/market-core";
import {
  DEMO_ORGANIZATIONS,
  demoMembershipForPersona,
  demoPersonaById,
  organizationById,
} from "@/data/identity/demo-catalog";
import {
  F2F_PROTOCOL_INVESTMENT_ID,
  WHEAT_INSTRUMENT_ID,
  eligibilityAssessments,
  eligibilityMatrix,
  holdings,
  instrumentById,
  marketForInstrument,
  marketInstruments,
  marketParticipants,
  shippedEligibilityRegistryInput,
} from "@/data/market-core/catalog";
import { actorMaySubmitSecondaryOrder } from "@/services/secondary-market-service";
import { engineStateFromSnapshot } from "@/services/secondary-market-repository";

const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;
const wheat = instrumentById(WHEAT_INSTRUMENT_ID)!;
const wheatMarket = marketForInstrument(WHEAT_INSTRUMENT_ID)!;
const protocolInvestment = instrumentById(F2F_PROTOCOL_INVESTMENT_ID)!;
const registry = shippedEligibilityRegistryInput();

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

function adminPrincipal() {
  return buildPrincipal({
    userId: "admin-1",
    email: "admin@example.com",
    displayName: "Admin",
    status: "ACTIVE",
    organizations: [platform],
    memberships: [
      membership({
        userId: "admin-1",
        organizationId: platform.id,
        roleIds: ["SYSTEM_ADMIN"],
      }),
    ],
  });
}

function asPersona(personaId: string): ActorContext {
  const persona = demoPersonaById(personaId)!;
  const organization = organizationById(persona.organizationId)!;
  return resolveActorContext({
    principal: adminPrincipal(),
    session: { principalUserId: "admin-1", effectiveDemoPersonaId: personaId },
    persona,
    personaOrganization: organization,
  });
}

function unimpersonatedAdmin(): ActorContext {
  return resolveActorContext({
    principal: adminPrincipal(),
    session: null,
    persona: undefined,
    personaOrganization: undefined,
  });
}

function maySubmit(actor: ActorContext, instrument: MarketInstrument = wheat): boolean {
  return actorMaySubmitOrder({
    actor,
    instrument,
    market:
      instrument.id === wheat.id
        ? wheatMarket
        : { ...wheatMarket, instrumentId: instrument.id },
    eligibility: registry.eligibility,
    assessments: registry.assessments,
    participants: registry.participants,
    organizations: registry.organizations,
    memberships: registry.memberships,
    instruments: registry.instruments,
  });
}

describe("unified TypeScript trade admission", () => {
  it("documents TypeScript precheck versus RPC authority", () => {
    expect(TRADE_ADMISSION_AUTHORIZATION).toContain("fail-closed UX/server precheck");
    expect(TRADE_ADMISSION_AUTHORIZATION).toContain("final atomic authorization");
  });

  it("allows Steppe × WHEAT when market conditions permit", () => {
    const actor = asPersona("DEMO-FUND-001");
    expect(actor.effective.roleId).toBe("INVESTOR");
    expect(participantIdForActor(actor)).toBe("INVESTOR-0001");
    expect(maySubmit(actor)).toBe(true);
    expect(actorMaySubmitSecondaryOrder(actor, wheat, wheatMarket, eligibilityMatrix)).toBe(
      true,
    );
  });

  it("allows Grain Desk × WHEAT as an organisation-level participant", () => {
    expect(maySubmit(asPersona("DEMO-TRADER-001"))).toBe(true);
  });

  it("rejects Commodity Desk × WHEAT as NOT_ASSESSED", () => {
    expect(maySubmit(asPersona("DEMO-TRADER-002"))).toBe(false);
  });

  it("rejects registrar, regulator, compliance, SCAS, producer, and issuer", () => {
    expect(maySubmit(asPersona("DEMO-REGISTRAR-001"))).toBe(false);
    expect(maySubmit(asPersona("DEMO-REGULATOR-001"))).toBe(false);
    expect(maySubmit(asPersona("DEMO-COMPLIANCE-001"))).toBe(false);
    expect(maySubmit(asPersona("DEMO-SCAS-001"))).toBe(false);
    expect(maySubmit(asPersona("DEMO-FARM-001"))).toBe(false);
    expect(maySubmit(asPersona("DEMO-ISSUER-001"))).toBe(false);
  });

  it("rejects unimpersonated SYSTEM_ADMIN and withholds market.trade", () => {
    const actor = unimpersonatedAdmin();
    expect(actor.effective.roleId).toBe("SYSTEM_ADMIN");
    expect(actorCan(actor, "market.trade")).toBe(false);
    expect(participantIdForActor(actor)).toBeNull();
    expect(maySubmit(actor)).toBe(false);
  });

  it("uses the effective investor identity when admin impersonates DEMO-FUND-001", () => {
    const actor = asPersona("DEMO-FUND-001");
    expect(actor.isImpersonating).toBe(true);
    expect(actor.effective.roleId).toBe("INVESTOR");
    expect(actor.effective.membershipId).toBe(demoMembershipForPersona("DEMO-FUND-001")?.id);
    expect(maySubmit(actor)).toBe(true);
  });

  it("rejects admin impersonating a non-eligible trader", () => {
    expect(maySubmit(asPersona("DEMO-TRADER-002"))).toBe(false);
  });

  it("rejects permission without a participant identity", () => {
    const actor = resolveActorContext({
      principal: buildPrincipal({
        userId: "inv-no-participant",
        email: "x@example.com",
        displayName: "No participant",
        status: "ACTIVE",
        organizations: [platform],
        memberships: [
          membership({
            id: demoMembershipForPersona("DEMO-ADMIN-001")?.id ?? "mem-platform",
            userId: "inv-no-participant",
            organizationId: platform.id,
            roleIds: ["INVESTOR"],
          }),
        ],
      }),
      session: null,
      persona: undefined,
      personaOrganization: undefined,
    });
    expect(actorCan(actor, "market.trade")).toBe(true);
    expect(participantIdForActor(actor)).toBeNull();
    expect(maySubmit(actor)).toBe(false);
  });

  it("rejects a participant without market.trade", () => {
    const actor = asPersona("DEMO-REGISTRAR-001");
    expect(participantIdForActor(actor)).toBe("REGISTRAR");
    expect(actorCan(actor, "market.trade")).toBe(false);
    expect(maySubmit(actor)).toBe(false);
  });

  it("rejects protocol investment and a non-existent WATER-FUTURE instrument", () => {
    const investor = asPersona("DEMO-FUND-001");
    expect(maySubmit(investor, protocolInvestment)).toBe(false);
    const unknown: MarketInstrument = { ...wheat, id: "WATER-FUTURE" };
    expect(maySubmit(investor, unknown)).toBe(false);
  });

  it("fails closed on an assessment/eligibility overlay mismatch", () => {
    const state = engineStateFromSnapshot({
      eligibility: [
        {
          participant_id: "INVESTOR-0001",
          instrument_id: WHEAT_INSTRUMENT_ID,
          state: "NOT_ASSESSED",
        },
      ],
    });
    const investor = asPersona("DEMO-FUND-001");
    expect(
      actorMaySubmitSecondaryOrder(investor, wheat, wheatMarket, state.eligibility),
    ).toBe(false);
    const explanation = explainEligibility({
      participantReference: "INVESTOR-0001",
      instrumentId: WHEAT_INSTRUMENT_ID,
      eligibility: state.eligibility,
      assessments: eligibilityAssessments,
      participants: marketParticipants,
      instruments: marketInstruments,
      organizations: DEMO_ORGANIZATIONS,
      memberships: registry.memberships,
    });
    expect(explanation.inconsistencies).toContain("ASSESSMENT_STATE_MISMATCH");
    expect(explanationAllowsTrade(explanation)).toBe(false);
  });

  it("does not mutate registered legal holdings", () => {
    const before = holdings.map((row) => ({
      holder: row.holderReference,
      owned: row.buckets.owned,
    }));
    maySubmit(asPersona("DEMO-FUND-001"));
    expect(
      holdings.map((row) => ({
        holder: row.holderReference,
        owned: row.buckets.owned,
      })),
    ).toEqual(before);
  });
});

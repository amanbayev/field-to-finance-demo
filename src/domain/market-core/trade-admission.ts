import {
  actorCan,
  type ActorContext,
  type MembershipRecord,
  type OrganizationRecord,
  type PlatformRoleId,
} from "@/domain/identity";
import { participantMayTrade } from "./actor-gate";
import { canTrade } from "./eligibility";
import {
  explainActorEligibility,
  explanationAllowsTrade,
  organizationOwnsParticipant,
  type EligibilityAssessment,
} from "./eligibility-assessment";
import { participantIdForActor } from "./participants";
import type {
  Market,
  MarketInstrument,
  MarketParticipantRecord,
  ParticipantInstrumentEligibility,
} from "./types";

/**
 * TypeScript predicate = fail-closed UX/server precheck.
 * RPC = final atomic authorization.
 *
 * This predicate never replaces `market_core_submit_limit_order`. Persistent
 * submission remains authorized only at the SQL/RPC transaction boundary.
 */
export const TRADE_ADMISSION_AUTHORIZATION =
  "TypeScript predicate = fail-closed UX/server precheck. RPC = final atomic authorization.";

export interface TradeAdmissionInput {
  readonly actor: ActorContext;
  readonly instrument: MarketInstrument;
  readonly market: Market;
  readonly eligibility: readonly ParticipantInstrumentEligibility[];
  readonly assessments: readonly EligibilityAssessment[];
  readonly participants: readonly MarketParticipantRecord[];
  readonly organizations: readonly OrganizationRecord[];
  readonly memberships: readonly MembershipRecord[];
  readonly instruments: readonly MarketInstrument[];
}

function isTradingRole(roleId: PlatformRoleId): boolean {
  return roleId === "INVESTOR" || roleId === "TRADER";
}

/**
 * Single production TypeScript admission predicate for view `canSubmit` and
 * the submit precheck. Fail-closed. Does not authorize a persistent write.
 */
export function actorMaySubmitOrder(input: TradeAdmissionInput): boolean {
  const { actor, instrument, market } = input;
  if (!isTradingRole(actor.effective.roleId)) {
    return false;
  }
  if (!actorCan(actor, "market.trade")) {
    return false;
  }
  const participantId = participantIdForActor(actor);
  if (!participantId) {
    return false;
  }
  const organization = actor.effective.organization;
  if (!organization || !organizationOwnsParticipant(organization, participantId)) {
    return false;
  }
  if (!actor.effective.membershipId) {
    return false;
  }
  const knownInstrument = input.instruments.find((item) => item.id === instrument.id);
  if (!knownInstrument) {
    return false;
  }

  const explanation = explainActorEligibility(actor, {
    participantReference: participantId,
    instrumentId: instrument.id,
    eligibility: input.eligibility,
    assessments: input.assessments,
    participants: input.participants,
    instruments: input.instruments,
    organizations: input.organizations,
    memberships: input.memberships,
  });

  if (!explanationAllowsTrade(explanation)) {
    return false;
  }
  if (
    !participantMayTrade({
      roleId: actor.effective.roleId,
      participantId,
      instrumentId: instrument.id,
      eligibility: explanation.state,
    })
  ) {
    return false;
  }
  return canTrade({
    eligibility: explanation.state,
    instrument: knownInstrument,
    market,
  });
}

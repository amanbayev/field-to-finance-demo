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
  Order,
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

/**
 * Cancellation TypeScript predicate = fail-closed UX/server precheck for
 * trading identity and order ownership. It does not re-run current instrument
 * eligibility. `market_core_cancel_order` remains the final atomic authorization.
 */
export const ORDER_CANCELLATION_AUTHORIZATION =
  "TypeScript cancellation predicate = fail-closed UX/server precheck for trading identity and order ownership. RPC = final atomic authorization. Current eligibility is not required.";

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

export interface OrderCancellationInput {
  readonly actor: ActorContext;
  readonly order: Order;
}

function isTradingRole(roleId: PlatformRoleId): boolean {
  return roleId === "INVESTOR" || roleId === "TRADER";
}

/**
 * Authenticated trading identity shared by submit admission and cancel
 * authorization. Does not inspect eligibility, attribution, overlay, or
 * instrument `canTrade`.
 */
export function actorHasAuthenticatedTradingIdentity(actor: ActorContext): boolean {
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
  return Boolean(actor.effective.membershipId);
}

/**
 * Snapshot statuses that the TypeScript cancel precheck treats as cancellable.
 * Matches `market_core_cancel_order`: not FILLED / CANCELLED / REJECTED, and
 * remaining quantity greater than zero.
 */
export function orderIsCancellable(order: Order): boolean {
  if (
    order.status === "FILLED" ||
    order.status === "CANCELLED" ||
    order.status === "REJECTED"
  ) {
    return false;
  }
  return order.remainingQuantity > 0;
}

/**
 * Identity-only cancel precheck used when the service snapshot does not contain
 * the target order. Actual ownership remains enforced by
 * `market_core_cancel_order`.
 */
export function actorMayRequestOrderCancellation(actor: ActorContext): boolean {
  return actorHasAuthenticatedTradingIdentity(actor);
}

/**
 * Order-aware TypeScript cancellation authorization. Requires authenticated
 * trading identity and that the resolved participant owns a cancellable order.
 * Does not require current eligibility, attribution, overlay equality, or the
 * instrument's new-order `canTrade` state. Does not authorize a persistent write.
 */
export function actorMayCancelOrder(input: OrderCancellationInput): boolean {
  if (!actorHasAuthenticatedTradingIdentity(input.actor)) {
    return false;
  }
  const participantId = participantIdForActor(input.actor);
  if (!participantId || input.order.participantId !== participantId) {
    return false;
  }
  return orderIsCancellable(input.order);
}

/**
 * Single production TypeScript admission predicate for view `canSubmit` and
 * the new-order submit precheck. Not used for cancellation. Fail-closed.
 * Does not authorize a persistent write.
 */
export function actorMaySubmitOrder(input: TradeAdmissionInput): boolean {
  const { actor, instrument, market } = input;
  if (!actorHasAuthenticatedTradingIdentity(actor)) {
    return false;
  }
  const participantId = participantIdForActor(actor);
  if (!participantId) {
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

import type { ActorContext } from "@/domain/identity";
import {
  actorMayCancelOrder,
  actorMaySubmitOrder,
  explainActorEligibility,
  participantIdForActor,
  type Market,
  type MarketInstrument,
  type Order,
} from "@/domain/market-core";
import { DEMO_MEMBERSHIPS, DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import {
  eligibilityAssessments,
  marketInstruments,
  marketParticipants,
} from "@/data/market-core/catalog";
import { routeById } from "@/lib/navigation/route-registry";
import { routeVisibleTo } from "@/lib/navigation/policy";
import {
  composeInvestorWorkspace,
  scopeMarketActivity,
  type InvestorWorkspaceCanonicalSource,
  type InvestorWorkspaceReadModel,
} from "@/lib/market-core/investor-workspace";
import {
  getInstrumentMarketContext,
  listEligibility,
  listHoldings,
} from "./market-core-service";
import { fetchPersistentEngineState } from "./secondary-market-repository";

function offeredStaticHref(actor: ActorContext, routeId: string): string | undefined {
  const route = routeById(routeId);
  if (!route || route.href.kind !== "STATIC") {
    return undefined;
  }
  if (!routeVisibleTo(actor, route)) {
    return undefined;
  }
  return route.href.path;
}

function productionCanonicalSource(): InvestorWorkspaceCanonicalSource {
  return {
    listHoldings,
    getInstrumentMarketContext,
    explainActorEligibility(actor, participantReference, instrumentId) {
      return explainActorEligibility(actor, {
        participantReference,
        instrumentId,
        eligibility: listEligibility(participantReference),
        assessments: eligibilityAssessments,
        participants: marketParticipants,
        instruments: marketInstruments,
        organizations: DEMO_ORGANIZATIONS,
        memberships: DEMO_MEMBERSHIPS,
      });
    },
    actorMaySubmitOrder(input: {
      actor: ActorContext;
      instrument: MarketInstrument;
      market: Market;
    }) {
      const participantId = participantIdForActor(input.actor);
      return actorMaySubmitOrder({
        actor: input.actor,
        instrument: input.instrument,
        market: input.market,
        eligibility: listEligibility(participantId ?? undefined),
        assessments: eligibilityAssessments,
        participants: marketParticipants,
        organizations: DEMO_ORGANIZATIONS,
        memberships: DEMO_MEMBERSHIPS,
        instruments: marketInstruments,
      });
    },
    actorMayCancelOrder(input: { actor: ActorContext; order: Order }) {
      return actorMayCancelOrder(input);
    },
  };
}

export function investorWorkspaceCanonicalSource(): InvestorWorkspaceCanonicalSource {
  return productionCanonicalSource();
}

/**
 * Production entry for the institutional investor workspace.
 * Holdings and eligibility come from canonical Market Core selectors.
 * Orders, reservations and executions come from the live book when it is
 * available, already scoped to the effective participant.
 */
export async function getInvestorWorkspace(
  actor: ActorContext,
): Promise<InvestorWorkspaceReadModel> {
  const canonical = productionCanonicalSource();
  const navigation = {
    secondaryHref: offeredStaticHref(actor, "secondary"),
    marketsHref: offeredStaticHref(actor, "markets"),
  };
  const participantId = participantIdForActor(actor);
  try {
    const state = await fetchPersistentEngineState();
    const activity = participantId
      ? scopeMarketActivity(
          {
            orders: state.orders,
            reservations: state.reservations,
            trades: state.trades,
            holdings: state.holdings,
          },
          participantId,
        )
      : { kind: "UNAVAILABLE" as const };
    return composeInvestorWorkspace({
      actor,
      canonical,
      activity,
      navigation,
    });
  } catch {
    return composeInvestorWorkspace({
      actor,
      canonical,
      activity: { kind: "UNAVAILABLE" },
      navigation,
    });
  }
}

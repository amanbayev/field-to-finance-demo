import type { ActorContext } from "@/domain/identity";
import {
  organizationOwnsParticipant,
  participantIdForActor,
  participantIdForOrganizationSlug,
  TRADE_STATUSES,
  availableBalance,
  type AssetProtocol,
  type EligibilityExplanation,
  type Holding,
  type HoldingBuckets,
  type Market,
  type MarketInstrument,
  type Order,
  type OrderReservation,
  type ProtocolVersion,
  type Trade,
  type TradeStatus,
} from "@/domain/market-core";
import { instrumentHref, protocolVersionHref } from "./hierarchy";
import { holdingBucketValues, type HoldingBucketValues } from "./instrument-shell";

/**
 * Institutional investor workspace read model.
 *
 * Composes existing Market Core records for one resolved participant. It is
 * not a second catalogue, wallet, cash account, valuation engine or
 * settlement-finality view. Callers inject canonical selectors and already
 * scoped activity so this module never walks an unrestricted snapshot.
 */

export const OPEN_ORDER_STATUSES = ["OPEN", "PARTIALLY_FILLED"] as const;

export const ATTENTION_RESERVATION_STATUSES = [
  "ACTIVE",
  "HELD_PENDING_SETTLEMENT",
] as const;

export const WORKSPACE_SCOPE_REASONS = [
  "UNIMPERSONATED_ADMIN",
  "MISSING_ORGANIZATION",
  "MISSING_MEMBERSHIP",
  "NO_PARTICIPANT",
  "INCONSISTENT_ATTRIBUTION",
] as const;

export type InvestorWorkspaceScopeReason = (typeof WORKSPACE_SCOPE_REASONS)[number];

export type InvestorWorkspaceScope =
  | { readonly kind: "DENIED"; readonly reason: InvestorWorkspaceScopeReason }
  | {
      readonly kind: "SCOPED";
      readonly participantId: string;
      readonly organizationName: string;
      readonly membershipId: string;
    };

export interface InvestorWorkspaceCanonicalSource {
  listHoldings(filters: { holderReference: string }): readonly Holding[];
  getInstrumentMarketContext(instrumentId: string): {
    instrument: MarketInstrument;
    protocol: AssetProtocol | null;
    market: Market | null;
    protocolVersion: ProtocolVersion | null;
  } | null;
  explainActorEligibility(
    actor: ActorContext,
    participantReference: string,
    instrumentId: string,
  ): EligibilityExplanation;
  actorMaySubmitOrder(input: {
    actor: ActorContext;
    instrument: MarketInstrument;
    market: Market;
  }): boolean;
  actorMayCancelOrder(input: { actor: ActorContext; order: Order }): boolean;
}

export interface InvestorWorkspaceActivity {
  readonly kind: "AVAILABLE";
  readonly orders: readonly Order[];
  readonly reservations: readonly OrderReservation[];
  readonly trades: readonly Trade[];
  readonly workingHoldings: readonly Holding[];
}

export type InvestorWorkspaceActivitySource =
  | InvestorWorkspaceActivity
  | { readonly kind: "UNAVAILABLE" };

export interface InvestorWorkspaceNavigation {
  readonly secondaryHref: string | undefined;
  readonly marketsHref: string | undefined;
}

export interface WorkspaceHoldingRow {
  readonly holdingId: string;
  readonly instrumentId: string;
  readonly instrumentSymbol: string;
  readonly instrumentHref: string;
  readonly protocolVersionId: string | null;
  readonly protocolVersionHref: string | undefined;
  readonly buckets: HoldingBucketValues;
}

export interface WorkspaceProtocolGroup {
  readonly protocolId: string;
  readonly protocolName: string;
  readonly instruments: readonly WorkspaceHoldingRow[];
}

export interface WorkspaceEligibilityRow {
  readonly instrumentId: string;
  readonly instrumentSymbol: string;
  readonly instrumentHref: string;
  readonly explanation: EligibilityExplanation;
  readonly canSubmitNewOrder: boolean;
  readonly cancellationIndependentOfEligibility: true;
}

export interface WorkspaceReservationLink {
  readonly id: string;
  readonly status: OrderReservation["status"];
  readonly kind: OrderReservation["kind"];
  readonly quantity: number;
}

export interface WorkspaceOrderRow {
  readonly id: string;
  readonly instrumentId: string;
  readonly instrumentSymbol: string;
  readonly instrumentHref: string;
  readonly side: Order["side"];
  readonly limitPrice: number;
  readonly originalQuantity: number;
  readonly remainingQuantity: number;
  readonly status: Order["status"];
  readonly reservation: WorkspaceReservationLink | null;
  readonly mayCancel: boolean;
}

export interface WorkspaceExecutionRow {
  readonly id: string;
  readonly instrumentId: string;
  readonly instrumentSymbol: string;
  readonly instrumentHref: string;
  readonly quantity: number;
  readonly price: number;
  readonly createdAt: string;
  readonly status: TradeStatus;
  readonly kind: Trade["kind"];
}

export interface WorkspaceLifecycleCount {
  readonly status: TradeStatus;
  readonly count: number;
}

export type WorkspaceActivityOverview =
  | {
      readonly kind: "AVAILABLE";
      readonly openOrderCount: number;
      readonly reservationsRequiringAttention: number;
      readonly executionsByLifecycle: readonly WorkspaceLifecycleCount[];
    }
  | {
      readonly kind: "UNAVAILABLE";
    };

export interface WorkspaceOverview {
  readonly instrumentCount: number;
  readonly protocolCount: number;
  readonly activity: WorkspaceActivityOverview;
}

export type HoldingsProvenance =
  | "CANONICAL_REGISTER"
  | "CANONICAL_WITH_WORKING_OVERLAY";

export type ActivityProvenance = "LIVE_BOOK" | "UNAVAILABLE";

export interface InvestorWorkspaceDenied {
  readonly kind: "DENIED";
  readonly reason: InvestorWorkspaceScopeReason;
}

export interface InvestorWorkspaceReady {
  readonly kind: "WORKSPACE";
  readonly participantId: string;
  readonly organizationName: string;
  readonly membershipId: string;
  readonly holdingsProvenance: HoldingsProvenance;
  readonly activityProvenance: ActivityProvenance;
  readonly overview: WorkspaceOverview;
  readonly protocolGroups: readonly WorkspaceProtocolGroup[];
  readonly eligibility: readonly WorkspaceEligibilityRow[];
  readonly orders: readonly WorkspaceOrderRow[] | { readonly unavailable: true };
  readonly executions: readonly WorkspaceExecutionRow[] | { readonly unavailable: true };
  readonly secondaryHref: string | undefined;
  readonly marketsHref: string | undefined;
}

export type InvestorWorkspaceReadModel = InvestorWorkspaceDenied | InvestorWorkspaceReady;

export interface ComposeInvestorWorkspaceInput {
  readonly actor: ActorContext;
  readonly canonical: InvestorWorkspaceCanonicalSource;
  readonly activity: InvestorWorkspaceActivitySource;
  readonly navigation: InvestorWorkspaceNavigation;
}

const ACTIVITY_UNAVAILABLE = Object.freeze({ unavailable: true as const });

/**
 * Resolve the effective participant for an investor workspace.
 *
 * Unimpersonated administrators have no participant identity. Impersonation
 * uses `actor.effective`, not the principal administrator record. Missing or
 * inconsistent organisation / membership / participant attribution fails closed.
 */
export function resolveInvestorWorkspaceScope(
  actor: ActorContext,
): InvestorWorkspaceScope {
  if (actor.effective.roleId === "SYSTEM_ADMIN" && !actor.isImpersonating) {
    return Object.freeze({ kind: "DENIED", reason: "UNIMPERSONATED_ADMIN" });
  }
  const organization = actor.effective.organization;
  if (!organization) {
    return Object.freeze({ kind: "DENIED", reason: "MISSING_ORGANIZATION" });
  }
  if (!actor.effective.membershipId) {
    return Object.freeze({ kind: "DENIED", reason: "MISSING_MEMBERSHIP" });
  }
  const participantId = participantIdForActor(actor);
  if (!participantId) {
    return Object.freeze({ kind: "DENIED", reason: "NO_PARTICIPANT" });
  }
  const fromSlug = participantIdForOrganizationSlug(organization.slug);
  const fromRef = actor.effective.investorReference ?? null;
  if (fromRef && fromSlug && fromRef !== fromSlug) {
    return Object.freeze({ kind: "DENIED", reason: "INCONSISTENT_ATTRIBUTION" });
  }
  if (!organizationOwnsParticipant(organization, participantId)) {
    return Object.freeze({ kind: "DENIED", reason: "INCONSISTENT_ATTRIBUTION" });
  }
  return Object.freeze({
    kind: "SCOPED",
    participantId,
    organizationName: organization.name,
    membershipId: actor.effective.membershipId,
  });
}

/**
 * Keep only records attributed to `participantId`. Rows with missing
 * participant attribution are dropped (fail closed), never reassigned.
 */
export function scopeMarketActivity(
  input: {
    readonly orders: readonly Order[];
    readonly reservations: readonly OrderReservation[];
    readonly trades: readonly Trade[];
    readonly holdings: readonly Holding[];
  },
  participantId: string,
): InvestorWorkspaceActivity {
  if (!participantId) {
    return Object.freeze({
      kind: "AVAILABLE",
      orders: Object.freeze([]),
      reservations: Object.freeze([]),
      trades: Object.freeze([]),
      workingHoldings: Object.freeze([]),
    });
  }
  return Object.freeze({
    kind: "AVAILABLE",
    orders: Object.freeze(
      input.orders.filter((order) => order.participantId === participantId),
    ),
    reservations: Object.freeze(
      input.reservations.filter(
        (reservation) => reservation.participantId === participantId,
      ),
    ),
    trades: Object.freeze(
      input.trades.filter(
        (trade) =>
          trade.buyerParticipantId === participantId ||
          trade.sellerParticipantId === participantId,
      ),
    ),
    workingHoldings: Object.freeze(
      input.holdings.filter((holding) => holding.holderReference === participantId),
    ),
  });
}

function boundProtocolVersion(
  instrument: MarketInstrument,
  protocolVersion: ProtocolVersion | null,
): ProtocolVersion | null {
  if (!instrument.protocolVersionId || !protocolVersion) {
    return null;
  }
  if (protocolVersion.id !== instrument.protocolVersionId) {
    return null;
  }
  if (protocolVersion.protocolId !== instrument.assetProtocolId) {
    return null;
  }
  return protocolVersion;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function canApplyOperationalOverlay(
  owned: number,
  overlay: Pick<HoldingBuckets, "reservedForOrders" | "pledged" | "blocked">,
): boolean {
  if (
    !isNonNegativeInteger(owned) ||
    !isNonNegativeInteger(overlay.reservedForOrders) ||
    !isNonNegativeInteger(overlay.pledged) ||
    !isNonNegativeInteger(overlay.blocked)
  ) {
    return false;
  }
  return (
    owned - overlay.reservedForOrders - overlay.pledged - overlay.blocked >= 0
  );
}

function overlayWorkingBuckets(
  legal: readonly Holding[],
  working: readonly Holding[],
): Holding[] {
  return legal.map((holding) => {
    const match = working.find(
      (row) =>
        row.holderReference === holding.holderReference &&
        row.instrumentId === holding.instrumentId,
    );
    if (!match) {
      return holding;
    }
    if (!canApplyOperationalOverlay(holding.buckets.owned, match.buckets)) {
      return holding;
    }
    const buckets: HoldingBuckets = {
      owned: holding.buckets.owned,
      reservedForOrders: match.buckets.reservedForOrders,
      pledged: match.buckets.pledged,
      blocked: match.buckets.blocked,
      pendingIn: holding.buckets.pendingIn,
      pendingOut: holding.buckets.pendingOut,
    };
    return freezeRow({
      id: holding.id,
      instrumentId: holding.instrumentId,
      holderReference: holding.holderReference,
      holderName: holding.holderName,
      buckets: freezeRow({ ...buckets }),
      available: availableBalance(buckets),
    });
  });
}

function isOpenOrder(order: Order): boolean {
  return (OPEN_ORDER_STATUSES as readonly string[]).includes(order.status);
}

function reservationNeedsAttention(reservation: OrderReservation): boolean {
  return (ATTENTION_RESERVATION_STATUSES as readonly string[]).includes(
    reservation.status,
  );
}

function freezeRow<T extends object>(row: T): T {
  return Object.freeze(row);
}

/**
 * Pure workspace composition. Does not fetch, persist, value holdings, or
 * recalculate eligibility. Instrument identity stays with the injected
 * `getInstrumentMarketContext`. Holdings arithmetic stays with canonical
 * buckets / `availableBalance`.
 */
export function composeInvestorWorkspace(
  input: ComposeInvestorWorkspaceInput,
): InvestorWorkspaceReadModel {
  const scope = resolveInvestorWorkspaceScope(input.actor);
  if (scope.kind === "DENIED") {
    return Object.freeze({ kind: "DENIED", reason: scope.reason });
  }

  const legalHoldings = input.canonical.listHoldings({
    holderReference: scope.participantId,
  });
  const activityAvailable = input.activity.kind === "AVAILABLE";
  const holdings = activityAvailable
    ? overlayWorkingBuckets(legalHoldings, input.activity.workingHoldings)
    : [...legalHoldings];

  const protocolGroups: WorkspaceProtocolGroup[] = [];
  const eligibility: WorkspaceEligibilityRow[] = [];
  const seenInstruments = new Set<string>();

  for (const holding of holdings) {
    if (holding.holderReference !== scope.participantId) {
      continue;
    }
    const context = input.canonical.getInstrumentMarketContext(holding.instrumentId);
    if (!context?.instrument || !context.protocol) {
      continue;
    }
    const { instrument, protocol, market } = context;
    if (instrument.assetProtocolId !== protocol.id) {
      continue;
    }
    const protocolVersion = boundProtocolVersion(instrument, context.protocolVersion);
    const buckets = holdingBucketValues(holding);
    const href = instrumentHref(instrument.id);

    let group = protocolGroups.find((item) => item.protocolId === protocol.id);
    if (!group) {
      group = {
        protocolId: protocol.id,
        protocolName: protocol.name,
        instruments: [],
      };
      protocolGroups.push(group);
    }
    (group.instruments as WorkspaceHoldingRow[]).push(
      freezeRow({
        holdingId: holding.id,
        instrumentId: instrument.id,
        instrumentSymbol: instrument.symbol,
        instrumentHref: href,
        protocolVersionId: protocolVersion ? protocolVersion.id : null,
        protocolVersionHref: protocolVersion
          ? protocolVersionHref(protocol.id, protocolVersion.id)
          : undefined,
        buckets: Object.freeze({ ...buckets }),
      }),
    );

    if (!seenInstruments.has(instrument.id)) {
      seenInstruments.add(instrument.id);
      const explanation = input.canonical.explainActorEligibility(
        input.actor,
        scope.participantId,
        instrument.id,
      );
      const canSubmitNewOrder = market
        ? input.canonical.actorMaySubmitOrder({
            actor: input.actor,
            instrument,
            market,
          })
        : false;
      eligibility.push(
        freezeRow({
          instrumentId: instrument.id,
          instrumentSymbol: instrument.symbol,
          instrumentHref: href,
          explanation,
          canSubmitNewOrder,
          cancellationIndependentOfEligibility: true as const,
        }),
      );
    }
  }

  const frozenGroups = Object.freeze(
    protocolGroups.map((group) =>
      freezeRow({
        protocolId: group.protocolId,
        protocolName: group.protocolName,
        instruments: Object.freeze([...group.instruments]),
      }),
    ),
  );

  let orders: InvestorWorkspaceReady["orders"] = ACTIVITY_UNAVAILABLE;
  let executions: InvestorWorkspaceReady["executions"] = ACTIVITY_UNAVAILABLE;
  let activityOverview: WorkspaceActivityOverview = freezeRow({
    kind: "UNAVAILABLE" as const,
  });

  if (activityAvailable) {
    const scopedOrders = input.activity.orders.filter(
      (order) => order.participantId === scope.participantId && isOpenOrder(order),
    );
    const scopedReservations = input.activity.reservations.filter(
      (reservation) => reservation.participantId === scope.participantId,
    );
    const scopedTrades = input.activity.trades.filter(
      (trade) =>
        trade.buyerParticipantId === scope.participantId ||
        trade.sellerParticipantId === scope.participantId,
    );
    activityOverview = freezeRow({
      kind: "AVAILABLE" as const,
      openOrderCount: scopedOrders.length,
      reservationsRequiringAttention: scopedReservations.filter(
        reservationNeedsAttention,
      ).length,
      executionsByLifecycle: Object.freeze(
        TRADE_STATUSES.map((status) =>
          freezeRow({
            status,
            count: scopedTrades.filter((trade) => trade.status === status).length,
          }),
        ),
      ),
    });

    orders = Object.freeze(
      scopedOrders.map((order) => {
        const context = input.canonical.getInstrumentMarketContext(order.instrumentId);
        const instrument = context?.instrument;
        const reservation = scopedReservations.find(
          (item) => item.orderId === order.id && item.participantId === scope.participantId,
        );
        return freezeRow({
          id: order.id,
          instrumentId: order.instrumentId,
          instrumentSymbol: instrument?.symbol ?? order.instrumentId,
          instrumentHref: instrumentHref(order.instrumentId),
          side: order.side,
          limitPrice: order.price,
          originalQuantity: order.originalQuantity,
          remainingQuantity: order.remainingQuantity,
          status: order.status,
          reservation: reservation
            ? freezeRow({
                id: reservation.id,
                status: reservation.status,
                kind: reservation.kind,
                quantity: reservation.quantity,
              })
            : null,
          mayCancel: input.canonical.actorMayCancelOrder({
            actor: input.actor,
            order,
          }),
        });
      }),
    );

    executions = Object.freeze(
      [...scopedTrades]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .map((trade) => {
          const context = input.canonical.getInstrumentMarketContext(trade.instrumentId);
          return freezeRow({
            id: trade.id,
            instrumentId: trade.instrumentId,
            instrumentSymbol: context?.instrument.symbol ?? trade.instrumentId,
            instrumentHref: instrumentHref(trade.instrumentId),
            quantity: trade.quantity,
            price: trade.price,
            createdAt: trade.createdAt,
            status: trade.status,
            kind: trade.kind,
          });
        }),
    );
  }

  const overview = freezeRow({
    instrumentCount: seenInstruments.size,
    protocolCount: frozenGroups.length,
    activity: activityOverview,
  });

  return Object.freeze({
    kind: "WORKSPACE",
    participantId: scope.participantId,
    organizationName: scope.organizationName,
    membershipId: scope.membershipId,
    holdingsProvenance: activityAvailable
      ? "CANONICAL_WITH_WORKING_OVERLAY"
      : "CANONICAL_REGISTER",
    activityProvenance: activityAvailable ? "LIVE_BOOK" : "UNAVAILABLE",
    overview,
    protocolGroups: frozenGroups,
    eligibility: Object.freeze(eligibility),
    orders,
    executions,
    secondaryHref: input.navigation.secondaryHref,
    marketsHref: input.navigation.marketsHref,
  });
}

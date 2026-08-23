import { createServerSupabaseClient } from "@/lib/auth/supabase/server";
import { isAuthConfigured } from "@/lib/auth/env";
import {
  availableBalance,
  WHEAT_DEMO_MARKET_ID,
  type EngineState,
  type Holding,
  type Market,
  type MarketEvent,
  type Order,
  type OrderReservation,
  type Settlement,
  type SettlementAccount,
  type Trade,
} from "@/domain/market-core";
import {
  eligibilityMatrix,
  holdings as catalogHoldings,
  marketInstruments,
  markets as catalogMarkets,
  settlements as catalogSettlements,
} from "@/data/market-core/catalog";

interface SnapshotPayload {
  ok?: boolean;
  error?: string;
  registeredOwnership?: Array<Record<string, unknown>>;
  markets?: Array<Record<string, unknown>>;
  eligibility?: Array<Record<string, unknown>>;
  holdings?: Array<Record<string, unknown>>;
  settlementAccounts?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  reservations?: Array<Record<string, unknown>>;
  trades?: Array<Record<string, unknown>>;
  settlements?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

function str(value: unknown): string {
  return String(value ?? "");
}

function mapMarket(row: Record<string, unknown>): Market {
  const catalog = catalogMarkets[0]!;
  return {
    ...catalog,
    id: str(row.id ?? catalog.id),
    instrumentId: str(row.instrument_id ?? catalog.instrumentId),
    phase: "SECONDARY_OPEN",
    transacting: Boolean(row.transacting ?? true),
    matchingEnabled: Boolean(row.matching_enabled ?? true),
    settlementEnabled: Boolean(row.settlement_enabled ?? false),
    demonstratorStatus: row.demonstrator_status === "DEMO_CLOSED" ? "DEMO_CLOSED" : "DEMO_OPEN",
  };
}

function mapHolding(row: Record<string, unknown>): Holding {
  const buckets = {
    owned: num(row.owned),
    reservedForOrders: num(row.reserved_for_orders),
    pledged: num(row.pledged),
    blocked: num(row.blocked),
    pendingIn: num(row.pending_in),
    pendingOut: num(row.pending_out),
  };
  return {
    id: str(row.id),
    instrumentId: str(row.instrument_id),
    holderReference: str(row.participant_id),
    holderName: str(row.holder_name),
    buckets,
    available: availableBalance(buckets),
  };
}

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: str(row.id),
    marketId: str(row.market_id),
    instrumentId: str(row.instrument_id),
    participantId: str(row.participant_id),
    side: row.side === "BUY" ? "BUY" : "SELL",
    orderType: "LIMIT",
    price: num(row.price),
    originalQuantity: num(row.original_quantity),
    remainingQuantity: num(row.remaining_quantity),
    filledQuantity: num(row.filled_quantity),
    status:
      row.status === "PARTIALLY_FILLED"
        ? "PARTIALLY_FILLED"
        : row.status === "FILLED"
          ? "FILLED"
          : row.status === "CANCELLED"
            ? "CANCELLED"
            : row.status === "REJECTED"
              ? "REJECTED"
              : "OPEN",
    sequence: num(row.sequence),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    sourceChannel: "DIRECT_MTP",
    rejectReason: row.reject_reason ? str(row.reject_reason) : undefined,
  };
}

function mapReservation(row: Record<string, unknown>): OrderReservation {
  return {
    id: str(row.id),
    orderId: str(row.order_id),
    marketId: str(row.market_id),
    instrumentId: str(row.instrument_id),
    participantId: str(row.participant_id),
    kind: row.kind === "SETTLEMENT" ? "SETTLEMENT" : "ASSET",
    quantity: num(row.quantity),
    status:
      row.status === "RELEASED"
        ? "RELEASED"
        : row.status === "HELD_PENDING_SETTLEMENT"
          ? "HELD_PENDING_SETTLEMENT"
          : "ACTIVE",
  };
}

function mapTrade(row: Record<string, unknown>): Trade {
  const status = str(row.status);
  return {
    id: str(row.id),
    marketId: str(row.market_id),
    instrumentId: str(row.instrument_id),
    buyOrderId: str(row.buy_order_id),
    sellOrderId: str(row.sell_order_id),
    buyerParticipantId: str(row.buyer_participant_id),
    sellerParticipantId: str(row.seller_participant_id),
    quantity: num(row.quantity),
    price: num(row.price),
    notional: num(row.notional),
    status:
      status === "MATCHED"
        ? "MATCHED"
        : status === "CLEARING_READY"
          ? "CLEARING_READY"
          : "AWAITING_DEVNET_SETTLEMENT",
    kind: "SECONDARY",
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    eligibilityRecheckPassed: Boolean(row.eligibility_recheck_passed),
    dvpStatus: "PENDING",
    registryUpdateStatus: "PENDING",
    finalSettlementStatus: "PENDING",
  };
}

function mapSettlement(row: Record<string, unknown>): Settlement {
  const status = str(row.status);
  return {
    id: str(row.id),
    tradeId: str(row.trade_id),
    status:
      status === "FINAL" || status === "SETTLED"
        ? "FINAL"
        : status === "DVP_COMPLETE" || status === "CHAIN_CONFIRMED"
          ? "DVP_COMPLETE"
          : "RESERVED",
    evidenceLabel: row.evidence_label ? "PRIMARY_PLACEMENT_EVIDENCE" : null,
    kind: row.kind === "PRIMARY" ? "PRIMARY" : "SECONDARY",
  };
}

function mapEvent(row: Record<string, unknown>): MarketEvent {
  return {
    id: str(row.id),
    timestamp: str(row.occurred_at),
    actor: str(row.actor),
    participantId: row.participant_id ? str(row.participant_id) : null,
    instrumentId: str(row.instrument_id),
    marketId: str(row.market_id),
    entityId: str(row.entity_id),
    type: (str(row.event_type) as MarketEvent["type"]) || "order_submitted",
    metadata: (row.metadata as MarketEvent["metadata"]) ?? {},
  };
}

function mapAccount(row: Record<string, unknown>): SettlementAccount {
  return {
    participantId: str(row.participant_id),
    assetId: str(row.asset_id),
    available: num(row.available),
    reserved: num(row.reserved),
  };
}

export function engineStateFromSnapshot(payload: SnapshotPayload): EngineState {
  const dbHoldings = (payload.holdings ?? []).map(mapHolding);
  const registeredOwned = new Map(
    (payload.registeredOwnership ?? []).map((row) => [
      `${str(row.participant_id)}:${str(row.instrument_id)}`,
      num(row.registered_quantity),
    ]),
  );
  const holdings =
    dbHoldings.length > 0
      ? catalogHoldings.map((legal) => {
          const working = dbHoldings.find(
            (row) =>
              row.holderReference === legal.holderReference &&
              row.instrumentId === legal.instrumentId,
          );
          const registrarOwned = registeredOwned.get(
            `${legal.holderReference}:${legal.instrumentId}`,
          );
          if (!working && registrarOwned === undefined) {
            return legal;
          }
          const buckets = {
            ...legal.buckets,
            owned: registrarOwned ?? legal.buckets.owned,
            reservedForOrders: working?.buckets.reservedForOrders ?? legal.buckets.reservedForOrders,
            pendingIn: working?.buckets.pendingIn ?? legal.buckets.pendingIn,
            pendingOut: working?.buckets.pendingOut ?? legal.buckets.pendingOut,
            pledged: working?.buckets.pledged ?? legal.buckets.pledged,
            blocked: working?.buckets.blocked ?? legal.buckets.blocked,
          };
          return { ...legal, buckets, available: availableBalance(buckets) };
        })
      : catalogHoldings;
  const dbMarkets = (payload.markets ?? []).map(mapMarket);
  const dbSettlements = (payload.settlements ?? []).map(mapSettlement);
  const primary = catalogSettlements.filter((item) => item.kind === "PRIMARY");
  return {
    now: new Date().toISOString(),
    nextOrderSeq: 0,
    nextOrderId: 0,
    nextTradeId: 0,
    nextReservationId: 0,
    nextSettlementId: 0,
    nextEventId: 0,
    markets: dbMarkets.length > 0 ? dbMarkets : catalogMarkets,
    instruments: marketInstruments,
    orders: (payload.orders ?? []).map(mapOrder),
    reservations: (payload.reservations ?? []).map(mapReservation),
    trades: (payload.trades ?? []).map(mapTrade),
    settlements: [...primary, ...dbSettlements.filter((item) => item.kind === "SECONDARY")],
    holdings,
    eligibility: eligibilityMatrix.map((row) => {
      const remote = (payload.eligibility ?? []).find(
        (item) =>
          str(item.participant_id) === row.participantReference &&
          str(item.instrument_id) === row.instrumentId,
      );
      if (!remote) {
        return row;
      }
      const state = str(remote.state);
      return {
        ...row,
        state:
          state === "ELIGIBLE"
            ? "ELIGIBLE"
            : state === "NOT_ELIGIBLE"
              ? "NOT_ELIGIBLE"
              : state === "POLICY_PENDING"
                ? "POLICY_PENDING"
                : "NOT_ASSESSED",
      };
    }),
    settlementAccounts: (payload.settlementAccounts ?? []).map(mapAccount),
    events: (payload.events ?? []).map(mapEvent),
  };
}

export async function fetchPersistentEngineState(): Promise<EngineState> {
  if (!isAuthConfigured()) {
    throw new Error("MARKET_CORE_UNAVAILABLE");
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    throw new Error("MARKET_CORE_UNAVAILABLE");
  }
  const { data, error } = await supabase.rpc("market_core_snapshot");
  if (error || !data || (data as SnapshotPayload).ok === false) {
    throw new Error((data as SnapshotPayload)?.error ?? error?.message ?? "MARKET_CORE_UNAVAILABLE");
  }
  return engineStateFromSnapshot(data as SnapshotPayload);
}

export async function rpcSubmitLimitOrder(input: {
  side: "BUY" | "SELL";
  price: number;
  quantity: number;
  idempotencyKey: string;
  marketId?: string;
}): Promise<{ ok: boolean; error: string | null; orderId?: string }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "MARKET_CORE_UNAVAILABLE" };
  }
  const { data, error } = await supabase.rpc("market_core_submit_limit_order", {
    p_market_id: input.marketId ?? WHEAT_DEMO_MARKET_ID,
    p_side: input.side,
    p_price: input.price,
    p_quantity: input.quantity,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  const payload = data as { ok?: boolean; error?: string | null; orderId?: string };
  return { ok: Boolean(payload.ok), error: payload.error ?? null, orderId: payload.orderId };
}

export async function rpcCancelOrder(input: {
  orderId: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "MARKET_CORE_UNAVAILABLE" };
  }
  const { data, error } = await supabase.rpc("market_core_cancel_order", {
    p_order_id: input.orderId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  const payload = data as { ok?: boolean; error?: string | null };
  return { ok: Boolean(payload.ok), error: payload.error ?? null };
}

export async function rpcReconcileWheat(): Promise<{
  ok: boolean;
  source?: string;
  proofSource?: string;
  chainTruth?: boolean;
  rows: Array<{
    participantId: string;
    holderName: string;
    registeredOwned: number;
    chainBalance: number | null;
    chainBalancePresent?: boolean;
    pendingIn: number;
    pendingOut: number;
    proofSource?: string;
    exception: boolean;
  }>;
} | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.rpc("market_core_reconcile_wheat");
  if (error || !data) {
    return null;
  }
  const payload = data as {
    ok: boolean;
    source?: string;
    proofSource?: string;
    chainTruth?: boolean;
    rows: Array<{
      participantId: string;
      holderName: string;
      registeredOwned: number;
      chainBalance: number | null;
      chainBalancePresent?: boolean;
      pendingIn: number;
      pendingOut: number;
      proofSource?: string;
      exception: boolean;
    }>;
  };
  return {
    ...payload,
    source: payload.source ?? payload.proofSource ?? "CACHED_PROOF",
    chainTruth: payload.chainTruth ?? false,
  };
}

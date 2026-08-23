import { describe, expect, it } from "vitest";
import { engineStateFromSnapshot } from "@/services/secondary-market-repository";
import { overlayWorkingHoldings } from "@/services/secondary-market-service";
import { STEPPE_CAPITAL_ID, GRAIN_DESK_ID } from "@/domain/market-core";
import { holdings as catalogHoldings } from "@/data/market-core/catalog";

describe("persistent market snapshot mapping", () => {
  it("maps the seeded secondary scenario without changing legal owned amounts", () => {
    const state = engineStateFromSnapshot({
      ok: true,
      holdings: [
        {
          id: "hld-registrar-wheat",
          instrument_id: "WHEAT-2027",
          participant_id: "REGISTRAR",
          holder_name: "Agricultural Registrar",
          owned: 990,
          reserved_for_orders: 0,
          pledged: 0,
          blocked: 0,
          pending_in: 0,
          pending_out: 0,
        },
        {
          id: "hld-steppe-wheat",
          instrument_id: "WHEAT-2027",
          participant_id: "INVESTOR-0001",
          holder_name: "Steppe Capital",
          owned: 10,
          reserved_for_orders: 2,
          pledged: 0,
          blocked: 0,
          pending_in: 0,
          pending_out: 2,
        },
        {
          id: "hld-grain-desk-wheat",
          instrument_id: "WHEAT-2027",
          participant_id: "GRAIN-DESK",
          holder_name: "Grain Desk",
          owned: 0,
          reserved_for_orders: 0,
          pledged: 0,
          blocked: 0,
          pending_in: 2,
          pending_out: 0,
        },
      ],
      orders: [
        {
          id: "ORD-SEED-SELL-001",
          market_id: "MKT-WHEAT-2027-DEMO-KZT",
          instrument_id: "WHEAT-2027",
          participant_id: "INVESTOR-0001",
          side: "SELL",
          price: 105000,
          original_quantity: 2,
          remaining_quantity: 0,
          filled_quantity: 2,
          status: "FILLED",
          sequence: 1,
          created_at: "2026-08-23T10:00:00Z",
          updated_at: "2026-08-23T10:01:00Z",
        },
        {
          id: "ORD-SEED-BUY-001",
          market_id: "MKT-WHEAT-2027-DEMO-KZT",
          instrument_id: "WHEAT-2027",
          participant_id: "GRAIN-DESK",
          side: "BUY",
          price: 105000,
          original_quantity: 2,
          remaining_quantity: 0,
          filled_quantity: 2,
          status: "FILLED",
          sequence: 2,
          created_at: "2026-08-23T10:01:00Z",
          updated_at: "2026-08-23T10:01:00Z",
        },
      ],
      trades: [
        {
          id: "TRD-SEED-001",
          market_id: "MKT-WHEAT-2027-DEMO-KZT",
          instrument_id: "WHEAT-2027",
          buy_order_id: "ORD-SEED-BUY-001",
          sell_order_id: "ORD-SEED-SELL-001",
          buyer_participant_id: "GRAIN-DESK",
          seller_participant_id: "INVESTOR-0001",
          quantity: 2,
          price: 105000,
          notional: 210000,
          status: "AWAITING_DEVNET_SETTLEMENT",
          eligibility_recheck_passed: true,
          created_at: "2026-08-23T10:01:00Z",
          updated_at: "2026-08-23T10:01:00Z",
        },
      ],
      settlements: [
        {
          id: "SET-SEED-001",
          trade_id: "TRD-SEED-001",
          status: "AWAITING_DEVNET_SETTLEMENT",
          kind: "SECONDARY",
        },
      ],
    });

    const steppe = state.holdings.find((row) => row.holderReference === STEPPE_CAPITAL_ID)!;
    const grain = state.holdings.find((row) => row.holderReference === GRAIN_DESK_ID)!;
    const registrar = state.holdings.find((row) => row.holderReference === "REGISTRAR")!;
    expect(registrar.buckets.owned).toBe(990);
    expect(steppe.buckets.owned).toBe(10);
    expect(steppe.buckets.pendingOut).toBe(2);
    expect(grain.buckets.owned).toBe(0);
    expect(grain.buckets.pendingIn).toBe(2);
    expect(state.orders.every((order) => order.status === "FILLED")).toBe(true);
    expect(state.trades[0]?.quantity).toBe(2);
    expect(state.trades[0]?.notional).toBe(210000);
    expect(state.settlements.some((item) => item.kind === "SECONDARY")).toBe(true);
  });

  it("overlays working reserved/pending fields without rewriting legal owned", () => {
    const state = engineStateFromSnapshot({
      ok: true,
      holdings: [
        {
          id: "hld-steppe-wheat",
          instrument_id: "WHEAT-2027",
          participant_id: "INVESTOR-0001",
          holder_name: "Steppe Capital",
          owned: 10,
          reserved_for_orders: 2,
          pledged: 0,
          blocked: 0,
          pending_in: 0,
          pending_out: 2,
        },
      ],
    });
    const overlay = overlayWorkingHoldings(catalogHoldings, state);
    const steppe = overlay.find((row) => row.holderReference === STEPPE_CAPITAL_ID)!;
    expect(steppe.buckets.owned).toBe(10);
    expect(steppe.buckets.reservedForOrders).toBe(2);
    expect(steppe.buckets.pendingOut).toBe(2);
  });

  it("takes legal owned from the registrar book, not from holdings.owned", () => {
    const state = engineStateFromSnapshot({
      ok: true,
      registeredOwnership: [
        {
          instrument_id: "WHEAT-2027",
          participant_id: "INVESTOR-0001",
          registered_quantity: 10,
        },
      ],
      holdings: [
        {
          id: "hld-steppe-wheat",
          instrument_id: "WHEAT-2027",
          participant_id: "INVESTOR-0001",
          holder_name: "Steppe Capital",
          owned: 99,
          reserved_for_orders: 2,
          pledged: 0,
          blocked: 0,
          pending_in: 0,
          pending_out: 2,
        },
      ],
    });
    const overlay = overlayWorkingHoldings(catalogHoldings, state);
    const steppe = overlay.find((row) => row.holderReference === STEPPE_CAPITAL_ID)!;
    expect(steppe.buckets.owned).toBe(10);
    expect(steppe.buckets.reservedForOrders).toBe(2);
  });
});

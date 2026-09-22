import { describe, expect, it } from "vitest";
import { engineStateFromSnapshot } from "@/services/secondary-market-repository";
import { markets, marketInstruments, holdings, settlements } from "@/data/market-core/catalog";

const legacy = {
  id: markets[0]!.id, instrument_id: markets[0]!.instrumentId,
  instrument_ref: null, book_key: null,
};
const modern = {
  id: "arbitrary-market", instrument_id: "arbitrary-instrument", instrument_ref: "arbitrary-instrument",
  book_key: "PRIMARY", phase: "CLOSED", settlement_asset_id: "DEMO-KZT", symbol: "WHEAT-2027", run_id: null,
};

describe("MC-04 authoritative legacy read boundary", () => {
  it("preserves the supported legacy demo and its explicit catalog overlays", () => {
    const state = engineStateFromSnapshot({ markets: [legacy] });
    expect(state.markets).toEqual(markets);
    expect(state.instruments).toEqual(marketInstruments);
    expect(state.holdings).toEqual(holdings);
    expect(state.settlements).toEqual(settlements);
  });

  it.each(["run-a", "run-b", null])("excludes modern context %s despite identical symbol/quote", (run) => {
    const state = engineStateFromSnapshot({ markets: [legacy, { ...modern, run_id: run }] });
    expect(state.markets).toEqual(markets);
    expect(state.instruments.some(i => i.id === modern.instrument_ref)).toBe(false);
    expect(state.holdings.some(i => i.instrumentId === modern.instrument_ref)).toBe(false);
    expect(state.eligibility.some(i => i.instrumentId === modern.instrument_ref)).toBe(false);
  });

  it.each([{ rows: [] }, { rows: [modern] }])("never substitutes catalog roots or issuance/admission/holdings on an empty legacy result: %j", ({ rows }) => {
    const state = engineStateFromSnapshot({ markets: rows });
    for (const key of ["markets", "instruments", "holdings", "eligibility", "settlements", "settlementAccounts", "orders", "reservations", "trades", "events"] as const) {
      expect(state[key], key).toEqual([]);
    }
  });

  it.each([undefined, 1, false, "", "\t", {}, []].map(ref => ({ ref })))("rejects missing or malformed classification: %j", ({ ref }) => {
    const row: Record<string, unknown> = { ...legacy, instrument_ref: ref };
    if (ref === undefined) delete row.instrument_ref;
    expect(() => engineStateFromSnapshot({ markets: [row] })).toThrow("MARKET_CORE_SNAPSHOT_INVALID");
  });

  it("rejects absent markets and inconsistent concrete references", () => {
    expect(() => engineStateFromSnapshot({})).toThrow("MARKET_CORE_SNAPSHOT_INVALID");
    expect(() => engineStateFromSnapshot({ markets: [{ ...modern, instrument_id: "WHEAT-2027" }] })).toThrow("MARKET_CORE_SNAPSHOT_INVALID");
  });

  it("does not invent an instrument or substitute WHEAT for an unsupported legacy resource", () => {
    const state = engineStateFromSnapshot({ markets: [{ ...legacy, id: "unknown", instrument_id: "unknown" }] });
    expect(state.markets).toEqual([]);
    expect(state.instruments).toEqual([]);
  });

  it("filters every related collection by exact accepted market/instrument and trade references", () => {
    const supported = { market_id: legacy.id, instrument_id: legacy.instrument_id };
    const excluded = { market_id: modern.id, instrument_id: modern.instrument_id };
    const spoofed = { market_id: legacy.id, instrument_id: modern.instrument_id };
    const rows = [supported, excluded, spoofed].map((r, n) => ({ ...r, id: `record-${n}`, participant_id: "GRAIN-DESK" }));
    const state = engineStateFromSnapshot({
      markets: [legacy, modern], orders: rows, reservations: rows, trades: rows, events: rows,
      settlements: rows.map(r => ({ id: `settlement-${r.id}`, trade_id: r.id, kind: "SECONDARY" })),
      holdings: [{ ...excluded, id: "modern-holding", owned: 999 }],
      eligibility: [{ ...excluded, state: "ELIGIBLE" }],
      registeredOwnership: [{ ...excluded, registered_quantity: 999 }],
      settlementAccounts: [{ asset_id: "REVIEW-QUOTE", available: 999 }, { asset_id: "DEMO-KZT", available: 1 }],
    });
    for (const key of ["orders", "reservations", "trades", "events"] as const) expect(state[key].map(r => r.id)).toEqual(["record-0"]);
    expect(state.settlements.filter(r => r.kind === "SECONDARY").map(r => r.id)).toEqual(["settlement-record-0"]);
    expect(state.settlementAccounts.map(r => r.assetId)).toEqual(["DEMO-KZT"]);
    expect(state.holdings).toEqual(holdings);
    expect(state.instruments.some(r => r.id === modern.instrument_id)).toBe(false);
  });
});

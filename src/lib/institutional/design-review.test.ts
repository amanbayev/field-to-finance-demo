import { describe, expect, it } from "vitest";
import { FIRST_SCENARIO_NOTIONAL, FIRST_SCENARIO_PRICE } from "@/data/market-core/seed-scenario";
import { formatDemoKzt } from "@/lib/format";
import { isDesignReviewEnabled } from "@/lib/institutional/design-review";
import { isShellNavActive } from "@/lib/institutional/nav";
import {
  DESIGN_REVIEW_INSTRUMENT_SHELL_BASE,
  DESIGN_REVIEW_MARKET_WORKSTATION_BASE,
  instrumentShellHref,
  marketWorkstationHref,
} from "@/lib/institutional/tabs";
import {
  loadDesignReviewInstrumentOverview,
  loadDesignReviewMarketWorkstation,
} from "@/lib/institutional/wheat-overview-fixture";

describe("design review guard", () => {
  it("is enabled only when the process is not a production deploy", () => {
    expect(isDesignReviewEnabled()).toBe(process.env.NODE_ENV !== "production");
  });
});

describe("instrument shell href", () => {
  it("keeps authenticated v2 tabs on the real route", () => {
    expect(instrumentShellHref("WHEAT-2027", "overview")).toBe("/ui-v2/instruments/WHEAT-2027");
    expect(instrumentShellHref("WHEAT-2027", "market")).toBe(
      "/ui-v2/instruments/WHEAT-2027?tab=market",
    );
  });

  it("keeps review tabs on the review route", () => {
    expect(
      instrumentShellHref("WHEAT-2027", "overview", DESIGN_REVIEW_INSTRUMENT_SHELL_BASE),
    ).toBe("/ui-v2/design-review/instruments/WHEAT-2027");
  });
});

describe("WHEAT-2027 design-review fixture", () => {
  it("loads the real overview model with seed-scenario market values", async () => {
    const model = await loadDesignReviewInstrumentOverview("WHEAT-2027");
    expect(model).not.toBeNull();
    expect(model?.instrument.id).toBe("WHEAT-2027");
    expect(model?.instrument.decimals).toBe(0);
    expect(model?.lastTrade?.price).toBe(FIRST_SCENARIO_PRICE);
    expect(model?.matchedNotional).toBe(FIRST_SCENARIO_NOTIONAL);
    expect(formatDemoKzt(model!.lastTrade!.price, "en")).toBe("105,000 DEMO-KZT");
    expect(model?.coverage?.insuranceStatus).toBe("DEMO_SIMULATED");
    expect(model?.market?.settlementEnabled).toBe(false);
  });

  it("does not invent instruments that are not in the catalog", async () => {
    await expect(loadDesignReviewInstrumentOverview("WATER-2027")).resolves.toBeNull();
  });
});

describe("market workstation href", () => {
  it("keeps authenticated and review market routes separate", () => {
    expect(marketWorkstationHref("MKT-WHEAT-2027-DEMO-KZT")).toBe(
      "/ui-v2/markets/MKT-WHEAT-2027-DEMO-KZT",
    );
    expect(
      marketWorkstationHref(
        "MKT-WHEAT-2027-DEMO-KZT",
        "order-book",
        DESIGN_REVIEW_MARKET_WORKSTATION_BASE,
      ),
    ).toBe("/ui-v2/design-review/markets/MKT-WHEAT-2027-DEMO-KZT?tab=order-book");
  });
});

describe("shell nav active for v2 markets", () => {
  it("marks Markets active on authenticated and review market routes", () => {
    expect(isShellNavActive("/ui-v2/markets/MKT-WHEAT-2027-DEMO-KZT", "/markets")).toBe(true);
    expect(
      isShellNavActive("/ui-v2/design-review/markets/MKT-WHEAT-2027-DEMO-KZT", "/markets"),
    ).toBe(true);
    expect(isShellNavActive("/ui-v2/instruments/WHEAT-2027", "/markets")).toBe(false);
  });
});

describe("WHEAT-2027 design-review market fixture", () => {
  it("loads seed last price without inventing book, OHLC, or settlement", async () => {
    const model = await loadDesignReviewMarketWorkstation("MKT-WHEAT-2027-DEMO-KZT");
    expect(model).not.toBeNull();
    expect(model?.market.id).toBe("MKT-WHEAT-2027-DEMO-KZT");
    expect(model?.lastPrice).toBe(FIRST_SCENARIO_PRICE);
    expect(model?.matchedNotional).toBe(FIRST_SCENARIO_NOTIONAL);
    expect(model?.matchedQuantity).toBe(2);
    expect(model?.bids).toEqual([]);
    expect(model?.asks).toEqual([]);
    expect(model?.bestBid).toBeNull();
    expect(model?.bestAsk).toBeNull();
    expect(model?.trades).toHaveLength(1);
    expect(model?.trades[0]?.status).not.toBe("SETTLED");
    expect(model?.market.settlementEnabled).toBe(false);
    expect(model?.market.allowedOrderTypes).toEqual(["LIMIT"]);
    expect(model?.canSubmit).toBe(false);
    expect(model?.liveOrders).toEqual([]);
  });

  it("does not invent markets that are not in the catalog", async () => {
    await expect(loadDesignReviewMarketWorkstation("MKT-WATER-2027")).resolves.toBeNull();
  });
});

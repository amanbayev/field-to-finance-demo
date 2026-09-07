import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InvestorWorkspaceView } from "@/components/market-core/investor-workspace-view";
import type { ActorContext, MembershipRecord } from "@/domain/identity";
import { buildPrincipal, resolveActorContext } from "@/domain/identity";
import {
  availableBalance,
  type AssetProtocol,
  type EligibilityExplanation,
  type Holding,
  type Market,
  type MarketInstrument,
  type Order,
  type OrderReservation,
  type ProtocolVersion,
  type Trade,
} from "@/domain/market-core";
import {
  DEMO_ORGANIZATIONS,
  demoPersonaById,
  organizationById,
} from "@/data/identity/demo-catalog";
import {
  WHEAT_INSTRUMENT_ID,
  marketForInstrument,
  marketInstruments,
} from "@/data/market-core/catalog";
import {
  composeInvestorWorkspace,
  type InvestorWorkspaceCanonicalSource,
  type InvestorWorkspaceReady,
} from "@/lib/market-core/investor-workspace";
import { investorWorkspaceCanonicalSource } from "@/services/investor-workspace";
import en from "../../../messages/en.json";
import ru from "../../../messages/ru.json";
import kk from "../../../messages/kk.json";

function catalogLookup(
  catalog: Record<string, unknown>,
  namespace: string,
  key: string,
): string {
  const root = catalog[namespace];
  if (!root || typeof root !== "object") {
    return key;
  }
  const value = (root as Record<string, unknown>)[key];
  return typeof value === "string" ? value : key;
}

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useLocale: () => "en",
    useTranslations: (namespace: string) => (key: string) =>
      catalogLookup(en as Record<string, unknown>, namespace, key),
  };
});

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) =>
    catalogLookup(en as Record<string, unknown>, namespace, key),
}));

const platform = DEMO_ORGANIZATIONS.find((item) => item.slug === "field-to-finance")!;
const wheatMarket = marketForInstrument(WHEAT_INSTRUMENT_ID)!;

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
    session: { principalUserId: "admin-1", effectiveDemoPersonaId: persona.id },
    persona,
    personaOrganization: organization,
  });
}

function translateFrom(catalog: Record<string, unknown>, namespace: string) {
  return (key: never) => catalogLookup(catalog, namespace, String(key));
}

function openOrder(partial: Partial<Order> & Pick<Order, "id" | "participantId">): Order {
  return {
    marketId: wheatMarket.id,
    instrumentId: WHEAT_INSTRUMENT_ID,
    side: "SELL",
    orderType: "LIMIT",
    price: 105000,
    originalQuantity: 4,
    remainingQuantity: 2,
    filledQuantity: 2,
    status: "PARTIALLY_FILLED",
    sequence: 1,
    createdAt: "2026-08-23T10:00:00.000Z",
    updatedAt: "2026-08-23T10:00:00.000Z",
    sourceChannel: "DIRECT_MTP",
    ...partial,
  };
}

function reservation(
  partial: Partial<OrderReservation> & Pick<OrderReservation, "id" | "orderId" | "participantId">,
): OrderReservation {
  return {
    marketId: wheatMarket.id,
    instrumentId: WHEAT_INSTRUMENT_ID,
    kind: "ASSET",
    quantity: 2,
    status: "HELD_PENDING_SETTLEMENT",
    ...partial,
  };
}

function trade(partial: Partial<Trade> & Pick<Trade, "id">): Trade {
  return {
    marketId: wheatMarket.id,
    instrumentId: WHEAT_INSTRUMENT_ID,
    buyOrderId: "buy-1",
    sellOrderId: "sell-1",
    buyerParticipantId: "GRAIN-DESK",
    sellerParticipantId: "INVESTOR-0001",
    quantity: 2,
    price: 105000,
    notional: 210000,
    status: "AWAITING_DEVNET_SETTLEMENT",
    kind: "SECONDARY",
    createdAt: "2026-08-23T10:01:00.000Z",
    updatedAt: "2026-08-23T10:01:00.000Z",
    eligibilityRecheckPassed: true,
    dvpStatus: "PENDING",
    registryUpdateStatus: "PENDING",
    finalSettlementStatus: "PENDING",
    ...partial,
  };
}

const workingBuckets = {
  owned: 10,
  reservedForOrders: 3,
  pledged: 2,
  blocked: 1,
  pendingIn: 0,
  pendingOut: 0,
};

const workingHolding: Holding = {
  id: "hld-work",
  instrumentId: WHEAT_INSTRUMENT_ID,
  holderReference: "INVESTOR-0001",
  holderName: "Steppe Capital",
  buckets: workingBuckets,
  available: availableBalance(workingBuckets),
};

function asWorkspace(model: ReturnType<typeof composeInvestorWorkspace>): InvestorWorkspaceReady {
  expect(model.kind).toBe("WORKSPACE");
  return model as InvestorWorkspaceReady;
}

function populatedWorkspace(): InvestorWorkspaceReady {
  return asWorkspace(
    composeInvestorWorkspace({
      actor: asPersona("DEMO-FUND-001"),
      canonical: investorWorkspaceCanonicalSource(),
      activity: {
        kind: "AVAILABLE",
        orders: [
          openOrder({ id: "ord-open", participantId: "INVESTOR-0001", status: "OPEN" }),
          openOrder({ id: "ord-partial", participantId: "INVESTOR-0001" }),
          openOrder({ id: "ord-other", participantId: "GRAIN-DESK" }),
        ],
        reservations: [
          reservation({
            id: "res-own",
            orderId: "ord-partial",
            participantId: "INVESTOR-0001",
          }),
        ],
        trades: [
          trade({ id: "tr-awaiting" }),
          trade({ id: "tr-matched", status: "MATCHED", createdAt: "2026-08-23T09:00:00.000Z" }),
        ],
        workingHoldings: [workingHolding],
      },
      navigation: { secondaryHref: "/secondary", marketsHref: "/markets" },
    }),
  );
}

function renderWorkspace(
  workspace: InvestorWorkspaceReady,
  catalog: Record<string, unknown> = en as Record<string, unknown>,
): string {
  return renderToStaticMarkup(
    createElement(InvestorWorkspaceView, {
      workspace,
      locale: "en",
      translate: translateFrom(catalog, "portfolio"),
      translateCore: translateFrom(catalog, "marketCore"),
      translateEligibility: translateFrom(catalog, "eligibility"),
    }),
  );
}

function nestedInteractive(html: string): boolean {
  const blocks = html.match(/<(a|button)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  return blocks.some((block) =>
    /<(a|button)\b/i.test(block.replace(/^<[^>]+>/, "").replace(/<\/[^>]+>$/, "")),
  );
}

function paragraphContainsBlock(html: string): boolean {
  const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  return paragraphs.some((block) =>
    /<(div|table|ul|dl|section|h[1-6]|p)\b/i.test(
      block.replace(/^<p\b[^>]*>/i, "").replace(/<\/p>$/i, ""),
    ),
  );
}

function metricCellValue(html: string, label: string): string | null {
  const marker = `label-caps">${label}</p>`;
  const index = html.indexOf(marker);
  if (index < 0) {
    return null;
  }
  const match = html.slice(index + marker.length).match(/>([^<]*)</);
  return match?.[1] ?? null;
}

const RAW_CODES = [
  "PARTIALLY_FILLED",
  "AWAITING_DEVNET_SETTLEMENT",
  "HELD_PENDING_SETTLEMENT",
  "CLEARING_READY",
  "POLICY_PENDING",
  "NOT_ASSESSED",
  "NOT_ELIGIBLE",
  "ELIGIBLE",
];

describe("investor workspace view", () => {
  it("renders one h1, hierarchy, landmarks, tables and compact definition lists", () => {
    const html = renderWorkspace(populatedWorkspace());
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Investor workspace");
    expect(html).toContain("Commodity Chain");
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain("<nav");
    expect(html).toContain("<section");
    expect(html).toContain("<table");
    expect(html).toContain("<dl");
    expect(html).toContain("Owned");
    expect(html).toContain("Available");
    expect(html).toContain("Reserved for orders");
    expect(html).toContain("Pledged");
    expect(html).toContain("Blocked");
    expect(html).toContain(">10<");
    expect(html).toContain(">4<");
    expect(html).toContain(">3<");
    expect(html).toContain(">2<");
    expect(html).toContain(">1<");
    expect(html).toContain(`/instruments/${WHEAT_INSTRUMENT_ID}`);
    expect(html).toContain('href="/secondary"');
    expect(html).toContain('href="/markets"');
    expect(nestedInteractive(html)).toBe(false);
    expect(paragraphContainsBlock(html)).toBe(false);
    expect(html).not.toMatch(/type="submit"|<button\b/i);
    expect(html).toContain("Submit or cancel orders on the existing secondary market.");
  });

  it("localizes eligibility, orders, reservations and lifecycle without raw codes", () => {
    const html = renderWorkspace(populatedWorkspace());
    expect(html).toContain("Eligible");
    expect(html).toContain(
      "New-order admission is available for this participant and instrument.",
    );
    expect(html).toContain("New-order entry is available on the secondary market.");
    expect(html).toContain(
      "Cancellation of an owned open order is not tied to current eligibility.",
    );
    expect(html).toContain("Open");
    expect(html).toContain("Partially filled");
    expect(html).toContain("Held pending settlement");
    expect(html).toContain("Matched");
    expect(html).toContain("Awaiting Devnet settlement");
    expect(html).toContain("DEMO-KZT (no monetary value)");
    expect(html).toContain(
      "This workspace does not calculate portfolio value, NAV, yield or profit and loss.",
    );
    for (const code of RAW_CODES) {
      expect(html, code).not.toContain(code);
    }
    expect(html).not.toMatch(/\bsettled\b/i);
    expect(html).not.toMatch(/\bunrealized\b|\bwithdrawable\b|AFSA approval/i);
    expect(html).toContain("not a wallet, a cash account");
    expect(html).toContain("not cash balances");
  });

  it("shows a truthful unavailable live-book state without substituting holdings", () => {
    const workspace = asWorkspace(
      composeInvestorWorkspace({
        actor: asPersona("DEMO-FUND-001"),
        canonical: investorWorkspaceCanonicalSource(),
        activity: { kind: "UNAVAILABLE" },
        navigation: { secondaryHref: "/secondary", marketsHref: "/markets" },
      }),
    );
    const html = renderWorkspace(workspace);
    expect(workspace.overview.activity).toEqual({ kind: "UNAVAILABLE" });
    expect(html).toContain(en.portfolio.activityUnavailable);
    expect(html).toContain(
      "The live market book is unavailable, so open orders and reservations are not shown.",
    );
    expect(html).toContain(
      "The live market book is unavailable, so executions and clearing records are not shown.",
    );
    expect(metricCellValue(html, en.portfolio.overviewOpenOrders)).toBeNull();
    expect(metricCellValue(html, en.portfolio.overviewReservations)).toBeNull();
    expect(metricCellValue(html, en.portfolio.overviewInstruments)).toBe("1");
    expect(metricCellValue(html, en.portfolio.overviewProtocols)).toBe("1");
    expect(html).not.toContain(en.portfolio.overviewExecutions);
    expect(html).not.toContain(en.portfolio.ordersEmpty);
    expect(html).not.toContain(en.portfolio.executionsEmpty);
    expect(html).toContain("Owned");
    expect(html).toContain(`/instruments/${WHEAT_INSTRUMENT_ID}`);
    expect(html).not.toContain("Partially filled");
    expect(workspace.protocolGroups.length).toBeGreaterThan(0);
  });

  it("renders recorded zeros when the live book is available and empty", () => {
    const workspace = asWorkspace(
      composeInvestorWorkspace({
        actor: asPersona("DEMO-FUND-001"),
        canonical: investorWorkspaceCanonicalSource(),
        activity: {
          kind: "AVAILABLE",
          orders: [],
          reservations: [],
          trades: [],
          workingHoldings: [],
        },
        navigation: { secondaryHref: "/secondary", marketsHref: "/markets" },
      }),
    );
    const html = renderWorkspace(workspace);
    expect(workspace.overview.activity.kind).toBe("AVAILABLE");
    if (workspace.overview.activity.kind !== "AVAILABLE") {
      return;
    }
    expect(workspace.overview.activity.openOrderCount).toBe(0);
    expect(workspace.overview.activity.reservationsRequiringAttention).toBe(0);
    expect(html).not.toContain(en.portfolio.activityUnavailable);
    expect(html).not.toContain(
      "The live market book is unavailable, so open orders and reservations are not shown.",
    );
    expect(html).not.toContain(
      "The live market book is unavailable, so executions and clearing records are not shown.",
    );
    expect(metricCellValue(html, en.portfolio.overviewOpenOrders)).toBe("0");
    expect(metricCellValue(html, en.portfolio.overviewReservations)).toBe("0");
    expect(metricCellValue(html, en.portfolio.overviewInstruments)).toBe("1");
    expect(metricCellValue(html, en.portfolio.overviewProtocols)).toBe("1");
    expect(html).not.toContain(en.portfolio.overviewExecutions);
    expect(html).toContain(en.portfolio.ordersEmpty);
    expect(html).toContain(en.portfolio.executionsEmpty);
    expect(html).toContain("Owned");
    expect(html).toContain(`/instruments/${WHEAT_INSTRUMENT_ID}`);
  });

  it("renders the synthetic TIDAL grouping through the production view", () => {
    const tidalProtocol: AssetProtocol = {
      id: "TIDAL",
      name: "Tidal Energy",
      assetClass: "WATER",
      protocolOwner: "Not appointed",
      operator: "Test operator",
      status: "STRUCTURING",
      regulatoryStatus: "NOT_SUBMITTED",
      currentVersionId: "TIDAL-V9.9",
    };
    const tidalVersion: ProtocolVersion = {
      id: "TIDAL-V3.2",
      protocolId: "TIDAL",
      displayVersion: "3.2",
      state: "ACTIVE",
      frozen: true,
      activatedAt: null,
      frozenAt: null,
      supersedesVersionId: null,
      supersededByVersionId: null,
      governanceNote: "Synthetic non-agriculture version",
      rules: {
        verificationModel: "Metering",
        riskModel: "Offtake concentration",
        coverageModel: "Contracted revenue",
        issuanceModel: "Claim against issuer",
        redemptionModel: "Scheduled",
        lifecycle: ["site"],
        modules: ["metering"],
      },
    };
    const tidalInstrument: MarketInstrument = {
      id: "TIDE-2030",
      symbol: "TIDE-2030",
      name: "Synthetic tidal instrument",
      instrumentType: "ASSET_TOKEN",
      assetProtocolId: "TIDAL",
      protocolVersionId: "TIDAL-V3.2",
      assetClass: "WATER",
      issuerId: "test-issuer",
      issuerName: "Test Issuer",
      issuanceId: "TIDE-ISS-001",
      legalClassification: "Test",
      denomination: "1 metered unit",
      decimals: 0,
      currencyOrUnit: "u",
      transferPolicy: "Test",
      eligibilityPolicy: "Participant × instrument",
      settlementPolicy: "Test",
      custodyPolicy: "Test",
      status: "ISSUED",
    };
    const tidalMarket: Market = {
      id: "MKT-TIDE-2030",
      instrumentId: "TIDE-2030",
      phase: "CLOSED",
      activeChannel: "DIRECT_MTP",
      transacting: false,
      matchingEnabled: false,
      settlementEnabled: false,
      demonstratorStatus: "DEMO_CLOSED",
      settlementAssetId: "DEMO-KZT",
      settlementAssetLabel: "DEMO-KZT",
      settlementHasMonetaryValue: false,
      marketType: "REGULATED_INSTITUTIONAL_DEMONSTRATOR",
      allowedOrderTypes: ["LIMIT"],
      wholeQuantityOnly: true,
    };
    const tidalHolding: Holding = {
      id: "hld-tide",
      instrumentId: "TIDE-2030",
      holderReference: "INVESTOR-0001",
      holderName: "Test Holder",
      buckets: {
        owned: 4,
        reservedForOrders: 1,
        pledged: 1,
        blocked: 1,
        pendingIn: 0,
        pendingOut: 0,
      },
      available: 1,
    };
    const explanation: EligibilityExplanation = {
      participantReference: "INVESTOR-0001",
      instrumentId: "TIDE-2030",
      state: "NOT_ASSESSED",
      organizationId: null,
      membershipId: null,
      assessmentId: null,
      reasonCode: null,
      authorityRole: null,
      evidenceRefs: [],
      recordedAt: null,
      missing: ["ASSESSMENT_MISSING"],
      inconsistencies: [],
      attributionComplete: true,
    };
    const canonical: InvestorWorkspaceCanonicalSource = {
      listHoldings: () => [tidalHolding],
      getInstrumentMarketContext: (instrumentId) =>
        instrumentId === "TIDE-2030"
          ? {
              instrument: tidalInstrument,
              protocol: tidalProtocol,
              market: tidalMarket,
              protocolVersion: tidalVersion,
            }
          : null,
      explainActorEligibility: () => explanation,
      actorMaySubmitOrder: () => false,
      actorMayCancelOrder: () => false,
    };
    const workspace = asWorkspace(
      composeInvestorWorkspace({
        actor: asPersona("DEMO-FUND-001"),
        canonical,
        activity: { kind: "UNAVAILABLE" },
        navigation: { secondaryHref: undefined, marketsHref: undefined },
      }),
    );
    const html = renderWorkspace(workspace);
    expect(html).toContain("Tidal Energy");
    expect(html).toContain("TIDE-2030");
    expect(html).toContain("/instruments/TIDE-2030");
    expect(html).toContain("Not assessed");
    expect(html).not.toContain("WHEAT-2027");
    expect(html).not.toContain("Field to Finance");
    expect(html).not.toContain("NOT_ASSESSED");
    expect(marketInstruments.map((item) => item.id)).not.toContain("TIDE-2030");
  });

  it("keeps EN, RU and KK workspace titles distinct in the rendered h1", () => {
    const workspace = populatedWorkspace();
    const enHtml = renderWorkspace(workspace, en as Record<string, unknown>);
    const ruHtml = renderWorkspace(workspace, ru as Record<string, unknown>);
    const kkHtml = renderWorkspace(workspace, kk as Record<string, unknown>);
    expect(enHtml).toContain(">Investor workspace</h1>");
    expect(ruHtml).toContain(">Рабочее место инвестора</h1>");
    expect(kkHtml).toContain(">Инвестордың жұмыс орны</h1>");
  });
});

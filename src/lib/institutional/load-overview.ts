import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { auditEvents } from "@/data/mock/audit";
import {
  ON_CHAIN_DEMO_ISSUANCE_ID,
  ON_CHAIN_DEMO_PLACEMENT_ID,
  ON_CHAIN_DEMO_POOL_ID,
} from "@/adapters/blockchain";
import { actorCan, type ActorContext } from "@/domain/identity";
import {
  availableBalance,
  bidsFromOrders,
  asksFromOrders,
  type AssetProtocol,
  type Holding,
  type Market,
  type MarketInstrument,
  type Trade,
} from "@/domain/market-core";
import type { OrderBookLevel } from "@/domain/market-core/order-book";
import { isLiveOrder } from "@/domain/market-core/matching";
import {
  getInstrumentMarketContext,
  listAdmission,
  listHoldings,
} from "@/services/market-core-service";
import { getPlacementSnapshot, type PlacementSnapshot } from "@/services/placement-service";
import { getScasSnapshot } from "@/services/scas-service";
import { fetchPersistentEngineState } from "@/services/secondary-market-repository";
import { getTokenBySymbol } from "@/services/token-service";
import { f2fModuleHref } from "@/lib/market-core/presentation";

export interface RegistryRow {
  id: string;
  holderName: string;
  holderReference: string;
  registered: number;
  available: number;
  reserved: number;
  pendingIn: number;
  pendingOut: number;
  pledged: number;
  blocked: number;
}

export interface DocumentItem {
  id: string;
  titleKey: string;
  detail: string;
  href?: string;
  kind: "record" | "workspace";
}

export interface ActivityItem {
  id: string;
  source: "institutional" | "audit" | "marketEvent";
  labelKey: string;
  reference?: string;
  at: string | null;
  href?: string;
}

export interface RiskItem {
  id: string;
  tone: "warning" | "danger" | "info";
  titleKey: string;
  bodyKey: string;
}

export interface CoverageFacts {
  grossVolumeTonnes: number;
  eligibleCoverageTonnes: number;
  coverageRatioPercent: number;
  haircutPercent: number;
  insuranceLabel: string;
  insuranceStatus: string;
  calculatedAt: string;
  poolId: string;
}

export interface InstrumentOverviewModel {
  instrument: MarketInstrument;
  protocol: AssetProtocol | null;
  market: Market | null;
  wheat: boolean;
  protocolInvestment: boolean;
  issuedSupply: number | null;
  coverage: CoverageFacts | null;
  scasVerified: boolean | null;
  scasAttestedCount: number | null;
  scasPendingCount: number | null;
  unitLabel: string | null;
  settlementCurrency: string | null;
  claimType: string | null;
  underlyingReference: string | null;
  unitExposure: string | null;
  redemption: string | null;
  workingHypothesis: boolean;
  holdings: RegistryRow[];
  pendingMovements: boolean;
  bestBid: OrderBookLevel | null;
  bestAsk: OrderBookLevel | null;
  lastTrade: Trade | null;
  matchedNotional: number | null;
  openOrderCount: number | null;
  bookAvailable: boolean;
  documents: DocumentItem[];
  activity: ActivityItem[];
  risks: RiskItem[];
  admission: Array<{ stage: string; complete: boolean }>;
  asOf: string | null;
  classicHref: string;
  marketWorkspaceHref: string;
  protocolHref: string | null;
  issuanceHref: string | null;
  coverageHref: string | undefined;
  poolHref: string | undefined;
  dacHref: string | undefined;
  scasHref: string | undefined;
}

function workingFor(legal: Holding, engineHoldings: Holding[] | null): Holding {
  if (!engineHoldings) {
    return legal;
  }
  const working = engineHoldings.find(
    (row) =>
      row.holderReference === legal.holderReference &&
      row.instrumentId === legal.instrumentId,
  );
  if (!working) {
    return legal;
  }
  const buckets = {
    owned: legal.buckets.owned,
    reservedForOrders: working.buckets.reservedForOrders,
    pledged: working.buckets.pledged,
    blocked: working.buckets.blocked,
    pendingIn: working.buckets.pendingIn,
    pendingOut: working.buckets.pendingOut,
  };
  return {
    ...legal,
    buckets,
    available: availableBalance(buckets),
  };
}

function toRegistryRow(holding: Holding): RegistryRow {
  return {
    id: holding.id,
    holderName: holding.holderName,
    holderReference: holding.holderReference,
    registered: holding.buckets.owned,
    available: holding.available,
    reserved: holding.buckets.reservedForOrders,
    pendingIn: holding.buckets.pendingIn,
    pendingOut: holding.buckets.pendingOut,
    pledged: holding.buckets.pledged,
    blocked: holding.buckets.blocked,
  };
}

async function loadEngine() {
  try {
    return await fetchPersistentEngineState();
  } catch {
    return null;
  }
}

export async function loadInstrumentOverview(
  instrumentId: string,
  actor: ActorContext,
): Promise<InstrumentOverviewModel | null> {
  const context = getInstrumentMarketContext(instrumentId);
  if (!context) {
    return null;
  }
  const { instrument, protocol, market } = context;
  const wheat = instrument.id === "WHEAT-2027";
  const protocolInvestment = instrument.instrumentType === "PROTOCOL_INVESTMENT";
  const tokenDetail = wheat ? getTokenBySymbol(instrument.symbol) : null;
  const coverageEngine = wheat ? wheatPoolCoverageFromEngine() : null;
  const scas = wheat ? getScasSnapshot() : null;
  const legalHoldings = listHoldings({ instrumentId: instrument.id });
  const admission = listAdmission(instrument.id);
  const engine = wheat ? await loadEngine() : null;
  const snapshot: PlacementSnapshot | null = wheat ? await getPlacementSnapshot() : null;
  const issuedSupply =
    snapshot?.supply.mintedSupply ?? tokenDetail?.token.issued ?? null;

  const coverage: CoverageFacts | null = coverageEngine
    ? {
        grossVolumeTonnes: coverageEngine.grossVolumeTonnes,
        eligibleCoverageTonnes: coverageEngine.eligibleCoverageTonnes,
        coverageRatioPercent:
          coverageEngine.grossVolumeTonnes > 0
            ? (coverageEngine.eligibleCoverageTonnes / coverageEngine.grossVolumeTonnes) *
              100
            : 0,
        haircutPercent: coverageEngine.totalHaircutPercent,
        insuranceLabel:
          coverageEngine.adjustments.find((item) => item.key === "insurance")?.label ??
          "Insurance",
        insuranceStatus:
          coverageEngine.adjustments.find((item) => item.key === "insurance")?.status ??
          "DEMO_SIMULATED",
        calculatedAt: coverageEngine.calculatedAt,
        poolId: coverageEngine.poolId,
      }
    : null;

  const engineHoldings = engine?.holdings ?? null;
  const holdings = legalHoldings
    .map((holding) => workingFor(holding, engineHoldings))
    .map(toRegistryRow)
    .filter(
      (row) =>
        row.registered > 0 ||
        row.pendingIn > 0 ||
        row.pendingOut > 0 ||
        row.reserved > 0,
    );

  const pendingMovements = holdings.some(
    (row) => row.pendingIn > 0 || row.pendingOut > 0 || row.reserved > 0,
  );

  const marketOrders = engine
    ? engine.orders.filter((order) => order.marketId === market?.id)
    : [];
  const bids = engine ? bidsFromOrders(marketOrders) : [];
  const asks = engine ? asksFromOrders(marketOrders) : [];
  const secondaryTrades = engine
    ? engine.trades.filter((trade) => trade.kind === "SECONDARY")
    : [];
  const lastTrade = secondaryTrades.at(-1) ?? null;
  const matchedNotional =
    engine && secondaryTrades.length > 0
      ? secondaryTrades.reduce((sum, trade) => sum + trade.notional, 0)
      : engine
        ? 0
        : null;
  const openOrderCount = engine
    ? marketOrders.filter((order) => isLiveOrder(order)).length
    : null;

  const canIssuance =
    actorCan(actor, "issuance.manage") ||
    actorCan(actor, "audit.read") ||
    actorCan(actor, "regulator.read");
  const coverageHref = f2fModuleHref("coverage", actor);
  const poolHref = actorCan(actor, "pools.read")
    ? `/pools/${ON_CHAIN_DEMO_POOL_ID}`
    : undefined;
  const dacHref = f2fModuleHref("dacs", actor);
  const scasHref = f2fModuleHref("scas", actor);
  const issuanceHref = canIssuance && wheat ? `/issuances/${ON_CHAIN_DEMO_ISSUANCE_ID}` : null;
  const placementHref =
    actorCan(actor, "placement.read.all") ||
    actorCan(actor, "placement.read.own") ||
    actorCan(actor, "market.read")
      ? `/market/${ON_CHAIN_DEMO_PLACEMENT_ID}`
      : undefined;

  const documents: DocumentItem[] = protocolInvestment
    ? []
    : [
        {
          id: "terms",
          titleKey: "docInstrumentTerms",
          detail: "record",
          kind: "record",
        },
        {
          id: "coverage",
          titleKey: "docCoverageSnapshot",
          detail: coverage?.poolId ?? ON_CHAIN_DEMO_POOL_ID,
          href: coverageHref,
          kind: "workspace",
        },
        {
          id: "issuance",
          titleKey: "docIssuance",
          detail: ON_CHAIN_DEMO_ISSUANCE_ID,
          href: issuanceHref ?? undefined,
          kind: "record",
        },
        {
          id: "placement",
          titleKey: "docPrimaryPlacement",
          detail: ON_CHAIN_DEMO_PLACEMENT_ID,
          href: placementHref,
          kind: "record",
        },
        {
          id: "audit",
          titleKey: "docAuditRegister",
          detail: "workspace",
          href: actorCan(actor, "audit.read") ? "/audit" : undefined,
          kind: "workspace",
        },
      ];

  const activity: ActivityItem[] = [];
  if (wheat && snapshot?.recorded.status === "settled") {
    activity.push({
      id: "placement-settled",
      source: "institutional",
      labelKey: "activityPrimaryPlacement",
      reference: snapshot.recorded.placementId,
      at: null,
      href: placementHref,
    });
  }
  if (wheat && instrument.issuanceId) {
    activity.push({
      id: "issuance",
      source: "institutional",
      labelKey: "activityIssuance",
      reference: instrument.issuanceId,
      at: null,
      href: issuanceHref ?? undefined,
    });
  }
  if (wheat) {
    for (const event of auditEvents) {
      const relatedId = event.relatedEntityId ?? "";
      const related =
        relatedId === "tok-wheat-2027" ||
        relatedId === ON_CHAIN_DEMO_POOL_ID ||
        relatedId.startsWith("DAC-2027-");
      if (!related) {
        continue;
      }
      activity.push({
        id: event.id,
        source: "audit",
        labelKey: event.eventKey,
        reference: event.reference,
        at: event.timestamp,
      });
    }
    if (scas) {
      for (const attestation of scas.attestations) {
        if (attestation.subjectId !== ON_CHAIN_DEMO_POOL_ID || !attestation.attestedAt) {
          continue;
        }
        activity.push({
          id: attestation.id,
          source: "institutional",
          labelKey:
            attestation.kind === "poolLock"
              ? "activityPoolLock"
              : "activityCoverageAttested",
          reference: attestation.id,
          at: attestation.attestedAt,
          href: scasHref,
        });
      }
    }
  }
  if (engine) {
    for (const event of engine.events) {
      activity.push({
        id: event.id,
        source: "marketEvent",
        labelKey: event.type,
        reference: event.entityId,
        at: event.timestamp,
      });
    }
  }

  const risks: RiskItem[] = protocolInvestment
    ? []
    : wheat
      ? [
          {
            id: "production",
            tone: "warning",
            titleKey: "riskProductionTitle",
            bodyKey: "riskProductionBody",
          },
          {
            id: "verification",
            tone: "warning",
            titleKey: "riskVerificationTitle",
            bodyKey: "riskVerificationBody",
          },
          {
            id: "settlement",
            tone: "warning",
            titleKey: "riskSettlementTitle",
            bodyKey: "riskSettlementBody",
          },
          {
            id: "issuer",
            tone: "danger",
            titleKey: "riskIssuerTitle",
            bodyKey: "riskIssuerBody",
          },
          {
            id: "coverage",
            tone: "info",
            titleKey: "riskCoverageTitle",
            bodyKey: "riskCoverageBody",
          },
        ]
      : [];

  const poolAttested = Boolean(
    scas?.attestations.some(
      (item) =>
        item.subjectId === ON_CHAIN_DEMO_POOL_ID && item.status === "ATTESTED",
    ),
  );

  return {
    instrument,
    protocol,
    market,
    wheat,
    protocolInvestment,
    issuedSupply,
    coverage,
    scasVerified: wheat ? poolAttested : null,
    scasAttestedCount: scas?.attestedCount ?? null,
    scasPendingCount: scas?.pendingCount ?? null,
    unitLabel: tokenDetail?.token.tokenUnitDescription ?? instrument.denomination,
    settlementCurrency: market?.settlementAssetLabel ?? null,
    claimType: tokenDetail?.token.terms.claimAgainst ?? null,
    underlyingReference: tokenDetail
      ? `${tokenDetail.token.terms.crop} ${tokenDetail.token.terms.quality}`
      : null,
    unitExposure: tokenDetail
      ? `${tokenDetail.token.terms.unitTonnesPerToken}`
      : null,
    redemption: tokenDetail?.token.terms.redemptionWindow ?? null,
    workingHypothesis: Boolean(tokenDetail?.token.terms.workingHypothesis),
    holdings,
    pendingMovements,
    bestBid: bids[0] ?? null,
    bestAsk: asks[0] ?? null,
    lastTrade,
    matchedNotional,
    openOrderCount,
    bookAvailable: Boolean(engine),
    documents,
    activity,
    risks,
    admission,
    asOf: coverage?.calculatedAt ?? engine?.now ?? null,
    classicHref: `/instruments/${instrument.id}`,
    marketWorkspaceHref: "/secondary",
    protocolHref: protocol ? `/protocols/${protocol.id}` : null,
    issuanceHref,
    coverageHref,
    poolHref,
    dacHref,
    scasHref,
  };
}

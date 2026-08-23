import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Clock,
  ExternalLink,
  Scale,
  Shield,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AsOfTimestamp } from "@/components/institutional/as-of-timestamp";
import { AuditTimeline } from "@/components/institutional/audit-timeline";
import { Breadcrumbs } from "@/components/institutional/breadcrumbs";
import { ContextTabs } from "@/components/institutional/context-tabs";
import { DocumentList } from "@/components/institutional/document-list";
import { EconomicBasisPanel } from "@/components/institutional/economic-basis-panel";
import { EmptyState } from "@/components/institutional/empty-state";
import { EntityCard } from "@/components/institutional/entity-card";
import { EntityHeader } from "@/components/institutional/entity-header";
import { FactList } from "@/components/institutional/fact-list";
import { GovernanceWorkflow } from "@/components/institutional/governance-workflow";
import { MetricCard } from "@/components/institutional/metric-card";
import { StatusChip } from "@/components/institutional/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatDemoKzt, formatInteger, formatNumber, formatPercent } from "@/lib/format";
import type { InstrumentOverviewModel } from "@/lib/institutional/load-overview";
import {
  DEFAULT_INSTRUMENT_SHELL_BASE,
  INSTRUMENT_SHELL_TABS,
  instrumentShellHref,
  marketWorkstationBaseFromInstrumentBase,
  marketWorkstationHref,
  type InstrumentShellTab,
} from "@/lib/institutional/tabs";
import { ASSET_CLASS_KEYS } from "@/lib/market-core/presentation";
import { MarketClearingSplit } from "@/components/market-core/market-clearing-split";

const GOVERNANCE_GROUPS: Array<{
  titleKey: string;
  stages: string[];
}> = [
  {
    titleKey: "govStructuring",
    stages: [
      "IDEA",
      "STRUCTURING",
      "LEGAL_CLASSIFICATION",
      "ASSET_VERIFICATION",
      "RISK_METHODOLOGY",
      "SPV_OR_ISSUER_STRUCTURING",
    ],
  },
  {
    titleKey: "govReview",
    stages: ["DISCLOSURE", "COMPLIANCE_REVIEW", "REGISTRAR_REVIEW"],
  },
  { titleKey: "govAdmission", stages: ["MARKET_ADMISSION"] },
  { titleKey: "govIssuance", stages: ["ISSUANCE", "PRIMARY_PLACEMENT"] },
  { titleKey: "govMarket", stages: ["SECONDARY_MARKET"] },
];

function activityLabel(
  item: InstrumentOverviewModel["activity"][number],
  t: Awaited<ReturnType<typeof getTranslations>>,
  tAudit: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (item.source === "audit") {
    return lookupMessage(tAudit, `${item.labelKey}.title`);
  }
  if (item.source === "marketEvent") {
    return lookupMessage(t, `marketEvent.${item.labelKey}`);
  }
  return lookupMessage(t, item.labelKey);
}

function formatMarketPrice(price: number, locale: AppLocale, decimals: number): string {
  if (decimals <= 0) {
    return formatDemoKzt(price, locale);
  }
  return `${formatNumber(price, locale, decimals)} DEMO-KZT`;
}

const OVERVIEW_ACTIVITY_NOISE = new Set([
  "order_submitted",
  "order_reserved",
  "eligibility_rechecked",
  "clearing_started",
  "settlement_reservation_confirmed",
]);

function selectOverviewActivity(
  items: InstrumentOverviewModel["activity"],
): InstrumentOverviewModel["activity"] {
  return [...items]
    .filter((item) => item.source !== "marketEvent" || !OVERVIEW_ACTIVITY_NOISE.has(item.labelKey))
    .sort((a, b) => {
      if (a.at && b.at) {
        return b.at.localeCompare(a.at);
      }
      if (a.at) {
        return -1;
      }
      if (b.at) {
        return 1;
      }
      return 0;
    })
    .slice(0, 5);
}

export async function InstrumentOverviewScreen({
  model,
  tab,
  locale,
  basePath = DEFAULT_INSTRUMENT_SHELL_BASE,
  reviewMode = false,
}: {
  model: InstrumentOverviewModel;
  tab: InstrumentShellTab;
  locale: AppLocale;
  basePath?: string;
  reviewMode?: boolean;
}) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  const { instrument, protocol, market } = model;
  const marketHref = model.market
    ? marketWorkstationHref(
        model.market.id,
        "market",
        marketWorkstationBaseFromInstrumentBase(basePath),
      )
    : model.marketWorkspaceHref;
  const tabItems = INSTRUMENT_SHELL_TABS.map((id) => ({
    href: instrumentShellHref(instrument.id, id, basePath),
    label: lookupMessage(t, `tabs.${id}`),
    current: tab === id,
  }));
  const chain = [
    t("chainField"),
    t("chainDac"),
    t("chainScas"),
    t("chainPool"),
    t("chainCoverage"),
    instrument.symbol,
  ];
  const issuedHint = model.issuedSupply !== null ? t("unitsIssued") : undefined;
  const marketOpen = Boolean(
    market && market.demonstratorStatus === "DEMO_OPEN" && market.transacting,
  );
  const protocolContext = protocol
    ? `${protocol.name} / ${lookupMessage(tCore, ASSET_CLASS_KEYS[instrument.assetClass])}`
    : lookupMessage(tCore, ASSET_CLASS_KEYS[instrument.assetClass]);

  return (
    <div>
      {reviewMode ? null : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-[#F1F4F1] px-3 py-2 text-[12px] text-muted-foreground">
          <span>{t("previewBanner")}</span>
          <Link href={model.classicHref} className="font-medium text-primary hover:underline">
            {t("classicView")}
          </Link>
        </div>
      )}

      <EntityHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { href: "/markets", label: t("breadcrumbMarkets") },
              { href: "/markets", label: t("breadcrumbDiscovery") },
              {
                href: model.protocolHref ?? undefined,
                label: protocol?.name ?? instrument.assetProtocolId,
              },
              { label: instrument.symbol, current: true },
            ]}
          />
        }
        title={instrument.symbol}
        eyebrow={t("entityType")}
        badges={
          <>
            {model.protocolInvestment ? (
              <>
                <StatusChip
                  family="lifecycle"
                  code="STRUCTURING"
                  label={t("statusStructuring")}
                  className="uppercase tracking-[0.08em]"
                />
                <StatusChip
                  family="maturity"
                  code="CONCEPT"
                  label={t("noOffering")}
                  className="uppercase tracking-[0.08em]"
                />
              </>
            ) : (
              <>
                <StatusChip
                  family="lifecycle"
                  code={instrument.status}
                  label={t("statusIssued")}
                  className="uppercase tracking-[0.08em]"
                />
                <StatusChip
                  family="maturity"
                  code="DEMO"
                  label={t("demoMarket")}
                  className="uppercase tracking-[0.08em]"
                />
              </>
            )}
          </>
        }
        context={protocolContext}
        description={
          model.protocolInvestment ? t("protocolInvestmentDescription") : t("instrumentDescription")
        }
        actions={
          <AsOfTimestamp iso={model.asOf} locale={locale} label={t("asOf")} />
        }
      />

      {!model.protocolInvestment ? (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label={t("metricIssued")}
            value={
              model.issuedSupply !== null
                ? formatInteger(model.issuedSupply, locale)
                : t("notAvailable")
            }
            hint={issuedHint}
            icon={<BarChart3 className="size-4 text-[#0B5D3B]" />}
          />
          <MetricCard
            label={t("metricMarkets")}
            value={marketOpen ? "1" : "0"}
            hint={marketOpen ? t("activeMarket") : t("noOpenMarket")}
            icon={<Clock className="size-4 text-amber-700" />}
          />
          <MetricCard
            label={t("metricCoverage")}
            value={
              model.coverage
                ? `${formatInteger(model.coverage.eligibleCoverageTonnes, locale)} t`
                : t("notAvailable")
            }
            hint={
              model.coverage
                ? t("coverageOfGrossShort", {
                    percent: formatPercent(model.coverage.coverageRatioPercent, locale),
                  })
                : undefined
            }
            icon={<Shield className="size-4 text-[#0B5D3B]" />}
          />
          <MetricCard
            label={t("metricUnit")}
            value={t("unitValue", { symbol: instrument.symbol })}
            hint={t("unitEqualsHint")}
            icon={<Scale className="size-4 text-[#59645D]" />}
          />
          <MetricCard
            label={t("metricCurrency")}
            value={model.settlementCurrency ?? t("notAvailable")}
            hint={t("unitOfAccountHintShort")}
            icon={<Banknote className="size-4 text-[#0B5D3B]" />}
          />
        </div>
      ) : null}

      <ContextTabs ariaLabel={t("localNav")} moreLabel={t("moreTabs")} items={tabItems} />

      {tab === "overview" ? (
        <OverviewGrid
          model={model}
          locale={locale}
          chain={chain}
          basePath={basePath}
          marketHref={marketHref}
        />
      ) : null}
      {tab === "terms" ? <TermsPanel model={model} /> : null}
      {tab === "basis" ? (
        model.wheat ? (
          <EconomicBasisPanel
            title={t("economicBasis")}
            chain={chain}
            coverage={model.coverage}
            locale={locale}
            scasVerified={model.scasVerified}
            scasLabel={t("scasUnknown")}
            scasPendingHint={
              model.scasPendingCount
                ? t("scasPendingHint", { count: model.scasPendingCount })
                : undefined
            }
            callout={t("backingCallout")}
            labels={{
              gross: t("grossVolume"),
              eligible: t("eligibleCoverage"),
              ratio: t("coverageRatio"),
              verification: t("scasVerification"),
              insurance: t("insurance"),
              verified: t("verified"),
              unavailable: t("basisUnavailable"),
            }}
          />
        ) : (
          <EmptyState>{tCore("basisUnavailable")}</EmptyState>
        )
      ) : null}
      {tab === "risks" ? <RisksPanel model={model} /> : null}
      {tab === "market" ? (
        <MarketPanel model={model} locale={locale} marketHref={marketHref} />
      ) : null}
      {tab === "clearing" ? <ClearingPanel model={model} /> : null}
      {tab === "ownership" ? <OwnershipPanel model={model} locale={locale} full /> : null}
      {tab === "documents" ? (
        <EntityCard title={t("documents")}>
          <DocumentList
            items={model.documents}
            labels={{
              docInstrumentTerms: t("docInstrumentTerms"),
              docCoverageSnapshot: t("docCoverageSnapshot"),
              docIssuance: t("docIssuance"),
              docPrimaryPlacement: t("docPrimaryPlacement"),
              docAuditRegister: t("docAuditRegister"),
              record: t("inAppRecord"),
              workspace: t("workspaceRecord"),
            }}
            empty={tCore("documentsEmpty")}
          />
        </EntityCard>
      ) : null}
      {tab === "audit" ? <AuditPanel model={model} locale={locale} /> : null}
    </div>
  );
}

async function OverviewGrid({
  model,
  locale,
  chain,
  basePath,
  marketHref,
}: {
  model: InstrumentOverviewModel;
  locale: AppLocale;
  chain: string[];
  basePath: string;
  marketHref: string;
}) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  const { instrument, protocol, market } = model;
  const priceDecimals = instrument.decimals;

  return (
    <div className="grid gap-4 xl:grid-cols-4">
        <EntityCard title={t("instrumentSummary")}>
          <FactList
            items={[
              {
                label: t("assetClass"),
                value: lookupMessage(tCore, ASSET_CLASS_KEYS[instrument.assetClass]),
              },
              {
                label: t("protocol"),
                value: protocol ? (
                  <Link href={`/protocols/${protocol.id}`} className="text-primary hover:underline">
                    {protocol.name}
                  </Link>
                ) : (
                  instrument.assetProtocolId
                ),
              },
              { label: t("issuer"), value: instrument.issuerName },
              {
                label: t("issuanceRef"),
                value: instrument.issuanceId ?? t("notAvailable"),
                mono: Boolean(instrument.issuanceId),
              },
              {
                label: t("instrumentType"),
                value: model.protocolInvestment
                  ? t("typeProtocolInvestment")
                  : t("typeAssetInstrument"),
              },
              {
                label: t("unitOfAccount"),
                value: model.settlementCurrency ?? instrument.currencyOrUnit,
              },
              {
                label: t("currentMarket"),
                value: market?.id ?? t("notAvailable"),
                mono: Boolean(market?.id),
              },
              {
                label: t("marketStatus"),
                value: market ? (
                  <StatusChip
                    family="market"
                    code={market.demonstratorStatus}
                    label={
                      market.demonstratorStatus === "DEMO_OPEN" ? t("statusOpen") : t("statusClosed")
                    }
                  />
                ) : (
                  t("notAvailable")
                ),
              },
            ]}
          />
        </EntityCard>

        <EntityCard title={t("termsGlance")}>
          {model.protocolInvestment ? (
            <EmptyState>{tCore("noFakeEconomics")}</EmptyState>
          ) : (
            <FactList
              items={[
                { label: t("claimType"), value: t("claimAgainstIssuer") },
                {
                  label: t("underlying"),
                  value: model.underlyingReference ?? t("notAvailable"),
                },
                {
                  label: t("unitExposure"),
                  value: model.unitExposure
                    ? t("tonnePerInstrument", { value: model.unitExposure })
                    : t("notAvailable"),
                },
                {
                  label: t("maturity"),
                  value: model.redemption ?? tCore("workingHypothesis"),
                },
                { label: t("clearingModel"), value: t("dvp") },
                { label: t("registryModel"), value: t("registryModelValue") },
              ]}
            />
          )}
        </EntityCard>

        {model.wheat ? (
          <EconomicBasisPanel
            title={t("economicBasis")}
            chain={chain}
            coverage={model.coverage}
            locale={locale}
            scasVerified={model.scasVerified}
            scasLabel={t("scasUnknown")}
            callout={t("backingCallout")}
            compact
            labels={{
              gross: t("grossVolume"),
              eligible: t("eligibleCoverage"),
              ratio: t("coverageRatio"),
              verification: t("scasVerification"),
              insurance: t("insurance"),
              verified: t("verified"),
              unavailable: t("basisUnavailable"),
            }}
          />
        ) : (
          <EntityCard title={t("economicBasis")}>
            <EmptyState>{tCore("basisUnavailable")}</EmptyState>
          </EntityCard>
        )}

        <EntityCard
          title={t("marketSnapshot")}
          footer={
            market ? (
              <Link
                href={marketHref}
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                {t("openMarketWorkspace")}
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            ) : null
          }
        >
          {market ? (
            <FactList
              items={[
                {
                  label: t("currentMarket"),
                  value: market.id,
                  mono: true,
                },
                {
                  label: t("marketStatus"),
                  value: (
                    <StatusChip
                      family="market"
                      code={market.demonstratorStatus}
                      label={
                        market.demonstratorStatus === "DEMO_OPEN"
                          ? t("statusOpen")
                          : t("statusClosed")
                      }
                    />
                  ),
                },
                {
                  label: t("lastMatched"),
                  value: model.bookAvailable
                    ? model.lastTrade
                      ? formatMarketPrice(model.lastTrade.price, locale, priceDecimals)
                      : t("noTrades")
                    : t("bookUnavailable"),
                },
                {
                  label: t("bestBid"),
                  value: model.bestBid
                    ? formatMarketPrice(model.bestBid.price, locale, priceDecimals)
                    : t("none"),
                },
                {
                  label: t("bestAsk"),
                  value: model.bestAsk
                    ? formatMarketPrice(model.bestAsk.price, locale, priceDecimals)
                    : t("none"),
                },
                {
                  label: t("matchedVolume"),
                  value:
                    model.matchedNotional === null
                      ? t("bookUnavailable")
                      : formatDemoKzt(model.matchedNotional, locale),
                },
              ]}
            />
          ) : (
            <EmptyState>{t("noMarket")}</EmptyState>
          )}
        </EntityCard>

        <OwnershipPanel model={model} locale={locale} />
        <RisksPanel model={model} compact />
        <EntityCard title={t("documents")}>
          <DocumentList
            items={model.documents}
            labels={{
              docInstrumentTerms: t("docInstrumentTerms"),
              docCoverageSnapshot: t("docCoverageSnapshot"),
              docIssuance: t("docIssuance"),
              docPrimaryPlacement: t("docPrimaryPlacement"),
              docAuditRegister: t("docAuditRegister"),
              record: t("inAppRecord"),
              workspace: t("workspaceRecord"),
            }}
            empty={tCore("documentsEmpty")}
          />
        </EntityCard>
        <RecentActivity
          model={model}
          locale={locale}
          viewAllHref={instrumentShellHref(instrument.id, "audit", basePath)}
        />
    </div>
  );
}

async function TermsPanel({ model }: { model: InstrumentOverviewModel }) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  if (model.protocolInvestment) {
    return <EmptyState>{tCore("noFakeEconomics")}</EmptyState>;
  }
  return (
    <EntityCard title={t("sectionTerms")}>
      <FactList
        items={[
          { label: t("claimType"), value: t("claimAgainstIssuer") },
          { label: tCore("claimBoundary"), value: tCore("claimBoundary") },
          { label: tCore("coverageNotPledge"), value: tCore("coverageNotPledge") },
          { label: tCore("demoKzt"), value: tCore("demoKzt") },
          {
            label: t("maturity"),
            value: model.redemption ?? tCore("workingHypothesis"),
          },
          { label: t("clearingModel"), value: t("dvp") },
          { label: t("registryModel"), value: t("registryModelValue") },
          { label: tCore("devnet"), value: tCore("devnet") },
        ]}
      />
    </EntityCard>
  );
}

async function RisksPanel({
  model,
  compact,
}: {
  model: InstrumentOverviewModel;
  compact?: boolean;
}) {
  const t = await getTranslations("institutional");
  if (model.risks.length === 0) {
    return (
      <EntityCard title={t("keyRisks")}>
        <EmptyState>{t("risksUnavailable")}</EmptyState>
      </EntityCard>
    );
  }
  return (
    <EntityCard title={t("keyRisks")}>
      <ul className="space-y-3">
        {model.risks.map((risk) => (
          <li key={risk.id} className="flex gap-2.5">
            <AlertTriangle
              className={
                risk.tone === "danger"
                  ? "mt-0.5 size-4 shrink-0 text-red-700"
                  : risk.tone === "warning"
                    ? "mt-0.5 size-4 shrink-0 text-amber-700"
                    : "mt-0.5 size-4 shrink-0 text-sky-800"
              }
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium">{lookupMessage(t, risk.titleKey)}</p>
              {compact ? null : (
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {lookupMessage(t, risk.bodyKey)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </EntityCard>
  );
}

async function MarketPanel({
  model,
  locale,
  marketHref,
}: {
  model: InstrumentOverviewModel;
  locale: AppLocale;
  marketHref: string;
}) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  const tSec = await getTranslations("secondary");
  if (!model.market) {
    return <EmptyState>{t("noMarket")}</EmptyState>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{tCore("marketClosed")}</p>
      <p className="text-sm text-muted-foreground">{tSec("matchedNotSettled")}</p>
      <EntityCard
        title={t("marketSnapshot")}
        action={
          <Link
            href={marketHref}
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t("openMarketWorkspace")}
          </Link>
        }
      >
        <FactList
          items={[
            { label: t("currentMarket"), value: model.market.id, mono: true },
            {
              label: t("marketStatus"),
              value: (
                <StatusChip
                  family="market"
                  code={model.market.demonstratorStatus}
                  label={
                    model.market.demonstratorStatus === "DEMO_OPEN"
                      ? t("statusOpen")
                      : t("statusClosed")
                  }
                />
              ),
            },
            {
              label: t("lastMatched"),
              value: model.lastTrade
                ? formatMarketPrice(model.lastTrade.price, locale, model.instrument.decimals)
                : t("noTrades"),
            },
            {
              label: t("settlementNote"),
              value: model.market.settlementEnabled ? t("settlementOn") : t("settlementOff"),
            },
          ]}
        />
      </EntityCard>
    </div>
  );
}

async function ClearingPanel({ model }: { model: InstrumentOverviewModel }) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{tCore("clearingDistinct")}</p>
      <MarketClearingSplit
        distinction={t("matchedNotSettled")}
        marketTitle={tCore("marketFlow")}
        clearingTitle={tCore("clearingFlow")}
        marketSteps={[tCore("order"), tCore("matching"), tCore("trade")]}
        clearingSteps={[
          tCore("trade"),
          tCore("eligibilityRecheck"),
          tCore("sellerReservation"),
          tCore("buyerReservation"),
          tCore("dvp"),
          tCore("registryUpdate"),
          tCore("finalSettlement"),
        ]}
      />
      {model.wheat ? (
        <EntityCard title={tCore("primaryEvidence")}>
          <p className="font-mono text-sm">{tCore("placementId")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{tCore("notSecondaryClearing")}</p>
        </EntityCard>
      ) : (
        <EmptyState>{tCore("noSecondaryTrade")}</EmptyState>
      )}
    </div>
  );
}

async function OwnershipPanel({
  model,
  locale,
  full,
}: {
  model: InstrumentOverviewModel;
  locale: AppLocale;
  full?: boolean;
}) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  const total = model.issuedSupply ?? 0;
  if (model.holdings.length === 0) {
    return (
      <EntityCard title={t("ownershipSnapshot")}>
        <EmptyState>{tCore("noFakeEconomics")}</EmptyState>
      </EntityCard>
    );
  }
  return (
    <EntityCard
      title={t("ownershipSnapshot")}
      footer={tCore("legalOwnership")}
    >
      <Table className="min-w-[20rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("registeredOwner")}</TableHead>
            <TableHead className="text-right">{t("instrumentsCol")}</TableHead>
            <TableHead className="text-right">{t("pctSupply")}</TableHead>
            {full ? (
              <>
                <TableHead className="text-right">{tCore("available")}</TableHead>
                <TableHead className="text-right">{tCore("reserved")}</TableHead>
                <TableHead className="text-right">{tCore("pendingIn")}</TableHead>
                <TableHead className="text-right">{tCore("pendingOut")}</TableHead>
                <TableHead className="text-right">{tCore("pledged")}</TableHead>
                <TableHead className="text-right">{tCore("blocked")}</TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.holdings.map((row) => (
            <TableRow key={row.id} className="h-10">
              <TableCell>{row.holderName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatInteger(row.registered, locale)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {total > 0 ? formatPercent((row.registered / total) * 100, locale, 2) : "—"}
              </TableCell>
              {full ? (
                <>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(row.available, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(row.reserved, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(row.pendingIn, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(row.pendingOut, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(row.pledged, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(row.blocked, locale)}
                  </TableCell>
                </>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {full && model.pendingMovements ? (
        <p className="mt-3 text-[12px] text-muted-foreground">{t("pendingSeparate")}</p>
      ) : null}
    </EntityCard>
  );
}

async function RecentActivity({
  model,
  locale,
  viewAllHref,
}: {
  model: InstrumentOverviewModel;
  locale: AppLocale;
  viewAllHref: string;
}) {
  const t = await getTranslations("institutional");
  const tAudit = await getTranslations("audit");
  const items = selectOverviewActivity(model.activity).map((item) => ({
    ...item,
    label: activityLabel(item, t, tAudit),
  }));
  return (
    <EntityCard
      title={t("recentActivity")}
      footer={
        <Link href={viewAllHref} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          {t("viewAllActivity")}
        </Link>
      }
    >
      <AuditTimeline
        items={items}
        locale={locale}
        recordedLabel={t("recordedNoTimestamp")}
        empty={t("noActivity")}
      />
    </EntityCard>
  );
}

async function AuditPanel({
  model,
  locale,
}: {
  model: InstrumentOverviewModel;
  locale: AppLocale;
}) {
  const t = await getTranslations("institutional");
  const tCore = await getTranslations("marketCore");
  const tAudit = await getTranslations("audit");
  const items = model.activity.map((item) => ({
    ...item,
    label: activityLabel(item, t, tAudit),
  }));
  const groups = GOVERNANCE_GROUPS.map((group) => ({
    title: lookupMessage(t, group.titleKey),
    steps: group.stages.map((stage) => {
      const record = model.admission.find((item) => item.stage === stage);
      return {
        id: stage,
        label: lookupMessage(tCore, `stage${stage}`),
        complete: Boolean(record?.complete),
        completeLabel: tCore("stageComplete"),
        openLabel: tCore("stageOpen"),
      };
    }),
  }));

  return (
    <div className="space-y-4">
      <EntityCard
        title={tCore("admissionTitle")}
        description={`${tCore("platformWorkflow")} · ${tCore("formalApproval")}: ${tCore("formalApprovalNote")}`}
      >
        <GovernanceWorkflow groups={groups} />
      </EntityCard>
      <EntityCard title={t("recentActivity")}>
        <AuditTimeline
          items={items}
          locale={locale}
          recordedLabel={t("recordedNoTimestamp")}
          empty={t("noActivity")}
        />
      </EntityCard>
    </div>
  );
}

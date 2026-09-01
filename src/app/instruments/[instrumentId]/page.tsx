import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { TokenMintProofPanel } from "@/components/tokens/token-mint-proof-panel";
import { InstrumentSectionNav } from "@/components/market-core/instrument-section-nav";
import { MarketClearingSplit } from "@/components/market-core/market-clearing-split";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { SpvStack } from "@/components/market-core/spv-stack";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import {
  DeskLedger,
  DeskNote,
  DeskRow,
  DeskSplit,
  deskIndex,
} from "@/components/surface/desk-stage";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ON_CHAIN_DEMO_POOL_ID } from "@/adapters/blockchain";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { INSTRUMENT_SECTIONS } from "@/domain/market-core";
import { actorCan } from "@/domain/identity";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatPercent } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import { boundProtocolVersionHref, instrumentTrail } from "@/lib/market-core/hierarchy";
import {
  ASSET_CLASS_KEYS,
  INSTRUMENT_SECTION_KEYS,
  PROTOCOL_INVESTMENT_MODEL_KEYS,
  f2fModuleHref,
  parseInstrumentSection,
} from "@/lib/market-core/presentation";
import { getPlacementSnapshot } from "@/services/placement-service";
import { getScasSnapshot } from "@/services/scas-service";
import { getTokenBySymbol } from "@/services/token-service";
import {
  getInstrumentMarketContext,
  getProtocolContext,
  listAdmission,
  listHoldings,
  listMarketInstruments,
} from "@/services/market-core-service";

export const dynamicParams = false;

export function generateStaticParams() {
  return listMarketInstruments().map((instrument) => ({
    instrumentId: instrument.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ instrumentId: string }>;
}): Promise<Metadata> {
  const { instrumentId } = await params;
  return { title: instrumentId };
}

export default async function InstrumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ instrumentId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { instrumentId } = await params;
  const { section: sectionParam } = await searchParams;
  const actor = await requirePermission("issuance.read", "market.read");
  const context = getInstrumentMarketContext(instrumentId);
  if (!context) {
    notFound();
  }
  const t = await getTranslations("marketCore");
  const locale = (await getLocale()) as AppLocale;
  const section = parseInstrumentSection(sectionParam);
  const { instrument, protocol, market, protocolVersion } = context;
  const protocolContext = getProtocolContext(instrument.assetProtocolId);
  // Derived from the instrument's own permanent binding, never from the
  // protocol's mutable currentVersionId.
  const versionHref = boundProtocolVersionHref(instrument);
  const wheat = instrument.id === "WHEAT-2027";
  const protocolInvestment = instrument.instrumentType === "PROTOCOL_INVESTMENT";
  const snapshot = wheat ? await getPlacementSnapshot() : null;
  const tokenDetail = wheat ? getTokenBySymbol(instrument.symbol) : null;
  const coverage = wheat ? wheatPoolCoverageFromEngine() : null;
  const scas = wheat ? getScasSnapshot() : null;
  const holdings = listHoldings({ instrumentId: instrument.id });
  const admission = listAdmission(instrument.id);
  const vehicle = protocolContext?.vehicle ?? null;
  const sectionLabels = Object.fromEntries(
    INSTRUMENT_SECTIONS.map((item) => [item, lookupMessage(t, INSTRUMENT_SECTION_KEYS[item])]),
  ) as Record<(typeof INSTRUMENT_SECTIONS)[number], string>;
  const poolHref = actorCan(actor, "pools.read")
    ? `/pools/${ON_CHAIN_DEMO_POOL_ID}`
    : undefined;
  const dacHref = f2fModuleHref("dacs", actor);
  const monitoringHref = f2fModuleHref("monitoring", actor);

  return (
    <div>
      <MarketCoreContextHeader
        level="INSTRUMENT"
        trail={instrumentTrail(instrument, protocol)}
        title={instrument.symbol}
        description={instrument.name}
        translate={t}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        {protocolInvestment ? (
          <>
            <MarketStatusChip label={t("protocolInvestmentStatus")} tone="STRUCTURING" />
            <MarketStatusChip label={t("noOffering")} tone="FUTURE" />
            <MarketStatusChip label={t("notIssued")} tone="FUTURE" />
            <MarketStatusChip label={t("notAdmitted")} tone="FUTURE" />
          </>
        ) : (
          <>
            <MarketStatusChip
              label={lookupMessage(t, `type${instrument.instrumentType}`)}
              tone="ACTIVE"
            />
            <MarketStatusChip
              label={
                instrument.status === "ISSUED"
                  ? t("issuedDemonstratorInstrument")
                  : lookupMessage(t, `status${instrument.status}`)
              }
              tone={instrument.status}
            />
          </>
        )}
      </div>
      {protocolInvestment ? (
        <DeskNote className="mb-4">
          {t("protocolInvestmentNote")} {t("protocolInvestmentFlags")}
        </DeskNote>
      ) : null}

      <InstrumentSectionNav
        instrumentId={instrument.id}
        active={section}
        labels={sectionLabels}
        ariaLabel={t("instrumentsTitle")}
      />

      {section === "overview" ? (
        <div className="space-y-8">
          <DataList
            items={[
              {
                label: t("assetClass"),
                value: lookupMessage(t, ASSET_CLASS_KEYS[instrument.assetClass]),
              },
              {
                label: t("levelProtocol"),
                value: protocol ? (
                  <Link
                    href={`/protocols/${protocol.id}`}
                    className="text-primary hover:underline"
                  >
                    {protocol.name}
                  </Link>
                ) : (
                  instrument.assetProtocolId
                ),
              },
              {
                label: t("boundProtocolVersion"),
                value:
                  protocolVersion && versionHref ? (
                    <Link href={versionHref} className="text-primary hover:underline">
                      {`${protocolVersion.id} · ${protocolVersion.displayVersion}`}
                    </Link>
                  ) : (
                    t("notBoundToProtocolVersion")
                  ),
              },
              { label: t("rowSpv"), value: instrument.issuerName },
              { label: t("issuance"), value: instrument.issuanceId ?? "—" },
              { label: t("regulatory"), value: t("demonstratorOnly") },
            ]}
          />
          <p className="text-xs text-straw">
            {protocolVersion ? t("boundAtIssuance") : t("notBoundToProtocolVersion")}
          </p>
          <SpvStack
            title={t("spvTitle")}
            rows={[
              { label: t("rowProtocol"), value: protocol?.name ?? instrument.assetProtocolId },
              { label: t("rowSpv"), value: instrument.issuerName },
              { label: t("rowInstrument"), value: instrument.symbol },
              { label: t("rowMarket"), value: t("marketCore") },
            ]}
          />
          {snapshot ? (
            <MetricStrip className="sm:grid-cols-2 lg:grid-cols-4">
              <MetricCell
                label={t("owned")}
                value={formatInteger(snapshot.supply.mintedSupply, locale)}
              />
              <MetricCell
                label={t("placement")}
                value={formatInteger(snapshot.supply.placed, locale)}
              />
              <MetricCell
                label={t("heldBy")}
                value={formatInteger(snapshot.supply.circulating, locale)}
              />
              <MetricCell label={t("sectionMarket")} value={t("primaryOnly")} />
            </MetricStrip>
          ) : (
            <EmptyState>{t("noFakeEconomics")}</EmptyState>
          )}
        </div>
      ) : null}

      {section === "terms" ? (
        protocolInvestment ? (
          <div className="space-y-4">
            <EmptyState>{t("noFakeEconomics")}</EmptyState>
            <DataList
              items={[
                { label: t("useOfProceeds"), value: t("useOfProceedsValue") },
                {
                  label: t("possibleModels"),
                  value: vehicle
                    ? vehicle.possibleModels
                        .map((model) =>
                          lookupMessage(t, PROTOCOL_INVESTMENT_MODEL_KEYS[model]),
                        )
                        .join(" · ")
                    : t("protocolInvestmentStatus"),
                },
              ]}
            />
          </div>
        ) : (
          <DataList
            items={[
              { label: t("unitClaim"), value: instrument.denomination },
              { label: t("claimBoundary"), value: t("claimBoundary") },
              { label: t("coverageNotPledge"), value: t("coverageNotPledge") },
              { label: t("demoKzt"), value: t("demoKzt") },
              { label: t("simulation"), value: t("simulation") },
              { label: t("devnet"), value: t("devnet") },
              {
                label: t("redemption"),
                value: tokenDetail?.token.terms.redemptionWindow ?? t("workingHypothesis"),
              },
            ]}
          />
        )
      ) : null}

      {section === "basis" ? (
        wheat && coverage && scas ? (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">{t("basisAgriculture")}</p>
            <DataList
              items={[
                {
                  label: t("pool"),
                  value: poolHref ? (
                    <Link
                      href={poolHref}
                      className="font-tabular text-xs text-primary hover:underline"
                    >
                      {ON_CHAIN_DEMO_POOL_ID}
                    </Link>
                  ) : (
                    ON_CHAIN_DEMO_POOL_ID
                  ),
                },
                {
                  label: t("moduleDacs"),
                  value: dacHref ? (
                    <Link href={dacHref} className="text-primary hover:underline">
                      {t("moduleDacs")}
                    </Link>
                  ) : (
                    t("moduleDacs")
                  ),
                },
                {
                  label: t("moduleScas"),
                  value: formatInteger(scas.attestedCount, locale),
                },
                {
                  label: t("moduleMonitoring"),
                  value: monitoringHref ? (
                    <Link href={monitoringHref} className="text-primary hover:underline">
                      {t("moduleMonitoring")}
                    </Link>
                  ) : (
                    t("moduleMonitoring")
                  ),
                },
                {
                  label: t("insurance"),
                  value:
                    coverage.adjustments.find((item) => item.key === "insurance")?.label ??
                    t("insurance"),
                },
              ]}
            />
            <MetricStrip>
              <MetricCell
                label={t("gross")}
                value={formatInteger(coverage.grossVolumeTonnes, locale)}
              />
              <MetricCell
                label={t("eligibleCoverage")}
                value={formatInteger(coverage.eligibleCoverageTonnes, locale)}
              />
              <MetricCell
                label={t("moduleCoverage")}
                value={formatPercent(coverage.totalHaircutPercent, locale)}
              />
            </MetricStrip>
          </div>
        ) : (
          <div className="space-y-3">
            <EmptyState>{t("basisUnavailable")}</EmptyState>
            {instrument.assetClass === "WATER" ? (
              <p className="text-sm text-muted-foreground">{t("futureWaterBasis")}</p>
            ) : null}
            {instrument.assetClass === "MUSIC_RIGHTS" ? (
              <p className="text-sm text-muted-foreground">{t("futureMusicBasis")}</p>
            ) : null}
          </div>
        )
      ) : null}

      {section === "risk" ? (
        <DataList
          items={[
            { label: t("sectionRisk"), value: t("riskNote") },
            { label: t("coverageNotPledge"), value: t("coverageNotPledge") },
            {
              label: t("moduleCoverage"),
              value: coverage
                ? formatPercent(coverage.totalHaircutPercent, locale)
                : t("protocolInvestmentStatus"),
            },
          ]}
        />
      ) : null}

      {section === "market" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("marketClosed")}</p>
          {market?.phase === "SECONDARY_OPEN" ? (
            <p className="text-sm">
              <Link href="/secondary" className="text-primary hover:underline">
                {t("stageSECONDARY_MARKET")}
              </Link>
            </p>
          ) : null}
          <DataList
            items={[
              {
                label: t("sectionMarket"),
                value: market ? t("primaryOnly") : t("protocolInvestmentStatus"),
              },
              { label: t("marketStatus"), value: market?.id ?? t("protocolInvestmentStatus") },
            ]}
          />
          <MarketClearingSplit
            distinction={t("clearingDistinct")}
            marketTitle={t("marketFlow")}
            clearingTitle={t("clearingFlow")}
            marketSteps={[t("order"), t("matching"), t("trade")]}
            clearingSteps={[
              t("trade"),
              t("eligibilityRecheck"),
              t("sellerReservation"),
              t("buyerReservation"),
              t("dvp"),
              t("registryUpdate"),
              t("finalSettlement"),
            ]}
          />
        </div>
      ) : null}

      {section === "clearing" ? (
        <div className="space-y-4">
          <MarketClearingSplit
            distinction={t("clearingDistinct")}
            marketTitle={t("marketFlow")}
            clearingTitle={t("clearingFlow")}
            marketSteps={[t("order"), t("matching"), t("trade")]}
            clearingSteps={[
              t("trade"),
              t("eligibilityRecheck"),
              t("sellerReservation"),
              t("buyerReservation"),
              t("dvp"),
              t("registryUpdate"),
              t("finalSettlement"),
              t("audit"),
            ]}
          />
          {wheat ? (
            <PageSection title={t("primaryEvidence")}>
              <p className="text-sm">
                {t("placementId")} · {t("notSecondaryClearing")}
              </p>
            </PageSection>
          ) : (
            <EmptyState>{t("noSecondaryTrade")}</EmptyState>
          )}
        </div>
      ) : null}

      {section === "ownership" ? (
        holdings.length > 0 ? (
          <DeskSplit
            compact={
              <DeskLedger>
                {holdings.map((holding, index) => (
                  <DeskRow
                    key={holding.id}
                    index={deskIndex(index)}
                    title={holding.holderName}
                    value={formatInteger(holding.buckets.owned, locale)}
                    hint={`${t("available")} ${formatInteger(holding.available, locale)}`}
                  />
                ))}
              </DeskLedger>
            }
            wide={
              <Table className="min-w-[40rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("holder")}</TableHead>
                <TableHead className="text-right">{t("owned")}</TableHead>
                <TableHead className="text-right">{t("available")}</TableHead>
                <TableHead className="text-right">{t("reserved")}</TableHead>
                <TableHead className="text-right">{t("pledged")}</TableHead>
                <TableHead className="text-right">{t("blocked")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((holding) => (
                <TableRow key={holding.id}>
                  <TableCell>{holding.holderName}</TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(holding.buckets.owned, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(holding.available, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(holding.buckets.reservedForOrders, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(holding.buckets.pledged, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(holding.buckets.blocked, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            }
          />
        ) : (
          <EmptyState>{t("noFakeEconomics")}</EmptyState>
        )
      ) : null}

      {section === "documents" ? <EmptyState>{t("documentsEmpty")}</EmptyState> : null}

      {section === "audit" ? (
        <div className="space-y-6">
          <PageSection title={t("admissionTitle")} description={t("admissionIntro")} className="mt-0">
            <p className="mb-3 text-xs text-muted-foreground">
              {t("platformWorkflow")} · {t("formalApproval")}: {t("formalApprovalNote")}
            </p>
            <DeskLedger>
              {admission.map((item, index) => (
                <DeskRow
                  key={item.stage}
                  index={deskIndex(index)}
                  title={lookupMessage(t, `stage${item.stage}`)}
                  value={
                    <MarketStatusChip
                      label={item.complete ? t("stageComplete") : t("stageOpen")}
                      tone={item.complete ? "ACTIVE" : "FUTURE"}
                    />
                  }
                />
              ))}
            </DeskLedger>
          </PageSection>
          {snapshot ? (
            <TokenMintProofPanel
              lookup={snapshot.mintLookup}
              locale={locale}
              registrarInventory={snapshot.supply.registrarInventory}
            />
          ) : null}
          <p className="text-sm text-muted-foreground">
            <Link href="/audit" className="text-primary hover:underline">
              {t("auditLink")}
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
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
import { formatInteger, formatPercent } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import { ASSET_CLASS_KEYS, protocolStatusKey } from "@/lib/market-core/presentation";
import { listParticipantCompliance } from "@/services/compliance-service";
import { listAuditEvents } from "@/services/regulator-service";
import {
  listAssetInstruments,
  listAssetProtocols,
  listHoldings,
  listProtocolInvestments,
} from "@/services/market-core-service";
import {
  getSecondaryEngineState,
  overlayWorkingHoldings,
  secondarySurveillance,
} from "@/services/secondary-market-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("supervisionTitle") };
}

export default async function SupervisionPage() {
  await requirePermission("regulator.read");
  const t = await getTranslations("marketCore");
  const tSec = await getTranslations("secondary");
  const locale = (await getLocale()) as AppLocale;
  const protocols = listAssetProtocols();
  const issued = listAssetInstruments().filter((item) => item.status === "ISSUED");
  const concepts = [
    ...listAssetInstruments().filter((item) => item.status !== "ISSUED"),
    ...listProtocolInvestments(),
  ];
  const engine = await getSecondaryEngineState();
  const holdings = overlayWorkingHoldings(
    listHoldings({ instrumentId: "WHEAT-2027" }),
    engine,
  );
  const surveillance = secondarySurveillance(engine);
  const totalOwned = holdings.reduce((sum, row) => sum + row.buckets.owned, 0);
  const blocked = listParticipantCompliance().filter(
    (row) => row.record.eligibility === "BLOCKED",
  );
  const auditCount = listAuditEvents().length;

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("supervisionTitle")}
        description={t("supervisionIntro")}
      />

      <MetricStrip className="sm:grid-cols-2 lg:grid-cols-5">
        <MetricCell label={t("marketStatus")} value={t("closedSecondary")} />
        <MetricCell
          label={t("issuedInstruments")}
          value={formatInteger(issued.length, locale)}
        />
        <MetricCell
          label={t("conceptsStructuring")}
          value={formatInteger(concepts.length, locale)}
        />
        <MetricCell label={t("tradingActivity")} value={t("idle")} />
        <MetricCell label={t("clearingStatus")} value={t("idle")} />
      </MetricStrip>

      <PageSection title={t("issuedInstruments")}>
        <ul className="space-y-2 text-sm">
          {issued.map((item) => (
            <li key={item.id}>
              <Link href={`/instruments/${item.id}`} className="text-primary hover:underline">
                {item.symbol}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">
                {t("issuedDemonstratorInstrument")}
              </span>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection title={t("conceptsStructuring")}>
        <ul className="space-y-2 text-sm">
          {concepts.map((item) => (
            <li key={item.id}>
              <Link href={`/instruments/${item.id}`} className="text-primary hover:underline">
                {item.instrumentType === "PROTOCOL_INVESTMENT" ? item.name : item.symbol}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">
                {t("protocolInvestmentStatus")} · {t("protocolInvestmentFlags")}
              </span>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection title={tSec("title")} description={tSec("matchedNotSettled")}>
        <DataList
          items={[
            { label: tSec("marketId"), value: "MKT-WHEAT-2027-DEMO-KZT" },
            { label: t("marketStatus"), value: tSec("demoOpen") },
            {
              label: tSec("openOrders"),
              value: formatInteger(surveillance.openOrders.length, locale),
            },
            {
              label: tSec("matchedTrades"),
              value: formatInteger(surveillance.matchedTrades.length, locale),
            },
            {
              label: tSec("pendingSettlements"),
              value: formatInteger(surveillance.pendingSettlements.length, locale),
            },
            {
              label: t("failedSettlements"),
              value: formatInteger(surveillance.failedSettlements.length, locale),
            },
            {
              label: tSec("rejectedOrders"),
              value: formatInteger(surveillance.rejected.length, locale),
            },
            {
              label: tSec("eligibilityRejects"),
              value: formatInteger(surveillance.eligibilityRejects.length, locale),
            },
          ]}
        />
      </PageSection>

      <PageSection title={t("failedSettlements")}>
        <EmptyState>{t("none")}</EmptyState>
      </PageSection>

      <PageSection title={tSec("rejectedOrders")}>
        {surveillance.rejected.length === 0 ? (
          <EmptyState>{t("none")}</EmptyState>
        ) : (
          <DataList
            items={surveillance.rejected.map((order) => ({
              label: order.id,
              value: order.rejectReason ?? order.status,
            }))}
          />
        )}
      </PageSection>

      <PageSection title={tSec("eligibilityRejects")}>
        {surveillance.eligibilityRejects.length === 0 ? (
          <EmptyState>{t("none")}</EmptyState>
        ) : (
          <DataList
            items={surveillance.eligibilityRejects.map((order) => ({
              label: order.id,
              value: order.participantId,
            }))}
          />
        )}
      </PageSection>

      <PageSection title={t("backingExceptions")}>
        <EmptyState>{t("none")}</EmptyState>
      </PageSection>

      <PageSection title={t("complianceExceptions")}>
        {blocked.length === 0 ? (
          <EmptyState>{t("none")}</EmptyState>
        ) : (
          <DataList
            items={blocked.map((row) => ({
              label: row.participant.name,
              value: row.record.eligibility,
            }))}
          />
        )}
      </PageSection>

      <PageSection title={`${t("issuedInstrumentConcentration")} · WHEAT-2027`}>
        <DataList
          items={holdings.map((row) => ({
            label: row.holderName,
            value:
              totalOwned > 0
                ? `${formatInteger(row.buckets.owned, locale)} · ${formatPercent(
                    (row.buckets.owned / totalOwned) * 100,
                    locale,
                  )}`
                : formatInteger(row.buckets.owned, locale),
          }))}
        />
      </PageSection>

      <PageSection title={t("blockedTransfers")}>
        <EmptyState>{t("noRestrictions")}</EmptyState>
      </PageSection>

      <PageSection title={tSec("marketEvents")}>
        {engine.events.length === 0 ? (
          <EmptyState>{t("none")}</EmptyState>
        ) : (
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{tSec("time")}</TableHead>
                <TableHead>{tSec("eventType")}</TableHead>
                <TableHead>{tSec("actor")}</TableHead>
                <TableHead>{tSec("participant")}</TableHead>
                <TableHead>{t("instrument")}</TableHead>
                <TableHead>{tSec("marketId")}</TableHead>
                <TableHead>{tSec("entityId")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...engine.events].reverse().map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-tabular text-xs">{event.timestamp}</TableCell>
                  <TableCell className="font-mono text-xs">{event.type}</TableCell>
                  <TableCell className="text-xs">{event.actor}</TableCell>
                  <TableCell className="text-xs">{event.participantId ?? "—"}</TableCell>
                  <TableCell className="text-xs">{event.instrumentId}</TableCell>
                  <TableCell className="font-mono text-xs">{event.marketId}</TableCell>
                  <TableCell className="font-mono text-xs">{event.entityId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>

      <PageSection title={t("auditEvents")}>
        <p className="text-sm text-muted-foreground">
          {formatInteger(auditCount, locale)} ·{" "}
          <Link href="/audit" className="text-primary hover:underline">
            {t("auditLink")}
          </Link>
        </p>
      </PageSection>

      <PageSection title={t("verification")} description={t("differentModels")}>
        <ul className="grid gap-3">
          {protocols.map((protocol) => (
            <li key={protocol.id} className="border border-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/protocols/${protocol.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {protocol.name}
                </Link>
                <MarketStatusChip
                  label={lookupMessage(t, protocolStatusKey(protocol.status))}
                  tone={protocol.status}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass])}
              </p>
              <p className="mt-2 text-sm">
                {t("verification")}: {protocol.verificationModel}
              </p>
            </li>
          ))}
        </ul>
      </PageSection>

      <p className="mt-6 text-xs text-muted-foreground">
        {tSec("matchedNotSettled")} · {t("idle")}
      </p>
    </div>
  );
}

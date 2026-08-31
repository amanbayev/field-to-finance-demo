import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import {
  DeskLedger,
  DeskNote,
  DeskRow,
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
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatPercent } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import { ASSET_CLASS_KEYS, protocolStatusKey } from "@/lib/market-core/presentation";
import { listParticipantCompliance } from "@/services/compliance-service";
import { listAuditEvents } from "@/services/regulator-service";
import {
  listAssetInstruments,
  listAssetProtocolsWithCurrentVersion,
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
  const protocols = listAssetProtocolsWithCurrentVersion();
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
  const marketEvents = [...engine.events].reverse();

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("supervisionTitle")}
        description={t("supervisionIntro")}
        photo="/media/grain-kernel-macro.png"
      />

      <MetricStrip className="sm:grid-cols-2 lg:grid-cols-5">
        <MetricCell label={t("marketStatus")} value={tSec("demoOpen")} />
        <MetricCell
          label={t("issuedInstruments")}
          value={formatInteger(issued.length, locale)}
        />
        <MetricCell
          label={t("conceptsStructuring")}
          value={formatInteger(concepts.length, locale)}
        />
        <MetricCell
          label={tSec("matchedTrades")}
          value={formatInteger(surveillance.matchedTrades.length, locale)}
        />
        <MetricCell
          label={tSec("pendingSettlements")}
          value={formatInteger(surveillance.pendingSettlements.length, locale)}
        />
      </MetricStrip>

      <PageSection title={t("issuedInstruments")}>
        <DeskLedger>
          {issued.map((item, index) => (
            <DeskRow
              key={item.id}
              href={`/instruments/${item.id}`}
              index={deskIndex(index)}
              kicker={lookupMessage(t, ASSET_CLASS_KEYS[item.assetClass])}
              title={item.symbol}
              hint={t("issuedDemonstratorInstrument")}
            />
          ))}
        </DeskLedger>
      </PageSection>

      <PageSection title={t("conceptsStructuring")}>
        <DeskLedger>
          {concepts.map((item, index) => (
            <DeskRow
              key={item.id}
              href={`/instruments/${item.id}`}
              index={deskIndex(index)}
              title={
                item.instrumentType === "PROTOCOL_INVESTMENT" ? item.name : item.symbol
              }
              hint={`${t("protocolInvestmentStatus")} · ${t("protocolInvestmentFlags")}`}
            />
          ))}
        </DeskLedger>
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
        <EmptyState kicker={t("failedSettlements")} title={t("none")} />
      </PageSection>

      <PageSection title={tSec("rejectedOrders")}>
        {surveillance.rejected.length === 0 ? (
          <EmptyState kicker={tSec("rejectedOrders")} title={t("none")} />
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
          <EmptyState kicker={tSec("eligibilityRejects")} title={t("none")} />
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
        <EmptyState kicker={t("backingExceptions")} title={t("none")} />
      </PageSection>

      <PageSection title={t("complianceExceptions")}>
        {blocked.length === 0 ? (
          <EmptyState kicker={t("complianceExceptions")} title={t("none")} />
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
        <EmptyState kicker={t("blockedTransfers")} title={t("noRestrictions")} />
      </PageSection>

      <PageSection title={tSec("marketEvents")}>
        {marketEvents.length === 0 ? (
          <EmptyState kicker={tSec("marketEvents")} title={t("none")} />
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
              {marketEvents.map((event) => (
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
        <p className="text-sm text-straw">
          {formatInteger(auditCount, locale)} ·{" "}
          <Link href="/audit" className="text-harvest hover:underline">
            {t("auditLink")}
          </Link>
        </p>
      </PageSection>

      <PageSection title={t("verification")} description={t("differentModels")}>
        <DeskLedger>
          {protocols.map(({ protocol, currentVersion }, index) => (
            <DeskRow
              key={protocol.id}
              href={`/protocols/${protocol.id}`}
              index={deskIndex(index)}
              kicker={lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass])}
              title={protocol.name}
              hint={`${t("verification")}: ${
                currentVersion?.rules.verificationModel ?? t("noActiveProtocolVersion")
              }`}
              value={
                <MarketStatusChip
                  label={lookupMessage(t, protocolStatusKey(protocol.status))}
                  tone={protocol.status}
                />
              }
            />
          ))}
        </DeskLedger>
      </PageSection>

      <DeskNote className="mt-8">{tSec("matchedNotSettled")}</DeskNote>
    </div>
  );
}

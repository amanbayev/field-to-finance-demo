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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("supervisionTitle") };
}

export default async function SupervisionPage() {
  await requirePermission("regulator.read");
  const t = await getTranslations("marketCore");
  const locale = (await getLocale()) as AppLocale;
  const protocols = listAssetProtocols();
  const issued = listAssetInstruments().filter((item) => item.status === "ISSUED");
  const concepts = [
    ...listAssetInstruments().filter((item) => item.status !== "ISSUED"),
    ...listProtocolInvestments(),
  ];
  const holdings = listHoldings({ instrumentId: "WHEAT-2027" });
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
        photo="/media/grain-kernel-macro.png"
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
        <MetricCell label={t("clearingStatus")} value={t("primaryEvidence")} />
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

      <PageSection title={t("failedSettlements")}>
        <EmptyState>{t("none")}</EmptyState>
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

      <PageSection title={t("auditEvents")}>
        <p className="text-sm text-muted-foreground">
          {formatInteger(auditCount, locale)} ·{" "}
          <Link href="/audit" className="text-primary hover:underline">
            {t("auditLink")}
          </Link>
        </p>
      </PageSection>

      <PageSection title={t("verification")} description={t("differentModels")}>
        <DeskLedger>
          {protocols.map((protocol, index) => (
            <DeskRow
              key={protocol.id}
              href={`/protocols/${protocol.id}`}
              index={deskIndex(index)}
              kicker={lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass])}
              title={protocol.name}
              hint={`${t("verification")}: ${protocol.verificationModel}`}
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

      <DeskNote className="mt-8">
        {t("noSecondaryTrade")} · {t("idle")}
      </DeskNote>
    </div>
  );
}

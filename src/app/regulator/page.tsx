import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AuditTrail } from "@/components/regulator/audit-trail";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { FactStrip } from "@/components/shared/fact-strip";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
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
import { formatInteger } from "@/lib/format";
import { listParticipantCompliance } from "@/services/compliance-service";
import {
  getSystemOverview,
  listAuditEvents,
} from "@/services/regulator-service";
import { getPrimaryToken } from "@/services/token-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("regulator");
  return { title: t("title") };
}

export default async function RegulatorPage() {
  const t = await getTranslations("regulator");
  const tCompliance = await getTranslations("compliance");
  const tStatus = await getTranslations("status");
  const tTokens = await getTranslations("tokens");
  const locale = (await getLocale()) as AppLocale;
  const overview = getSystemOverview();
  const events = listAuditEvents();
  const { token } = getPrimaryToken();
  const blocked = listParticipantCompliance().filter(
    (row) => row.record.eligibility === "BLOCKED",
  );

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <PageSection title={t("overview")} className="mt-0">
        <MetricStrip className="sm:grid-cols-2 lg:grid-cols-4">
          <MetricCell
            label={t("contracts")}
            value={formatInteger(overview.contracts, locale)}
          />
          <MetricCell
            label={t("pools")}
            value={formatInteger(overview.pools, locale)}
          />
          <MetricCell
            label={t("tokenSeries")}
            value={formatInteger(overview.tokenSeries, locale)}
          />
          <MetricCell
            label={t("participants")}
            value={formatInteger(overview.participants, locale)}
          />
        </MetricStrip>
      </PageSection>

      <PageSection title={t("exceptions")}>
        <EmptyState>{t("noCoverageBreaches")}</EmptyState>
      </PageSection>

      <PageSection title={t("riskEvents")}>
        <EmptyState>{t("noRiskEvents")}</EmptyState>
      </PageSection>

      <PageSection title={t("blockedTitle")}>
        {blocked.length === 0 ? (
          <EmptyState>{t("noBlocked")}</EmptyState>
        ) : (
          <Table className="min-w-[36rem]">
            <TableHeader>
              <TableRow>
                <StickyHead>{tCompliance("columns.participant")}</StickyHead>
                <TableHead>{tCompliance("columns.type")}</TableHead>
                <TableHead>{tCompliance("columns.kyt")}</TableHead>
                <TableHead>{tCompliance("columns.sanctions")}</TableHead>
                <TableHead>{tCompliance("columns.eligibility")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocked.map(({ participant, record, liveKyt }) => (
                <TableRow
                  key={participant.id}
                  className="bg-destructive/5 hover:bg-destructive/10"
                >
                  <StickyCell className="bg-destructive/5 font-medium group-hover:bg-destructive/10">
                    {participant.name}
                  </StickyCell>
                  <TableCell>
                    {lookupMessage(tStatus, participant.type)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={liveKyt} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={record.sanctions} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={record.eligibility} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>

      <PageSection title={t("tokenSupply")}>
        <FactStrip
          className="lg:grid-cols-4"
          items={[
            { label: tTokens("fields.instrument"), value: token.symbol },
            {
              label: tTokens("fields.issued"),
              value: formatInteger(token.issued, locale),
            },
            {
              label: tTokens("fields.maximumIssuance"),
              value: formatInteger(token.maximumIssuance, locale),
            },
            {
              label: tTokens("fields.blockchainStatus"),
              value: <StatusBadge value={token.blockchainStatus} />,
            },
          ]}
        />
      </PageSection>

      <PageSection title={t("complianceExceptions")}>
        <DataList
          items={blocked.map((row) => ({
            label: row.participant.name,
            value: <StatusBadge value={row.record.eligibility} />,
          }))}
        />
      </PageSection>

      <PageSection title={t("auditTitle")} description={t("auditIntro")}>
        <AuditTrail events={events} />
      </PageSection>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
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
  explorerAddressUrl,
  explorerTxUrl,
  shortenKey,
} from "@/adapters/blockchain";
import { blockchainProvider } from "@/services/providers";
import { getContract } from "@/services/contract-service";
import {
  getSystemOverview,
  listLedgerEvents,
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
  const events = await listLedgerEvents();
  const { token } = getPrimaryToken();
  const blocked = listParticipantCompliance().filter(
    (row) => row.record.eligibility === "BLOCKED",
  );
  const demoContract = getContract("DAC-2027-0001");
  const onChain = await blockchainProvider.getDigitalAgriculturalContract(
    "DAC-2027-0001",
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

      <PageSection
        title={t("chainProofTitle")}
        description={t("chainProofIntro")}
      >
        {onChain.status === "found" && onChain.contract ? (
          <DataList
            items={[
              {
                label: t("chainProof.contract"),
                value: (
                  <Link
                    href="/contracts/DAC-2027-0001"
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    DAC-2027-0001
                  </Link>
                ),
              },
              {
                label: t("chainProof.applicationStatus"),
                value: (
                  <StatusBadge
                    value={
                      demoContract?.contract.verification.landRights ??
                      "VERIFIED"
                    }
                  />
                ),
              },
              {
                label: t("chainProof.blockchainProof"),
                value:
                  onChain.contract.status === "Verified" ? (
                    t("chainProof.verifiedOnDevnet")
                  ) : (
                    <StatusBadge value="ON_CHAIN" />
                  ),
              },
              {
                label: t("chainProof.programId"),
                value: (
                  <a
                    href={explorerAddressUrl(onChain.contract.programId)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    {shortenKey(onChain.contract.programId)}
                  </a>
                ),
              },
              {
                label: t("chainProof.pda"),
                value: (
                  <a
                    href={explorerAddressUrl(onChain.contract.pda)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    {shortenKey(onChain.contract.pda)}
                  </a>
                ),
              },
              {
                label: t("chainProof.lastEvent"),
                value: t("chainProof.eventVerified"),
              },
              {
                label: t("chainProof.explorer"),
                value: onChain.verifySignature ? (
                  <a
                    href={explorerTxUrl(onChain.verifySignature)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t("chainProof.viewTx")}
                  </a>
                ) : (
                  <a
                    href={explorerAddressUrl(onChain.contract.pda)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {t("chainProof.viewAccount")}
                  </a>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState>
            {onChain.status === "unavailable"
              ? t("chainProofUnavailable")
              : t("chainProofMissing")}
          </EmptyState>
        )}
      </PageSection>

      <PageSection title={t("auditTitle")} description={t("auditIntro")}>
        <AuditTrail events={events} />
      </PageSection>
    </div>
  );
}

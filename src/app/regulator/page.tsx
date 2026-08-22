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
import { formatInteger, formatPercent } from "@/lib/format";
import { listParticipantCompliance } from "@/services/compliance-service";
import {
  explorerAddressUrl,
  explorerTxUrl,
  ON_CHAIN_DEMO_POOL_ID,
  ON_CHAIN_DEMO_TOKEN_ID,
  shortenKey,
} from "@/adapters/blockchain";
import { blockchainProvider } from "@/services/providers";
import { getContract } from "@/services/contract-service";
import {
  getSystemOverview,
  listLedgerEvents,
} from "@/services/regulator-service";
import { getPrimaryToken, liveOutstanding } from "@/services/token-service";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { DoubleUseControl } from "@/components/pools/double-use-control";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("regulator");
  return { title: t("title") };
}

export default async function RegulatorPage() {
  const t = await getTranslations("regulator");
  const tCompliance = await getTranslations("compliance");
  const tStatus = await getTranslations("status");
  const tTokens = await getTranslations("tokens");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const overview = getSystemOverview();
  const events = await listLedgerEvents();
  const { token } = getPrimaryToken();
  const blocked = listParticipantCompliance().filter(
    (row) => row.record.eligibility === "BLOCKED",
  );
  const demoContract = getContract("DAC-2027-0001");
  const coverage = wheatPoolCoverageFromEngine();
  const [onChain, poolLookup, network, mintLookup] = await Promise.all([
    blockchainProvider.getDigitalAgriculturalContract("DAC-2027-0001"),
    blockchainProvider.getContractPool(ON_CHAIN_DEMO_POOL_ID),
    blockchainProvider.getNetworkStatus(),
    blockchainProvider.getTokenMint(ON_CHAIN_DEMO_TOKEN_ID),
  ]);
  const mintDeployed = mintLookup.status === "found";
  const issued = liveOutstanding(mintLookup, token.issued);

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
            label={t("verifiedContracts")}
            value={formatInteger(network.onChainDemoContracts, locale)}
          />
          <MetricCell
            label={t("activePools")}
            value={formatInteger(1, locale)}
          />
          <MetricCell
            label={t("grossVolume")}
            value={formatInteger(coverage.grossVolumeTonnes, locale)}
          />
          <MetricCell
            label={t("eligibleCoverage")}
            value={formatInteger(coverage.eligibleCoverageTonnes, locale)}
          />
        </MetricStrip>
        <MetricStrip className="mt-px sm:grid-cols-2 lg:grid-cols-4">
          <MetricCell
            label={t("coverageHaircut")}
            value={formatPercent(coverage.totalHaircutPercent, locale)}
          />
          <MetricCell
            label={t("doubleUseExceptions")}
            value={formatInteger(0, locale)}
          />
          <MetricCell
            label={t("coverageBreaches")}
            value={formatInteger(0, locale)}
          />
          <MetricCell
            label={t("catalogContracts")}
            value={formatInteger(overview.contracts, locale)}
          />
        </MetricStrip>
      </PageSection>

      <PageSection title={t("doubleUseTitle")}>
        <DoubleUseControl />
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
              value:
                issued > 0
                  ? tUnits("tonnes", {
                      value: formatInteger(issued, locale),
                    })
                  : t("tokenIssuanceNotStarted"),
            },
            {
              label: tTokens("fields.maximumIssuance"),
              value: formatInteger(token.maximumIssuance, locale),
            },
            {
              label: tTokens("fields.blockchainStatus"),
              value: (
                <StatusBadge
                  value={mintDeployed ? "DEPLOYED" : token.blockchainStatus}
                />
              ),
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
        title={t("poolProofTitle")}
        description={t("poolProofIntro")}
      >
        {poolLookup.status === "found" && poolLookup.pool ? (
          <DataList
            items={[
              {
                label: t("poolProof.pool"),
                value: (
                  <Link
                    href={`/pools/${ON_CHAIN_DEMO_POOL_ID}`}
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    {ON_CHAIN_DEMO_POOL_ID}
                  </Link>
                ),
              },
              {
                label: t("poolProof.pda"),
                value: (
                  <a
                    href={explorerAddressUrl(poolLookup.pool.pda)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    {shortenKey(poolLookup.pool.pda)}
                  </a>
                ),
              },
              {
                label: t("poolProof.snapshotHash"),
                value: (
                  <span className="break-all font-tabular text-xs">
                    {poolLookup.pool.coverageSnapshotHashHex}
                  </span>
                ),
              },
              {
                label: t("poolProof.updated"),
                value: new Date(poolLookup.pool.updatedAt * 1000).toISOString(),
              },
              {
                label: t("poolProof.explorer"),
                value: (
                  <a
                    href={explorerAddressUrl(poolLookup.pool.pda)}
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
            {poolLookup.status === "unavailable"
              ? t("chainProofUnavailable")
              : t("poolProofMissing")}
          </EmptyState>
        )}
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

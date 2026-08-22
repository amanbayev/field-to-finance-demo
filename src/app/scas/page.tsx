import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AttestationQueue } from "@/components/scas/attestation-queue";
import { IssuanceGate } from "@/components/scas/issuance-gate";
import { ScasSubnav } from "@/components/scas/scas-subnav";
import { DataList } from "@/components/shared/data-list";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
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
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { issuerScore } from "@/data/mock/pools";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatScore } from "@/lib/format";
import { getScasSnapshot } from "@/services/scas-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("scas");
  return { title: t("title") };
}

export default async function ScasPage() {
  await requirePermission("scas.read");
  const t = await getTranslations("scas");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = getScasSnapshot();
  const coverage = wheatPoolCoverageFromEngine();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <p className="mb-3 text-xs tracking-wide text-muted-foreground">
        {snapshot.operatorLabel}
      </p>
      <ScasSubnav />

      <MetricStrip className="sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell
          label={t("metrics.lockedContracts")}
          value={formatInteger(snapshot.lockedContracts.length, locale)}
        />
        <MetricCell
          label={t("metrics.pending")}
          value={formatInteger(snapshot.pendingCount, locale)}
        />
        <MetricCell
          label={t("metrics.attested")}
          value={formatInteger(snapshot.attestedCount, locale)}
        />
        <MetricCell
          label={t("metrics.issuerScore")}
          value={formatScore(issuerScore.value, issuerScore.maxValue)}
        />
      </MetricStrip>

      <PageSection title={t("boundaryTitle")} description={t("boundary")}>
        <DataList
          items={[
            { label: t("role.scas"), value: t("role.scasValue") },
            { label: t("role.registrar"), value: t("role.registrarValue") },
            { label: t("role.issuance"), value: t("role.issuanceValue") },
          ]}
        />
      </PageSection>

      <PageSection
        title={t("fieldBookTitle")}
        description={t("fieldBookIntro")}
      >
        <Table className="min-w-[52rem]">
          <TableHeader>
            <TableRow>
              <StickyHead>{t("columns.contract")}</StickyHead>
              <TableHead>{t("columns.producer")}</TableHead>
              <TableHead>{t("columns.contour")}</TableHead>
              <TableHead>{t("columns.satellite")}</TableHead>
              <TableHead>{t("columns.moisture")}</TableHead>
              <TableHead>{t("columns.score")}</TableHead>
              <TableHead>{t("columns.insurance")}</TableHead>
              <TableHead>{t("columns.lock")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshot.lockedContracts.map(({ contract, producer }) => (
              <TableRow key={contract.id}>
                <StickyCell>
                  <Link
                    href={`/contracts/${contract.id}`}
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    {contract.id}
                  </Link>
                </StickyCell>
                <TableCell>{producer.legalName}</TableCell>
                <TableCell className="font-tabular text-xs">
                  {contract.field.centroidLabel}
                </TableCell>
                <TableCell>
                  <StatusBadge value={contract.monitoring.satellite} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={contract.monitoring.soilMoisture} />
                </TableCell>
                <TableCell className="font-tabular">
                  {formatScore(producer.score.value, producer.score.maxValue)}
                </TableCell>
                <TableCell>
                  <StatusBadge value={contract.insurance.status} />
                </TableCell>
                <TableCell>
                  <StatusBadge value="LOCKED" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>

      <PageSection
        title={t("queueTitle")}
        description={t("queueIntro")}
      >
        <AttestationQueue initialItems={snapshot.attestations} />
      </PageSection>

      <PageSection
        title={t("payloadTitle")}
        description={t("payloadIntro")}
      >
        <DataList
          items={[
            {
              label: t("payload.pool"),
              value: (
                <Link
                  href="/pools/POOL-WHEAT-2027-01"
                  className="font-tabular text-xs text-primary hover:underline"
                >
                  POOL-WHEAT-2027-01
                </Link>
              ),
            },
            {
              label: t("payload.gross"),
              value: tUnits("tonnes", {
                value: formatInteger(coverage.grossVolumeTonnes, locale),
              }),
            },
            {
              label: t("payload.eligible"),
              value: tUnits("tonnes", {
                value: formatInteger(coverage.eligibleCoverageTonnes, locale),
              }),
            },
            {
              label: t("payload.hash"),
              value: (
                <span className="break-all font-tabular text-[11px]">
                  {coverage.snapshotHashHex}
                </span>
              ),
            },
            {
              label: t("payload.doubleUse"),
              value: <StatusBadge value="PROTECTED_ON_CHAIN" />,
            },
            {
              label: t("payload.issuance"),
              value: <StatusBadge value="NOT_STARTED" />,
            },
          ]}
        />
      </PageSection>

      <PageSection
        title={t("issuanceTitle")}
        description={t("issuanceIntro")}
      >
        <IssuanceGate />
      </PageSection>
    </div>
  );
}

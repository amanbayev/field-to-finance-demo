import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CoveragePanel } from "@/components/pools/coverage-panel";
import { DoubleUseControl } from "@/components/pools/double-use-control";
import { PoolProofPanel } from "@/components/pools/pool-proof-panel";
import { PageSection } from "@/components/shared/page-section";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import {
  DeskLedger,
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
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatPercent } from "@/lib/format";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { getPoolSnapshot } from "@/services/pool-service";
import { getPlacementSnapshot } from "@/services/placement-service";
import {
  coverageBreachCount,
  remainingCoverageCapacity,
} from "@/services/workspace-view";
import { ON_CHAIN_DEMO_POOL_ID } from "@/adapters/blockchain";

export async function CoverageConsole({
  roleCopyKey,
}: {
  roleCopyKey?:
    | "coverageRoleIssuer"
    | "coverageRoleScas"
    | "coverageRoleRegulator";
}) {
  const t = await getTranslations("workspace");
  const tPools = await getTranslations("pools");
  const tRisk = await getTranslations("risk");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const coverage = wheatPoolCoverageFromEngine();
  const snapshot = await getPlacementSnapshot();
  const poolSnapshot = await getPoolSnapshot(ON_CHAIN_DEMO_POOL_ID);
  const remaining = remainingCoverageCapacity(
    coverage,
    snapshot.supply.mintedSupply,
  );
  const breaches = coverageBreachCount(coverage.status);

  return (
    <>
      {roleCopyKey ? (
        <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
          {t(roleCopyKey)}
        </p>
      ) : null}
      <MetricStrip className="sm:grid-cols-2 lg:grid-cols-3">
        <MetricCell
          emphasis="primary"
          label={t("grossVolume")}
          value={tUnits("tonnes", {
            value: formatInteger(coverage.grossVolumeTonnes, locale),
          })}
        />
        <MetricCell
          label={t("riskHaircut")}
          value={formatPercent(coverage.totalHaircutPercent, locale)}
        />
        <MetricCell
          emphasis="primary"
          label={t("eligibleCoverage")}
          value={tUnits("tonnes", {
            value: formatInteger(coverage.eligibleCoverageTonnes, locale),
          })}
        />
        <MetricCell
          label={t("minted")}
          value={formatInteger(snapshot.supply.mintedSupply, locale)}
        />
        <MetricCell
          label={t("remainingCapacity")}
          value={tUnits("tonnes", {
            value: formatInteger(remaining, locale),
          })}
        />
        <MetricCell
          label={t("coverageBreaches")}
          value={formatInteger(breaches, locale)}
        />
      </MetricStrip>

      <PageSection title={ON_CHAIN_DEMO_POOL_ID}>
        <p className="mb-3 text-sm">
          <Link
            href={`/pools/${ON_CHAIN_DEMO_POOL_ID}`}
            className="font-tabular text-xs text-primary hover:underline"
          >
            {ON_CHAIN_DEMO_POOL_ID}
          </Link>
        </p>
        <CoveragePanel coverage={coverage} />
      </PageSection>

      <PageSection title={t("contributingDacs")}>
        <DeskSplit
          compact={
            <DeskLedger>
              {(poolSnapshot?.detail.members ?? []).map((member, index) => (
                <DeskRow
                  key={member.contract.id}
                  href={`/contracts/${member.contract.id}`}
                  index={deskIndex(index)}
                  kicker={member.contract.id}
                  title={member.producer.legalName}
                  value={tUnits("tonnes", {
                    value: formatInteger(member.volumeTonnes, locale),
                  })}
                  hint={member.eligibility}
                />
              ))}
            </DeskLedger>
          }
          wide={
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow>
                  <StickyHead>{tPools("columns.contract")}</StickyHead>
                  <TableHead>{tPools("columns.producer")}</TableHead>
                  <TableHead className="text-right">{tPools("columns.volume")}</TableHead>
                  <TableHead>{tPools("columns.eligibility")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(poolSnapshot?.detail.members ?? []).map((member) => (
                  <TableRow key={member.contract.id}>
                    <StickyCell>
                      <Link
                        href={`/contracts/${member.contract.id}`}
                        className="font-tabular text-xs text-primary hover:underline"
                      >
                        {member.contract.id}
                      </Link>
                    </StickyCell>
                    <TableCell>{member.producer.legalName}</TableCell>
                    <TableCell className="text-right font-tabular">
                      {tUnits("tonnes", {
                        value: formatInteger(member.volumeTonnes, locale),
                      })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={member.eligibility} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
      </PageSection>

      <PageSection title={t("snapshotStatus")}>
        <p className="mb-2 text-sm">
          <StatusBadge value={coverage.status} />
        </p>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {t("snapshotHash")}: {coverage.snapshotHashHex ?? t("notRecorded")}
        </p>
      </PageSection>

      <PageSection title={t("riskRemediation")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("riskRemediation")}</TableHead>
              <TableHead>{t("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coverage.adjustments.map((adjustment) => (
              <TableRow key={adjustment.key}>
                <TableCell>
                  {lookupMessage(tRisk, `adjustments.${adjustment.key}`) ||
                    adjustment.label}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {adjustment.status} · {adjustment.source}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>

      <PageSection title={t("doubleUse")}>
        <DoubleUseControl />
      </PageSection>

      {poolSnapshot ? (
        <PoolProofPanel
          lookup={poolSnapshot.onChainPool}
          coverage={poolSnapshot.coverageProof}
          locale={locale}
        />
      ) : null}
    </>
  );
}

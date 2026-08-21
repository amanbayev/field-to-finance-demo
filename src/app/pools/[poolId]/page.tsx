import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CoveragePanel } from "@/components/pools/coverage-panel";
import { DoubleUseControl } from "@/components/pools/double-use-control";
import { PoolProofPanel } from "@/components/pools/pool-proof-panel";
import { FactStrip } from "@/components/shared/fact-strip";
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
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { getPoolSnapshot, listPoolIds } from "@/services/pool-service";

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ poolId: string }>;
}): Promise<Metadata> {
  const { poolId } = await params;
  const tCatalog = await getTranslations("catalog");
  return {
    title: lookupMessage(tCatalog, `pools.${poolId}`) || poolId,
  };
}

export function generateStaticParams() {
  return listPoolIds().map((poolId) => ({ poolId }));
}

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const snapshot = await getPoolSnapshot(poolId);

  if (!snapshot) {
    notFound();
  }

  const { detail, onChainPool, coverageProof, poolContracts } = snapshot;
  const { pool, members, producerCount } = detail;
  const t = await getTranslations("pools");
  const tNav = await getTranslations("nav");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const verifiedCount = members.length;

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link href="/pools" className="text-muted-foreground hover:text-foreground">
          {tNav("pools")}
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span className="font-tabular text-xs">{pool.id}</span>
      </p>
      <PageHeader
        eyebrow={t("detailEyebrow")}
        title={lookupMessage(tCatalog, `pools.${pool.id}`)}
        description={t("detailSummary", {
          id: pool.id,
          producers: formatInteger(producerCount, locale),
          contracts: formatInteger(pool.contractIds.length, locale),
        })}
      />

      <FactStrip
        className="mb-6 lg:grid-cols-5"
        items={[
          { label: t("columns.pool"), value: pool.id },
          {
            label: t("cropSeason"),
            value: `${pool.crop} · ${pool.season}`,
          },
          {
            label: t("verifiedContracts"),
            value: formatInteger(verifiedCount, locale),
          },
          {
            label: t("grossVolume"),
            value: tUnits("tonnes", {
              value: formatInteger(pool.coverage.grossVolumeTonnes, locale),
            }),
          },
          {
            label: t("columns.status"),
            value: (
              <StatusBadge
                value={
                  onChainPool.pool
                    ? onChainPool.pool.status.toUpperCase()
                    : pool.coverage.status
                }
              />
            ),
          },
        ]}
      />

      <PageSection title={t("layers.pool")} description={t("layers.poolNote")}>
        <div className="mb-4">
          <DoubleUseControl />
        </div>
        <Table className="min-w-[52rem]">
          <TableHeader>
            <TableRow>
              <StickyHead>{t("columns.contract")}</StickyHead>
              <TableHead>{t("columns.producer")}</TableHead>
              <TableHead className="text-right">{t("columns.expected")}</TableHead>
              <TableHead className="text-right">{t("columns.allocated")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.proof")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.contract.id}>
                <StickyCell>
                  <Link
                    href={`/contracts/${member.contract.id}`}
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    {member.contract.id}
                  </Link>
                </StickyCell>
                <TableCell className="font-medium">
                  {member.producer.legalName}
                </TableCell>
                <TableCell className="text-right font-tabular">
                  {tUnits("tonnes", {
                    value: formatInteger(member.volumeTonnes, locale),
                  })}
                </TableCell>
                <TableCell className="text-right font-tabular">
                  {tUnits("tonnes", {
                    value: formatInteger(
                      member.allocatedVolumeTonnes ?? member.volumeTonnes,
                      locale,
                    ),
                  })}
                </TableCell>
                <TableCell>
                  <StatusBadge value={member.contract.status} />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    value={
                      poolContracts.status === "unavailable"
                        ? "PROOF_UNAVAILABLE"
                        : member.allocatedVolumeTonnes != null
                          ? "ON_CHAIN"
                          : "OFF_CHAIN"
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageSection>

      <PageSection
        title={t("layers.coverage")}
        description={t("layers.coverageNote")}
      >
        <CoveragePanel coverage={pool.coverage} />
      </PageSection>

      <PoolProofPanel
        lookup={onChainPool}
        coverage={coverageProof}
        locale={locale}
      />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
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
import { getPool, listPoolIds, type PoolDetail } from "@/services/pool-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pools");
  return { title: t("title") };
}

export default async function PoolsPage() {
  const t = await getTranslations("pools");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const pools = listPoolIds()
    .map((id) => getPool(id))
    .filter((pool): pool is PoolDetail => pool !== undefined);

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Table className="min-w-[44rem]">
        <TableHeader>
          <TableRow>
            <StickyHead>{t("columns.pool")}</StickyHead>
            <TableHead>{t("columns.name")}</TableHead>
            <TableHead className="text-right">{t("contracts")}</TableHead>
            <TableHead className="text-right">{t("producers")}</TableHead>
            <TableHead className="text-right">{t("grossVolume")}</TableHead>
            <TableHead className="text-right">{t("eligibleCoverage")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pools.map(({ pool, producerCount }) => (
            <TableRow key={pool.id}>
              <StickyCell>
                <Link
                  href={`/pools/${pool.id}`}
                  className="font-tabular text-xs text-primary hover:underline"
                >
                  {pool.id}
                </Link>
              </StickyCell>
              <TableCell className="font-medium">
                {lookupMessage(tCatalog, `pools.${pool.id}`)}
              </TableCell>
              <TableCell className="text-right font-tabular">
                {formatInteger(pool.contractIds.length, locale)}
              </TableCell>
              <TableCell className="text-right font-tabular">
                {formatInteger(producerCount, locale)}
              </TableCell>
              <TableCell className="text-right font-tabular">
                {tUnits("tonnes", {
                  value: formatInteger(pool.coverage.grossVolumeTonnes, locale),
                })}
              </TableCell>
              <TableCell className="text-right font-tabular">
                {tUnits("tonnes", {
                  value: formatInteger(
                    pool.coverage.eligibleCoverageTonnes,
                    locale,
                  ),
                })}
              </TableCell>
              <TableCell>
                <StatusBadge value={pool.coverage.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

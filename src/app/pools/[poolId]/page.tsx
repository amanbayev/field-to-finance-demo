import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CoveragePanel } from "@/components/pools/coverage-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatInteger, formatScore } from "@/lib/format";
import { getPool, listPoolIds } from "@/services/pool-service";

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ poolId: string }>;
}): Promise<Metadata> {
  const { poolId } = await params;
  const tCatalog = await getTranslations("catalog");
  const detail = getPool(poolId);
  return {
    title: detail ? lookupMessage(tCatalog, `pools.${detail.pool.id}`) : poolId,
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
  const detail = getPool(poolId);

  if (!detail) {
    notFound();
  }

  const { pool, members, producerCount } = detail;
  const t = await getTranslations("pools");
  const tNav = await getTranslations("nav");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link href="/pools" className="text-muted-foreground hover:text-foreground">
          {tNav("pools")}
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span className="font-mono">{pool.id}</span>
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

      <CoveragePanel coverage={pool.coverage} />

      <Card className="mt-6 shadow-none">
        <CardHeader className="border-b">
          <CardTitle>{t("composition")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.producer")}</TableHead>
                <TableHead>{t("columns.contract")}</TableHead>
                <TableHead>{t("columns.volume")}</TableHead>
                <TableHead>{t("columns.producerScore")}</TableHead>
                <TableHead>{t("columns.monitoring")}</TableHead>
                <TableHead>{t("columns.insurance")}</TableHead>
                <TableHead>{t("columns.eligibility")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.contract.id}>
                  <TableCell className="font-medium">
                    {member.producer.legalName}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/contracts/${member.contract.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {member.contract.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {tUnits("tonnes", {
                      value: formatInteger(member.volumeTonnes, locale),
                    })}
                  </TableCell>
                  <TableCell>
                    {formatScore(
                      member.producer.score.value,
                      member.producer.score.maxValue,
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={member.contract.monitoring.satellite} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={member.contract.insurance.status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={member.eligibility} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

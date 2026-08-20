import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="grid gap-4">
        {pools.map(({ pool, producerCount }) => (
          <Link key={pool.id} href={`/pools/${pool.id}`}>
            <Card className="shadow-none transition-colors hover:border-primary/40">
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {pool.id}
                    </p>
                    <CardTitle className="mt-1 tracking-wide">
                      {lookupMessage(tCatalog, `pools.${pool.id}`)}
                    </CardTitle>
                  </div>
                  <StatusBadge value={pool.coverage.status} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat
                  label={t("contracts")}
                  value={formatInteger(pool.contractIds.length, locale)}
                />
                <Stat
                  label={t("producers")}
                  value={formatInteger(producerCount, locale)}
                />
                <Stat
                  label={t("grossVolume")}
                  value={tUnits("tonnes", {
                    value: formatInteger(pool.coverage.grossVolumeTonnes, locale),
                  })}
                />
                <Stat
                  label={t("eligibleCoverage")}
                  value={tUnits("tonnes", {
                    value: formatInteger(
                      pool.coverage.eligibleCoverageTonnes,
                      locale,
                    ),
                  })}
                />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-heading text-xl">{value}</p>
    </div>
  );
}

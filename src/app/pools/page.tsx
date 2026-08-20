import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTonnes } from "@/lib/format";
import { getPool, listPoolIds, type PoolDetail } from "@/services/pool-service";

export const metadata: Metadata = {
  title: "Pools",
};

export default function PoolsPage() {
  const pools = listPoolIds()
    .map((id) => getPool(id))
    .filter((pool): pool is PoolDetail => pool !== undefined);

  return (
    <div>
      <PageHeader
        eyebrow="Contract pooling"
        title="Pools"
        description="A contract pool aggregates verified production into a coverage base for token issuance."
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
                    <CardTitle className="mt-1 uppercase tracking-wide">
                      {pool.name}
                    </CardTitle>
                  </div>
                  <StatusBadge value={pool.coverage.status} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Contracts" value={String(pool.contractIds.length)} />
                <Stat label="Producers" value={String(producerCount)} />
                <Stat
                  label="Gross contract volume"
                  value={formatTonnes(pool.coverage.grossVolumeTonnes)}
                />
                <Stat
                  label="Eligible contract coverage"
                  value={formatTonnes(pool.coverage.eligibleCoverageTonnes)}
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

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { formatScore, formatTonnes } from "@/lib/format";
import { getPool, listPoolIds } from "@/services/pool-service";

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ poolId: string }>;
}): Promise<Metadata> {
  const { poolId } = await params;
  const detail = getPool(poolId);
  return { title: detail?.pool.name ?? "Pool" };
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

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link href="/pools" className="text-muted-foreground hover:text-foreground">
          Pools
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span className="font-mono">{pool.id}</span>
      </p>
      <PageHeader
        eyebrow="Contract pool"
        title={pool.name}
        description={`${pool.id} · ${producerCount} producers · ${pool.contractIds.length} contracts`}
      />

      <CoveragePanel coverage={pool.coverage} />

      <Card className="mt-6 shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Pool composition</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producer</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Producer score</TableHead>
                <TableHead>Monitoring</TableHead>
                <TableHead>Insurance</TableHead>
                <TableHead>Eligibility</TableHead>
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
                  <TableCell>{formatTonnes(member.volumeTonnes)}</TableCell>
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

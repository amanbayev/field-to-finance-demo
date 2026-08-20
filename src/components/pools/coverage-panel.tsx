import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatNumber, formatPercent, formatSignedPercent, formatTonnes } from "@/lib/format";
import type { ContractCoverage } from "@/domain";

export function CoveragePanel({ coverage }: { coverage: ContractCoverage }) {
  const utilization =
    coverage.eligibleCoverageTonnes === 0
      ? 0
      : (coverage.outstandingTokens / coverage.eligibleCoverageTonnes) * 100;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Risk adjustments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              Gross contractual volume
            </p>
            <p className="mt-1 font-heading text-3xl">
              {formatTonnes(coverage.grossVolumeTonnes)}
            </p>
          </div>
          <ul className="divide-y divide-border">
            {coverage.adjustments.map((adjustment) => (
              <li
                key={adjustment.key}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>{adjustment.label}</span>
                <span className="font-mono">
                  {formatSignedPercent(adjustment.percentagePoints)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-medium tracking-wide uppercase">
              Total haircut
            </span>
            <span className="font-mono text-lg">
              {formatPercent(coverage.totalHaircutPercent)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <CardTitle>Eligible contract coverage</CardTitle>
            <StatusBadge value={coverage.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              Eligible coverage
            </p>
            <p className="mt-1 font-heading text-3xl">
              {formatTonnes(coverage.eligibleCoverageTonnes)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Maximum token issuance {formatNumber(coverage.maximumTokenIssuance)} tokens
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span>Outstanding tokens</span>
              <span className="font-mono">
                {formatNumber(coverage.outstandingTokens)} /{" "}
                {formatNumber(coverage.eligibleCoverageTonnes)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(utilization, 100)}%` }}
              />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Coverage ratio
              </dt>
              <dd className="mt-1 font-heading text-2xl">
                {formatPercent(coverage.coverageRatioPercent, 2)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Status
              </dt>
              <dd className="mt-2">
                <StatusBadge value={coverage.status} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

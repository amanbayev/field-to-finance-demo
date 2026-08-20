import type { Metadata } from "next";
import { LifecycleStrip } from "@/components/dashboard/lifecycle-strip";
import { MetricCard } from "@/components/dashboard/metric-card";
import { productName, productSubtitle } from "@/lib/navigation";
import {
  formatNumber,
  formatPercent,
  formatTonnes,
  formatUsdCompact,
} from "@/lib/format";
import { getDashboardSnapshot } from "@/services/dashboard-service";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  const { metrics, network } = getDashboardSnapshot();

  return (
    <div>
      <section className="mb-10 grid gap-6 border-b border-border pb-8 lg:grid-cols-[1.4fr_0.6fr]">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
            Public product skeleton
          </p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight sm:text-5xl">
            {productName}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            {productSubtitle}. This prototype shows how rights to future
            agricultural production can be digitally verified, pooled,
            risk-adjusted, tokenized and financed.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 self-end rounded-lg border border-border bg-card p-4">
          <div>
            <dt className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              Network
            </dt>
            <dd className="mt-1 text-sm font-medium">{network.network}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              System status
            </dt>
            <dd className="mt-1 text-sm font-medium text-primary">
              {network.connected ? "Connected" : "Disconnected"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mb-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Digital Contracts"
          value={formatNumber(metrics.digitalContracts)}
        />
        <MetricCard
          label="Contract Volume"
          value={formatTonnes(metrics.contractVolumeTonnes)}
        />
        <MetricCard
          label="Eligible Coverage"
          value={formatTonnes(metrics.eligibleCoverageTonnes)}
        />
        <MetricCard
          label="Tokenized Volume"
          value={formatTonnes(metrics.tokenizedVolumeTonnes)}
        />
        <MetricCard
          label="Active Financing"
          value={formatUsdCompact(metrics.activeFinancingUsd)}
        />
        <MetricCard
          label="Average Coverage Ratio"
          value={formatPercent(metrics.averageCoverageRatioPercent)}
        />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-heading text-2xl">Lifecycle</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Each stage opens the corresponding module. Blockchain settlement is
            not active in Phase 0.
          </p>
        </div>
        <LifecycleStrip />
      </section>
    </div>
  );
}

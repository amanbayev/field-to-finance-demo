import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { EntityCard } from "@/components/institutional/entity-card";
import { StatusChip } from "@/components/institutional/status-chip";
import type { CoverageFacts } from "@/lib/institutional/load-overview";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatPercent } from "@/lib/format";

export function EconomicBasisPanel({
  title,
  chain,
  coverage,
  locale,
  scasVerified,
  scasLabel,
  scasPendingHint,
  callout,
  labels,
}: {
  title: string;
  chain: readonly string[];
  coverage: CoverageFacts | null;
  locale: AppLocale;
  scasVerified: boolean | null;
  scasLabel: string;
  scasPendingHint?: string;
  callout: string;
  labels: {
    gross: string;
    eligible: string;
    ratio: string;
    verification: string;
    insurance: string;
    verified: string;
    unavailable: string;
  };
}) {
  return (
    <EntityCard title={title}>
      <ol className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[11px]">
        {chain.map((step, index) => (
          <li key={`${step}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden className="text-[#7B857F]">
                →
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-md border border-border bg-[#F7F8F5] px-2 py-1 font-medium text-foreground",
                index === chain.length - 1 && "border-[#0B5D3B]/25 bg-[#EAF4EE] font-mono",
              )}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>

      {coverage ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] tracking-[0.06em] text-[#7B857F] uppercase">
              {labels.gross}
            </dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">
              {formatInteger(coverage.grossVolumeTonnes, locale)} t
            </dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.06em] text-[#7B857F] uppercase">
              {labels.eligible}
            </dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">
              {formatInteger(coverage.eligibleCoverageTonnes, locale)} t
            </dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.06em] text-[#7B857F] uppercase">
              {labels.ratio}
            </dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">
              {formatPercent(coverage.coverageRatioPercent, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.06em] text-[#7B857F] uppercase">
              {labels.verification}
            </dt>
            <dd className="mt-0.5">
              {scasVerified ? (
                <StatusChip family="verification" code="VERIFIED" label={labels.verified} />
              ) : (
                <span className="text-sm text-muted-foreground">{scasLabel}</span>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{labels.unavailable}</p>
      )}

      {coverage ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {labels.insurance}: {coverage.insuranceLabel} · {coverage.insuranceStatus}
        </p>
      ) : null}
      {scasPendingHint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{scasPendingHint}</p>
      ) : null}

      <div className="mt-4 flex gap-2.5 rounded-md border border-[#0B5D3B]/15 bg-[#EAF4EE] px-3 py-2.5">
        <Leaf className="mt-0.5 size-4 shrink-0 text-[#0B5D3B]" aria-hidden />
        <p className="text-[12px] leading-relaxed text-[#084A30]">{callout}</p>
      </div>
    </EntityCard>
  );
}

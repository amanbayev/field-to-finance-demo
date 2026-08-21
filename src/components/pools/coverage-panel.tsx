import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import {
  formatInteger,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { ContractCoverage } from "@/domain";
import { cn } from "@/lib/utils";

const flowSteps = [
  "gross",
  "adjustments",
  "haircut",
  "eligible",
  "issuance",
] as const;

export function CoveragePanel({ coverage }: { coverage: ContractCoverage }) {
  const t = useTranslations("risk");
  const tUnits = useTranslations("units");
  const locale = useLocale() as AppLocale;

  return (
    <div className="grid gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)]">
      <ol className="hidden text-sm lg:block">
        {flowSteps.map((step, index) => (
          <li key={step} className="flex flex-col">
            {index > 0 ? (
              <span className="py-1 pl-6 text-muted-foreground" aria-hidden>
                ↓
              </span>
            ) : null}
            <div className="flex items-baseline gap-2">
              <span className="font-tabular text-[10px] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-muted-foreground">
                {lookupMessage(t, `flow.${step}`)}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[28rem] text-sm">
          <tbody>
            <ScheduleRow
              label={t("grossVolume")}
              value={tUnits("tonnes", {
                value: formatInteger(coverage.grossVolumeTonnes, locale),
              })}
              strong
            />
            {coverage.adjustments.map((adjustment) => (
              <ScheduleRow
                key={adjustment.key}
                label={lookupMessage(t, `adjustments.${adjustment.key}`)}
                value={formatSignedPercent(adjustment.percentagePoints, locale)}
                inset
                muted
              />
            ))}
            <ScheduleRow
              label={t("totalHaircut")}
              value={formatPercent(coverage.totalHaircutPercent, locale)}
              rule
              strong
            />
            <ScheduleRow
              label={t("eligibleCoverage")}
              value={tUnits("tonnes", {
                value: formatInteger(coverage.eligibleCoverageTonnes, locale),
              })}
              strong
            />
            <ScheduleRow
              label={t("tokenIssuance")}
              value={t("tokenIssuanceNotStarted")}
              strong
            />
            <ScheduleRow
              label={t("illustrativeCapacity")}
              value={tUnits("tonnes", {
                value: formatInteger(coverage.maximumTokenIssuance, locale),
              })}
              muted
            />
            <tr className="border-t border-border">
              <th className="px-4 py-3 text-left text-sm font-medium">
                {t("status")}
              </th>
              <td className="px-4 py-3 text-right">
                <StatusBadge value={coverage.status} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {t("simulatedNote")}
        </p>
      </div>
    </div>
  );
}

function ScheduleRow({
  label,
  value,
  inset,
  muted,
  strong,
  rule,
}: {
  label: string;
  value: string;
  inset?: boolean;
  muted?: boolean;
  strong?: boolean;
  rule?: boolean;
}) {
  return (
    <tr className={cn(rule && "border-t border-border")}>
      <th
        className={cn(
          "px-4 py-2 text-left font-normal",
          inset && "pl-8",
          muted ? "text-muted-foreground" : "text-foreground",
          strong && "font-medium",
        )}
      >
        {label}
      </th>
      <td
        className={cn(
          "px-4 py-2 text-right font-tabular whitespace-nowrap",
          strong ? "font-medium text-foreground" : "text-foreground",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </td>
    </tr>
  );
}

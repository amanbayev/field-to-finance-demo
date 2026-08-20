import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import {
  formatInteger,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { ContractCoverage } from "@/domain";

export function CoveragePanel({ coverage }: { coverage: ContractCoverage }) {
  const t = useTranslations("risk");
  const tUnits = useTranslations("units");
  const locale = useLocale() as AppLocale;
  const utilization =
    coverage.eligibleCoverageTonnes === 0
      ? 0
      : (coverage.outstandingTokens / coverage.eligibleCoverageTonnes) * 100;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>{t("adjustmentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              {t("grossVolume")}
            </p>
            <p className="mt-1 font-heading text-3xl">
              {tUnits("tonnes", {
                value: formatInteger(coverage.grossVolumeTonnes, locale),
              })}
            </p>
          </div>
          <ul className="divide-y divide-border">
            {coverage.adjustments.map((adjustment) => (
              <li
                key={adjustment.key}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span>{lookupMessage(t, `adjustments.${adjustment.key}`)}</span>
                <span className="font-mono">
                  {formatSignedPercent(adjustment.percentagePoints, locale)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-medium tracking-wide uppercase">
              {t("totalHaircut")}
            </span>
            <span className="font-mono text-lg">
              {formatPercent(coverage.totalHaircutPercent, locale)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <CardTitle>{t("eligibleTitle")}</CardTitle>
            <StatusBadge value={coverage.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              {t("eligibleCoverage")}
            </p>
            <p className="mt-1 font-heading text-3xl">
              {tUnits("tonnes", {
                value: formatInteger(coverage.eligibleCoverageTonnes, locale),
              })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("maxIssuance", {
                value: formatInteger(coverage.maximumTokenIssuance, locale),
              })}
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span>{t("outstanding")}</span>
              <span className="font-mono">
                {formatInteger(coverage.outstandingTokens, locale)} /{" "}
                {formatInteger(coverage.eligibleCoverageTonnes, locale)}
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
                {t("coverageRatio")}
              </dt>
              <dd className="mt-1 font-heading text-2xl">
                {formatPercent(coverage.coverageRatioPercent, locale, 2)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {t("status")}
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

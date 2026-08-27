import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";
import type { FinancingPosition } from "@/domain";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatMoney, formatPercent, toPrimaryAndReference } from "@/lib/format";
import { cn } from "@/lib/utils";

const loanSteps = ["0", "1", "2", "3", "4"] as const;
const repoSteps = ["0", "1", "2", "3"] as const;

export function FinancingFlow({ module }: { module: FinancingPosition }) {
  const t = useTranslations("finance");
  const tMoney = useTranslations("money");
  const locale = useLocale() as AppLocale;
  const stepKeys = module.module === "REPO" ? repoSteps : loanSteps;
  const primary = module.module === "SECURED_LOAN";
  const market = toPrimaryAndReference(module.marketValue).primary;
  const eligible = toPrimaryAndReference(module.principal);

  return (
    <section
      className={cn(
        "border-y border-harvest/20",
        !primary && "border-dashed",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-harvest/20 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium tracking-wide">
            {lookupMessage(t, `modules.${module.module}.title`)}
          </h2>
          {module.module === "REPO" ? (
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {t("modules.REPO.legalNote")}
            </p>
          ) : null}
        </div>
        <StatusBadge value={module.status} />
      </div>

      {primary ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <tbody>
              <CalcRow
                label={t("collateralMarketValue")}
                value={formatMoney(market, locale)}
                strong
              />
              <CalcRow
                label={t("haircut")}
                value={formatPercent(module.haircutPercent, locale)}
              />
              <CalcRow
                label={t("eligibleFinancing")}
                value={formatMoney(eligible.primary, locale)}
                strong
                rule
              />
              <CalcRow
                label={t("reference")}
                value={tMoney("approx", {
                  value: formatMoney(eligible.reference, locale),
                })}
                muted
              />
            </tbody>
          </table>
          <p className="border-t border-harvest/20 px-4 py-2 text-xs text-straw">
            {tMoney("demoFxNote")}
          </p>
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="text-sm text-muted-foreground">{t("repoSecondary")}</p>
        </div>
      )}

      <ol className="flex flex-wrap gap-x-1 gap-y-2 border-t border-harvest/20 px-4 py-2.5 text-xs text-straw">
        {stepKeys.map((step, index) => (
          <li key={step} className="flex items-center gap-1">
            {index > 0 ? <span aria-hidden>→</span> : null}
            <span>
              {lookupMessage(t, `modules.${module.module}.steps.${step}`)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CalcRow({
  label,
  value,
  strong,
  muted,
  rule,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  rule?: boolean;
}) {
  return (
    <tr className={cn(rule && "border-t border-harvest/20")}>
      <th
        className={cn(
          "px-4 py-2.5 text-left font-normal",
          strong && "font-medium",
          muted && "text-muted-foreground",
        )}
      >
        {label}
      </th>
      <td
        className={cn(
          "px-4 py-2.5 text-right font-tabular whitespace-nowrap",
          strong && "text-base font-medium",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </td>
    </tr>
  );
}

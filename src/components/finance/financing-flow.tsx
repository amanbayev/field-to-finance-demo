import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";
import { DualMoney } from "@/components/shared/dual-money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancingPosition } from "@/domain";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatPercent } from "@/lib/format";

const loanSteps = ["0", "1", "2", "3", "4"] as const;
const repoSteps = ["0", "1", "2", "3"] as const;

export function FinancingFlow({ module }: { module: FinancingPosition }) {
  const t = useTranslations("finance");
  const tMoney = useTranslations("money");
  const locale = useLocale() as AppLocale;
  const stepKeys = module.module === "REPO" ? repoSteps : loanSteps;

  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>
              {lookupMessage(t, `modules.${module.module}.title`)}
            </CardTitle>
            {module.module === "REPO" ? (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {t("modules.REPO.legalNote")}
              </p>
            ) : null}
          </div>
          <StatusBadge value={module.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {stepKeys.map((step, index) => (
            <li
              key={step}
              className="rounded-md border border-border bg-muted/40 p-3"
            >
              <span className="font-mono text-[11px] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-sm font-medium leading-snug">
                {lookupMessage(t, `modules.${module.module}.steps.${step}`)}
              </p>
            </li>
          ))}
        </ol>

        <div>
          <p className="mb-3 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            {t("exampleTitle")}
          </p>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {t("marketValue")}
              </dt>
              <dd className="mt-1 font-heading text-xl">
                <DualMoney value={module.marketValue} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {t("haircut")}
              </dt>
              <dd className="mt-1 font-heading text-xl">
                {formatPercent(module.haircutPercent, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {t("principal")}
              </dt>
              <dd className="mt-1 font-heading text-xl">
                <DualMoney value={module.principal} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                {t("financingAmount")}
              </dt>
              <dd className="mt-1 font-heading text-xl">
                <DualMoney value={module.principal} />
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">{tMoney("demoFxNote")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

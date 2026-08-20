import type { Money } from "@/domain/money";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import { formatMoney, toPrimaryAndReference } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DualMoney({
  value,
  compact = false,
  className,
}: {
  value: Money;
  compact?: boolean;
  className?: string;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("money");
  const { primary, reference } = toPrimaryAndReference(value);

  return (
    <span className={cn("inline-flex flex-col items-start gap-0.5", className)}>
      <span>{formatMoney(primary, locale, { compact })}</span>
      <span
        className="text-xs font-normal text-muted-foreground"
        title={t("demoFxNote")}
      >
        {t("approx", { value: formatMoney(reference, locale, { compact }) })}
      </span>
    </span>
  );
}

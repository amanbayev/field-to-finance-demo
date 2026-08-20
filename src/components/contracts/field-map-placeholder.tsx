import { useLocale, useTranslations } from "next-intl";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";

export function FieldMapPlaceholder({
  region,
  cadastralRef,
  centroidLabel,
  areaHectares,
}: {
  region: string;
  cadastralRef: string;
  centroidLabel: string;
  areaHectares: number;
}) {
  const t = useTranslations("contracts");
  const tCatalog = useTranslations("catalog");
  const tUnits = useTranslations("units");
  const locale = useLocale() as AppLocale;

  return (
    <div className="overflow-hidden border border-border bg-muted/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          {t("map.title")}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {t("map.placeholder")}
        </p>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_14rem]">
        <div
          aria-hidden="true"
          className="relative min-h-56 border border-primary/20 bg-[linear-gradient(#dfe6d4_1px,transparent_1px),linear-gradient(90deg,#dfe6d4_1px,transparent_1px)] bg-size-[28px_28px] bg-card"
        >
          <div className="absolute inset-[18%] border-2 border-primary/70 bg-primary/10" />
          <div className="absolute top-[22%] left-[22%] h-[36%] w-[28%] border border-primary/40 bg-primary/5" />
          <div className="absolute right-[20%] bottom-[20%] h-[30%] w-[34%] border border-primary/40 bg-card/70" />
          <span className="absolute top-2 right-2 border border-border bg-card px-1.5 py-0.5 text-[10px] tracking-widest uppercase">
            {t("map.north")}
          </span>
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              {t("fields.region")}
            </dt>
            <dd className="font-medium">{lookupMessage(tCatalog, `regions.${region}`)}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              {t("fields.cadastralRef")}
            </dt>
            <dd className="font-mono text-xs">{cadastralRef}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              {t("map.centroid")}
            </dt>
            <dd className="font-mono text-xs">{centroidLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              {t("map.area")}
            </dt>
            <dd className="font-medium">
              {tUnits("hectaresShort", {
                value: formatInteger(areaHectares, locale),
              })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

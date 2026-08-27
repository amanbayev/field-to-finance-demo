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
    <div className="overflow-hidden border border-harvest/20">
      <div className="flex items-center justify-between border-b border-harvest/20 px-3 py-2">
        <p className="label-caps text-harvest">{t("map.title")}</p>
        <p className="font-tabular text-[11px] text-straw">{t("map.placeholder")}</p>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_14rem]">
        <div
          aria-hidden="true"
          className="relative min-h-56 border border-harvest/25 bg-[linear-gradient(color-mix(in_srgb,var(--harvest)_22%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--harvest)_22%,transparent)_1px,transparent_1px)] bg-size-[28px_28px] bg-ink"
        >
          <div className="absolute inset-[18%] border-2 border-harvest/70 bg-harvest/10" />
          <div className="absolute top-[22%] left-[22%] h-[36%] w-[28%] border border-harvest/40 bg-harvest/5" />
          <div className="absolute right-[20%] bottom-[20%] h-[30%] w-[34%] border border-harvest/40 bg-ink/70" />
          <span className="absolute top-2 right-2 border border-harvest/30 bg-ink px-1.5 py-0.5 text-[10px] tracking-widest text-straw uppercase">
            {t("map.north")}
          </span>
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="label-caps">{t("fields.region")}</dt>
            <dd className="mt-1 text-bone">{lookupMessage(tCatalog, `regions.${region}`)}</dd>
          </div>
          <div>
            <dt className="label-caps">{t("fields.cadastralRef")}</dt>
            <dd className="mt-1 font-tabular text-xs">{cadastralRef}</dd>
          </div>
          <div>
            <dt className="label-caps">{t("map.centroid")}</dt>
            <dd className="mt-1 font-tabular text-xs">{centroidLabel}</dd>
          </div>
          <div>
            <dt className="label-caps">{t("map.area")}</dt>
            <dd className="mt-1 font-tabular">
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

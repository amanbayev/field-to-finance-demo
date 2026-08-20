import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LifecycleStrip } from "@/components/dashboard/lifecycle-strip";
import { MetricCard } from "@/components/dashboard/metric-card";
import { DualMoney } from "@/components/shared/dual-money";
import { productName } from "@/lib/navigation";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatPercent } from "@/lib/format";
import { getDashboardSnapshot } from "@/services/dashboard-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics, network } = getDashboardSnapshot();

  return (
    <div>
      <section className="mb-10 grid gap-6 border-b border-border pb-8 lg:grid-cols-[1.4fr_0.6fr]">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
            {t("dashboard.eyebrow")}
          </p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight sm:text-5xl">
            {productName}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            {t("brand.subtitle")}. {t("dashboard.intro")}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 self-end rounded-lg border border-border bg-card p-4">
          <div>
            <dt className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              {t("header.network")}
            </dt>
            <dd className="mt-1 text-sm font-medium">{network.network}</dd>
          </div>
          <div>
            <dt className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
              {t("header.system")}
            </dt>
            <dd className="mt-1 text-sm font-medium text-primary">
              {network.connected
                ? t("header.connected")
                : t("header.disconnected")}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mb-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label={t("dashboard.digitalContracts")}
          value={formatInteger(metrics.digitalContracts, locale)}
        />
        <MetricCard
          label={t("dashboard.contractVolume")}
          value={t("units.tonnes", {
            value: formatInteger(metrics.contractVolumeTonnes, locale),
          })}
        />
        <MetricCard
          label={t("dashboard.eligibleCoverage")}
          value={t("units.tonnes", {
            value: formatInteger(metrics.eligibleCoverageTonnes, locale),
          })}
        />
        <MetricCard
          label={t("dashboard.tokenizedVolume")}
          value={t("units.tonnes", {
            value: formatInteger(metrics.tokenizedVolumeTonnes, locale),
          })}
        />
        <MetricCard
          label={t("dashboard.activeFinancing")}
          value={<DualMoney value={metrics.activeFinancing} compact />}
        />
        <MetricCard
          label={t("dashboard.averageCoverageRatio")}
          value={formatPercent(metrics.averageCoverageRatioPercent, locale)}
        />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-heading text-2xl">{t("lifecycle.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("lifecycle.description")}
          </p>
        </div>
        <LifecycleStrip />
      </section>
    </div>
  );
}

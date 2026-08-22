import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { DataList } from "@/components/shared/data-list";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { requirePermission } from "@/lib/auth/guard";
import { getInvestorPortfolio } from "@/services/portfolio-service";
import { formatInteger } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";
import { forbidden } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portfolio");
  return { title: t("title") };
}

export default async function PortfolioPage() {
  const actor = await requirePermission("portfolio.read.own");
  const t = await getTranslations("portfolio");
  const locale = (await getLocale()) as AppLocale;
  const portfolio = await getInvestorPortfolio(actor);
  if (!portfolio) {
    forbidden();
  }

  return (
    <div>
      <PageHeader
        eyebrow={portfolio.organizationName ?? t("title")}
        title={t("title")}
        description={t("intro")}
      />
      <MetricStrip>
        <MetricCell
          emphasis="primary"
          label={t("holding")}
          value={
            portfolio.quantityLive != null
              ? t("quantity", { value: formatInteger(portfolio.quantityLive, locale) })
              : t("unavailable")
          }
        />
        <MetricCell label={t("instrument")} value={portfolio.instrument} />
        <MetricCell label={t("placement")} value={portfolio.placementId} />
      </MetricStrip>
      <DataList
        items={[
          { label: t("investorRef"), value: portfolio.investorReference },
          { label: t("network"), value: portfolio.network },
          { label: t("status"), value: portfolio.placementStatus },
          {
            label: t("coverage"),
            value: formatInteger(portfolio.coverage, locale),
          },
          { label: t("minted"), value: formatInteger(portfolio.minted, locale) },
          {
            label: t("circulating"),
            value: formatInteger(portfolio.circulating, locale),
          },
          {
            label: t("wallet"),
            value: <span className="break-all font-mono text-xs">{portfolio.wallet}</span>,
          },
        ]}
      />
      <p className="mt-4 text-sm text-muted-foreground">{t("holdingVsCoverage")}</p>
    </div>
  );
}

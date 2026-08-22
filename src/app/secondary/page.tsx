import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MarketClearingSplit } from "@/components/market-core/market-clearing-split";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("secondaryTitle") };
}

export default async function SecondaryMarketPage() {
  await requirePermission("market.read");
  const t = await getTranslations("workspace");
  const tCore = await getTranslations("marketCore");

  return (
    <div>
      <PageHeader
        eyebrow={t("secondaryEyebrow")}
        title={t("secondaryTitle")}
        description={tCore("marketClosed")}
      />
      <MarketClearingSplit
        distinction={tCore("clearingDistinct")}
        marketTitle={tCore("marketFlow")}
        clearingTitle={tCore("clearingFlow")}
        marketSteps={[tCore("order"), tCore("matching"), tCore("trade")]}
        clearingSteps={[
          tCore("trade"),
          tCore("eligibilityRecheck"),
          tCore("dvp"),
          tCore("finalSettlement"),
        ]}
      />
      <EmptyState>{t("secondaryBody")}</EmptyState>
      <p className="mt-3 text-sm text-muted-foreground">{t("noTradingHistory")}</p>
      <p className="mt-2 text-sm text-muted-foreground">{tCore("noOrders")}</p>
    </div>
  );
}

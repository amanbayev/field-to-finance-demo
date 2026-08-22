import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MarketClearingSplit } from "@/components/market-core/market-clearing-split";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DataList } from "@/components/shared/data-list";
import { requireRegistrarOrRegulator } from "@/lib/auth/guard";
import { marketCoreSnapshot } from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("clearingTitle") };
}

export default async function ClearingPage() {
  await requireRegistrarOrRegulator();
  const t = await getTranslations("marketCore");
  const snapshot = marketCoreSnapshot();
  const primary = snapshot.settlements.find(
    (item) => item.evidenceLabel === "PRIMARY_PLACEMENT_EVIDENCE",
  );

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("clearingTitle")}
        description={t("clearingIntro")}
      />
      <MarketClearingSplit
        distinction={t("clearingDistinct")}
        marketTitle={t("marketFlow")}
        clearingTitle={t("clearingFlow")}
        marketSteps={[t("order"), t("matching"), t("trade")]}
        clearingSteps={[
          t("trade"),
          t("eligibilityRecheck"),
          t("sellerReservation"),
          t("buyerReservation"),
          t("dvp"),
          t("registryUpdate"),
          t("finalSettlement"),
          t("audit"),
        ]}
      />
      <PageSection title={t("primaryEvidence")}>
        {primary ? (
          <DataList
            items={[
              { label: t("placement"), value: t("placementId") },
              { label: t("notSecondaryClearing"), value: primary.evidenceLabel },
              { label: t("noSecondaryTrade"), value: t("noSecondaryTrade") },
            ]}
          />
        ) : (
          <EmptyState>{t("noSecondaryTrade")}</EmptyState>
        )}
      </PageSection>
      <PageSection title={t("sectionMarket")}>
        <EmptyState>{t("noOrders")}</EmptyState>
      </PageSection>
    </div>
  );
}

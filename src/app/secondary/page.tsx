import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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

  return (
    <div>
      <PageHeader
        eyebrow={t("secondaryEyebrow")}
        title={t("secondaryTitle")}
        description={t("phase5")}
      />
      <EmptyState>{t("secondaryBody")}</EmptyState>
      <p className="mt-3 text-sm text-muted-foreground">{t("noTradingHistory")}</p>
    </div>
  );
}

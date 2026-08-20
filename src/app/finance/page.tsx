import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FinancingFlow } from "@/components/finance/financing-flow";
import { PageHeader } from "@/components/shared/page-header";
import { listFinancingModules } from "@/services/finance-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finance");
  return { title: t("title") };
}

export default async function FinancePage() {
  const t = await getTranslations("finance");
  const modules = listFinancingModules();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <div className="grid gap-4">
        {modules.map((module) => (
          <FinancingFlow key={module.id} module={module} />
        ))}
      </div>
    </div>
  );
}

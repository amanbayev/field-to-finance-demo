import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FinancingFlow } from "@/components/finance/financing-flow";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { listFinancingModules } from "@/services/finance-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finance");
  return { title: t("title") };
}

export default async function FinancePage() {
  await requirePermission("contracts.read.own", "market.read");
  const t = await getTranslations("finance");
  const modules = listFinancingModules();
  const loan = modules.find((module) => module.module === "SECURED_LOAN");
  const repo = modules.find((module) => module.module === "REPO");

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      {loan ? <FinancingFlow module={loan} /> : null}
      {repo ? (
        <PageSection title={t("secondaryModule")}>
          <FinancingFlow module={repo} />
        </PageSection>
      ) : null}
    </div>
  );
}

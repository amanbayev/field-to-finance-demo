import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContractSummaryCard } from "@/components/contracts/contract-summary-card";
import { PageHeader } from "@/components/shared/page-header";
import { listContracts } from "@/services/contract-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contracts");
  return { title: t("title") };
}

export default async function ContractsPage() {
  const t = await getTranslations("contracts");
  const items = listContracts();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <ContractSummaryCard key={item.contract.id} item={item} />
        ))}
      </div>
    </div>
  );
}

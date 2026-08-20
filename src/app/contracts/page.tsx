import type { Metadata } from "next";
import { ContractSummaryCard } from "@/components/contracts/contract-summary-card";
import { PageHeader } from "@/components/shared/page-header";
import { listContracts } from "@/services/contract-service";

export const metadata: Metadata = {
  title: "Contracts",
};

export default function ContractsPage() {
  const items = listContracts();

  return (
    <div>
      <PageHeader
        eyebrow="Digital Agricultural Contract Registry"
        title="Contracts"
        description="Mock digital agricultural contracts. Status, verification and production figures are demonstration data only."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <ContractSummaryCard key={item.contract.id} item={item} />
        ))}
      </div>
    </div>
  );
}

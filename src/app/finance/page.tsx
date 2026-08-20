import type { Metadata } from "next";
import { FinancingFlow } from "@/components/finance/financing-flow";
import { PageHeader } from "@/components/shared/page-header";
import { listFinancingModules } from "@/services/finance-service";

export const metadata: Metadata = {
  title: "Finance",
};

export default function FinancePage() {
  const modules = listFinancingModules();

  return (
    <div>
      <PageHeader
        eyebrow="Collateral and structured financing"
        title="Finance"
        description="Financing modules are shown as product placeholders. No credit is originated in this prototype."
      />
      <div className="grid gap-4">
        {modules.map((module) => (
          <FinancingFlow key={module.id} module={module} />
        ))}
      </div>
    </div>
  );
}

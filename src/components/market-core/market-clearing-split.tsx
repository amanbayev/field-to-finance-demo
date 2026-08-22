import { PageSection } from "@/components/shared/page-section";
import { WorkflowStrip } from "@/components/market-core/workflow-strip";

export function MarketClearingSplit({
  distinction,
  marketTitle,
  clearingTitle,
  marketSteps,
  clearingSteps,
}: {
  distinction: string;
  marketTitle: string;
  clearingTitle: string;
  marketSteps: readonly string[];
  clearingSteps: readonly string[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{distinction}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <PageSection title={marketTitle} className="mt-0">
          <WorkflowStrip steps={marketSteps} />
        </PageSection>
        <PageSection title={clearingTitle} className="mt-0">
          <WorkflowStrip steps={clearingSteps} />
        </PageSection>
      </div>
    </div>
  );
}

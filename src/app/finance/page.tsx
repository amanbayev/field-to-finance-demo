import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { lookupMessage } from "@/i18n/t-dynamic";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { listContractsForActor } from "@/services/access-service";
import {
  FINANCING_STAGE_IDS,
  producerFinancingStages,
} from "@/services/workspace-view";

const STAGE_LABEL: Record<(typeof FINANCING_STAGE_IDS)[number], string> = {
  dac: "lifecycleDac",
  scas: "lifecycleScas",
  matching: "lifecycleMatching",
  pool: "lifecyclePool",
  coverage: "lifecycleCoverage",
  finance: "lifecycleFinance",
};

export async function generateMetadata(): Promise<Metadata> {
  await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  return { title: t("financeTitle") };
}

export default async function FinancePage() {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  const items = listContractsForActor(actor);

  return (
    <div>
      <PageHeader
        eyebrow={t("financeEyebrow")}
        title={t("financeTitle")}
        description={t("financeIntro")}
      />
      <p className="mb-5 rounded-sm border border-border bg-card p-4 text-sm">
        {t("financeNotProvided")}
      </p>
      {items.length === 0 ? (
        <EmptyState>{t("monitoringEmpty")}</EmptyState>
      ) : null}
      {items.map(({ contract }) => {
        const stages = producerFinancingStages(contract);
        return (
          <PageSection
            key={contract.id}
            title={
              <Link
                href={`/contracts/${contract.id}`}
                className="text-primary hover:underline"
              >
                {contract.id}
              </Link>
            }
            description={t("financingLifecycle")}
          >
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 border border-border bg-card px-3 py-2.5 text-sm">
              {stages.map((stage, index) => (
                <li key={stage.id} className="flex items-center gap-1">
                  {index > 0 ? (
                    <span className="px-1 text-muted-foreground" aria-hidden>
                      →
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">
                    {lookupMessage(t, STAGE_LABEL[stage.id])}
                  </span>
                  <span className="text-xs">
                    {stage.done ? t("stageDone") : t("stageOpen")}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("financeNotProvided")}
            </p>
          </PageSection>
        );
      })}
    </div>
  );
}

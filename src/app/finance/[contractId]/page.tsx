import type { Metadata } from "next";
import { notFound, forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { DeskBackLink, DeskFigure } from "@/components/surface/desk-stage";
import {
  FINANCING_STAGE_LABEL,
  FinancePlotsLedger,
  FinanceStageLedger,
  financingProgress,
} from "@/components/workspace/finance-record";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { getContractForActor, listContractsForActor } from "@/services/access-service";
import { listContractIds } from "@/services/contract-service";

export const dynamicParams = false;

export function generateStaticParams() {
  return listContractIds().map((contractId) => ({ contractId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ contractId: string }>;
}): Promise<Metadata> {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const { contractId } = await params;
  const item = getContractForActor(actor, contractId);
  if (!item || item === "forbidden") {
    const t = await getTranslations("workspace");
    return { title: t("financeTitle") };
  }
  return { title: item.contract.field.cadastralRef };
}

export default async function FinanceDetailPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const { contractId } = await params;
  const item = getContractForActor(actor, contractId);

  if (item === "forbidden") {
    forbidden();
  }
  if (!item) {
    notFound();
  }

  const t = await getTranslations("workspace");
  const tDesk = await getTranslations("desk");
  const plots = listContractsForActor(actor);
  const progress = financingProgress(item);
  const nextLabel = progress.next
    ? lookupMessage(t, FINANCING_STAGE_LABEL[progress.next.id])
    : t("financeNotProvided");

  return (
    <div>
      <PageHeader
        eyebrow={t("financeEyebrow")}
        title={item.contract.field.cadastralRef}
        description={t("financeIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          <DeskFigure
            label={t("financingLifecycle")}
            value={`${progress.done} / ${progress.total}`}
            meta={[
              {
                label: tDesk("nextStage"),
                value: nextLabel,
              },
            ]}
          />
        }
      />
      <DeskBackLink href="/finance" label={tDesk("backToFinance")} />
      <FinanceStageLedger item={item} />
      {plots.length > 1 ? (
        <PageSection title={tDesk("plots")}>
          <FinancePlotsLedger items={plots} activeId={item.contract.id} />
        </PageSection>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import { notFound, forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { DeskBackLink, DeskFigure } from "@/components/surface/desk-stage";
import {
  DocumentsDetailRecord,
  DocumentsPlotsLedger,
  documentCheckCount,
} from "@/components/workspace/documents-record";
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
    return { title: t("documentsTitle") };
  }
  return { title: item.contract.field.cadastralRef };
}

export default async function DocumentsDetailPage({
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
  const tStatus = await getTranslations("status");
  const plots = listContractsForActor(actor);
  const checks = documentCheckCount(item);

  return (
    <div>
      <PageHeader
        eyebrow={t("documentsEyebrow")}
        title={item.contract.field.cadastralRef}
        description={t("documentsIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          <DeskFigure
            label={tDesk("verifiedPlots")}
            value={`${checks.clear} / ${checks.total}`}
            meta={[
              {
                label: t("kyb"),
                value: lookupMessage(tStatus, item.contract.verification.kyb),
              },
              {
                label: t("landRights"),
                value: lookupMessage(tStatus, item.contract.verification.landRights),
              },
            ]}
          />
        }
      />
      <DeskBackLink href="/documents" label={tDesk("backToDocuments")} />
      <DocumentsDetailRecord item={item} />
      {plots.length > 1 ? (
        <PageSection title={tDesk("plots")}>
          <DocumentsPlotsLedger items={plots} activeId={item.contract.id} />
        </PageSection>
      ) : null}
    </div>
  );
}

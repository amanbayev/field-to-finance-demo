import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure } from "@/components/surface/desk-stage";
import {
  DocumentsPlotsLedger,
} from "@/components/workspace/documents-record";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { listContractsForActor } from "@/services/access-service";
import { isVerificationComplete } from "@/services/workspace-view";

export async function generateMetadata(): Promise<Metadata> {
  await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  return { title: t("documentsTitle") };
}

export default async function DocumentsPage() {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  const tDesk = await getTranslations("desk");
  const locale = (await getLocale()) as AppLocale;
  const items = listContractsForActor(actor);
  const verified = items.filter((item) =>
    isVerificationComplete(item.contract.verification),
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow={t("documentsEyebrow")}
        title={t("documentsTitle")}
        description={t("documentsIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          items.length ? (
            <DeskFigure
              label={tDesk("plots")}
              value={formatInteger(items.length, locale)}
              meta={[
                {
                  label: tDesk("verifiedPlots"),
                  value: formatInteger(verified, locale),
                },
                {
                  label: tDesk("openChecks"),
                  value: formatInteger(items.length - verified, locale),
                },
              ]}
            />
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState
          kicker={t("documentsEyebrow")}
          title={tDesk("noDocumentsTitle")}
          body={tDesk("noDocumentsBody")}
        />
      ) : (
        <DocumentsPlotsLedger items={items} />
      )}
    </div>
  );
}

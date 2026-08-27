import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure } from "@/components/surface/desk-stage";
import {
  FinancePlotsLedger,
  financingProgress,
} from "@/components/workspace/finance-record";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { listContractsForActor } from "@/services/access-service";

export async function generateMetadata(): Promise<Metadata> {
  await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  return { title: t("financeTitle") };
}

export default async function FinancePage() {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  const tDesk = await getTranslations("desk");
  const locale = (await getLocale()) as AppLocale;
  const items = listContractsForActor(actor);
  const ready = items.filter((item) => financingProgress(item).readyForCapital).length;

  return (
    <div>
      <PageHeader
        eyebrow={t("financeEyebrow")}
        title={t("financeTitle")}
        description={t("financeIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          items.length ? (
            <DeskFigure
              label={tDesk("plots")}
              value={formatInteger(items.length, locale)}
              meta={[
                {
                  label: tDesk("readyPlots"),
                  value: formatInteger(ready, locale),
                },
                {
                  label: tDesk("openStages"),
                  value: formatInteger(items.length - ready, locale),
                },
              ]}
            />
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState
          kicker={t("financeEyebrow")}
          title={tDesk("noFinanceTitle")}
          body={tDesk("noFinanceBody")}
        />
      ) : (
        <FinancePlotsLedger items={items} />
      )}
    </div>
  );
}

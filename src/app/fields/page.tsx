import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure } from "@/components/surface/desk-stage";
import { FieldPlotsLedger } from "@/components/fields/field-record";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { listContractsForActor } from "@/services/access-service";

export async function generateMetadata(): Promise<Metadata> {
  await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  return { title: t("fieldsTitle") };
}

export default async function FieldsPage() {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  const tDesk = await getTranslations("desk");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const items = listContractsForActor(actor);
  const hectares = items.reduce((sum, item) => sum + item.contract.field.areaHectares, 0);

  return (
    <div>
      <PageHeader
        eyebrow={t("fieldsEyebrow")}
        title={t("fieldsTitle")}
        description={t("fieldsIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          items.length ? (
            <DeskFigure
              label={tDesk("plots")}
              value={formatInteger(items.length, locale)}
              meta={[
                {
                  label: t("area"),
                  value: tUnits("hectaresShort", {
                    value: formatInteger(hectares, locale),
                  }),
                },
              ]}
            />
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState
          kicker={t("fieldsEyebrow")}
          title={tDesk("noFieldsTitle")}
          body={tDesk("noFieldsBody")}
        />
      ) : (
        <FieldPlotsLedger items={items} />
      )}
    </div>
  );
}

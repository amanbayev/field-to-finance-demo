import type { Metadata } from "next";
import { notFound, forbidden } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure } from "@/components/surface/desk-stage";
import {
  FieldDetailRecord,
  FieldSiblings,
  FieldsBackLink,
} from "@/components/fields/field-record";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
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
    return { title: t("fieldsTitle") };
  }
  return { title: item.contract.field.cadastralRef };
}

export default async function FieldDetailPage({
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
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const plots = listContractsForActor(actor);

  return (
    <div>
      <PageHeader
        eyebrow={t("fieldsEyebrow")}
        title={item.contract.field.cadastralRef}
        description={item.producer.legalName}
        photo="/media/hero-harvest-dusk.png"
        figure={
          <DeskFigure
            label={t("area")}
            value={tUnits("hectaresShort", {
              value: formatInteger(item.contract.field.areaHectares, locale),
            })}
            meta={[
              {
                label: t("season"),
                value: String(item.contract.production.season),
              },
            ]}
          />
        }
      />
      <FieldsBackLink label={tDesk("backToFields")} />
      <FieldDetailRecord item={item} />
      <FieldSiblings items={plots} activeId={item.contract.id} />
    </div>
  );
}

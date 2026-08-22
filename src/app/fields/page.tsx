import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FieldMapPlaceholder } from "@/components/contracts/field-map-placeholder";
import { DataList } from "@/components/shared/data-list";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { lookupMessage } from "@/i18n/t-dynamic";
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
  const tContracts = await getTranslations("contracts");
  const tCatalog = await getTranslations("catalog");
  const items = listContractsForActor(actor);

  return (
    <div>
      <PageHeader
        eyebrow={t("fieldsEyebrow")}
        title={t("fieldsTitle")}
        description={t("fieldsIntro")}
      />
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("monitoringEmpty")}</p>
      ) : null}
      {items.map(({ contract, producer }) => (
        <PageSection key={contract.id} title={contract.field.cadastralRef}>
          <DataList
            items={[
              { label: tContracts("fields.legalName"), value: producer.legalName },
              {
                label: t("cadastral"),
                value: contract.field.cadastralRef,
              },
              {
                label: tContracts("fields.region"),
                value: lookupMessage(tCatalog, `regions.${contract.field.region}`),
              },
              {
                label: t("area"),
                value: String(contract.field.areaHectares),
              },
              {
                label: tContracts("fields.crop"),
                value: lookupMessage(
                  tCatalog,
                  `crops.${contract.production.crop}`,
                ),
              },
              { label: t("season"), value: String(contract.production.season) },
              {
                label: t("landRights"),
                value: <StatusBadge value={contract.verification.landRights} />,
              },
              {
                label: t("fieldVerification"),
                value: <StatusBadge value={contract.verification.field} />,
              },
              {
                label: t("cropConfirmation"),
                value: <StatusBadge value={contract.verification.crop} />,
              },
            ]}
          />
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted-foreground">{t("noGis")}</p>
            <FieldMapPlaceholder
              region={contract.field.region}
              cadastralRef={contract.field.cadastralRef}
              centroidLabel={contract.field.centroidLabel}
              areaHectares={contract.field.areaHectares}
            />
          </div>
        </PageSection>
      ))}
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { organizationById } from "@/data/identity/demo-catalog";
import type { OriginationDacRecord } from "@/domain/origination";
import { isDacExecutedOrLater } from "@/domain/origination";
import { shortenTermsHash } from "@/domain/origination/terms";

export async function DacPartiesPanel({ dac }: { dac: OriginationDacRecord }) {
  const t = await getTranslations("origination");
  const producerName =
    organizationById(dac.producerOrganizationId)?.name ?? dac.producerOrganizationId;
  const issuerName = dac.issuerOrganizationId
    ? (organizationById(dac.issuerOrganizationId)?.name ?? dac.issuerOrganizationId)
    : t("issuerNotSelected");
  const producerState = dac.producerConfirmedAt ? t("partyConfirmed") : t("partyPending");
  const issuerState = dac.issuerConfirmedAt ? t("partyConfirmed") : t("partyPending");
  return (
    <div>
      <p className="label-caps text-harvest">{t("partyPanel")}</p>
      <div className="mt-4">
        <DataList
          items={[
            { label: t("producer"), value: `${producerName} · ${producerState}` },
            { label: t("issuer"), value: `${issuerName} · ${issuerState}` },
            { label: t("termsVersion"), value: String(dac.termsVersion) },
            { label: t("termsHash"), value: shortenTermsHash(dac.currentTermsHash) },
            {
              label: t("executed"),
              value: isDacExecutedOrLater(dac.status) ? t("executedYes") : t("executedNo"),
            },
          ]}
        />
      </div>
    </div>
  );
}

export async function DacStageLegend() {
  const t = await getTranslations("origination");
  return (
    <p className="text-sm text-straw">
      {t("stageLegend")}
    </p>
  );
}

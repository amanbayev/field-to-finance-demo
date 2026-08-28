import { getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import type { OriginationDacRecord } from "@/domain/origination";
import { isDacExecutedOrLater } from "@/domain/origination";
import { shortenTermsHash } from "@/domain/origination/terms";
import { originationService } from "@/services/origination-service";

export async function organizationLabel(id: string | null | undefined, fallback = "—") {
  if (!id) {
    return fallback;
  }
  const organization = await originationService().getOrganization(id);
  return organization?.name ?? id;
}

export async function organizationLabels(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const entries = await Promise.all(
    unique.map(async (id) => [id, await organizationLabel(id, id)] as const),
  );
  return Object.fromEntries(entries);
}

export async function DacPartiesPanel({ dac }: { dac: OriginationDacRecord }) {
  const t = await getTranslations("origination");
  const producerName = await organizationLabel(dac.producerOrganizationId, dac.producerOrganizationId);
  const issuerName = dac.issuerOrganizationId
    ? await organizationLabel(dac.issuerOrganizationId, dac.issuerOrganizationId)
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

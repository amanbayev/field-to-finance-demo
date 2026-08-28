import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { DeskBackLink } from "@/components/surface/desk-stage";
import { ActionError } from "@/components/origination/document-panel";
import { DacDesk } from "@/components/origination/dac-desk";
import { DacPartiesPanel, DacStageLegend } from "@/components/origination/dac-parties";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataList } from "@/components/shared/data-list";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requireIssuerOperator } from "@/lib/auth/guard";
import { OriginationError, allowsIssuerDacConfirm } from "@/domain/origination";
import { originationService } from "@/services/origination-service";
import { organizationById } from "@/data/identity/demo-catalog";
import { stageMediaForRole } from "@/lib/surface/role-media";
import {
  confirmIssuerDacAction,
  returnIssuerDacAction,
} from "@/app/issuer/dacs/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dacId: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("origination");
  const { dacId } = await params;
  return { title: `${t("issuerDeskTitle")} ${dacId}` };
}

export default async function IssuerDacDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ dacId: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const actor = await requireIssuerOperator();
  const { dacId } = await params;
  const query = await searchParams;
  let bundle;
  try {
    bundle = await originationService().getDacBundle(actor, dacId);
  } catch (error) {
    if (error instanceof OriginationError && (error.code === "not_found" || error.code === "forbidden")) {
      notFound();
    }
    throw error;
  }
  const t = await getTranslations("origination");
  const tDesk = await getTranslations("desk");
  const tUnits = await getTranslations("units");
  const tCatalog = await getTranslations("catalog");
  const media = stageMediaForRole("ISSUER_OPERATOR");
  const { dac } = bundle;
  const producerName =
    organizationById(dac.producerOrganizationId)?.name ?? dac.producerOrganizationId;
  const canConfirm = allowsIssuerDacConfirm(dac.status);

  return (
    <div>
      <PageHeader
        eyebrow={dac.publicId}
        title={t("issuerDeskTitle")}
        description={t("dacNotAToken")}
        photo={media.src}
        photoAlt=""
        photoPosition={media.position}
      />
      <DeskBackLink href="/issuer/dacs" label={tDesk("backToIssuerDacs")} />
      <ActionError show={Boolean(query.error)} />
      <p className="mb-6">
        <StatusBadge value={dac.status} />
      </p>
      <DacDesk
        bundle={bundle}
        basePath={`/issuer/dacs/${dac.publicId}`}
        tab={query.tab ?? "overview"}
        allowComments={false}
      >
        <DacStageLegend />
        <div className="mt-6">
          <DacPartiesPanel dac={dac} />
        </div>
        <div className="mt-8">
          <DataList
            items={[
              { label: t("producer"), value: producerName },
              { label: t("fieldId"), value: bundle.field.publicId },
              { label: t("crop"), value: lookupMessage(tCatalog, `crops.${dac.crop}`) },
              { label: t("harvestYear"), value: String(dac.harvestYear) },
              {
                label: t("expectedVolume"),
                value:
                  dac.expectedVolumeTonnes != null
                    ? tUnits("tonnes", { value: String(dac.expectedVolumeTonnes) })
                    : "—",
              },
              { label: t("qualityClass"), value: dac.qualityClass ?? "—" },
              { label: t("termsVersion"), value: String(dac.termsVersion) },
            ]}
          />
        </div>
        {canConfirm ? (
          <div className="mt-8 grid gap-6">
            <form action={confirmIssuerDacAction}>
              <input type="hidden" name="dacId" value={dac.publicId} />
              <FormSubmitButton pendingLabel={t("confirmTerms")}>{t("confirmTerms")}</FormSubmitButton>
              <p className="mt-2 text-xs text-straw">{t("demoConfirmation")}</p>
            </form>
            <form action={returnIssuerDacAction} className="grid gap-2">
              <input type="hidden" name="dacId" value={dac.publicId} />
              <textarea
                name="reason"
                required
                placeholder={t("returnReason")}
                className="desk-control min-h-[4rem] w-full py-2"
              />
              <FormSubmitButton variant="outline" pendingLabel={t("returnForChanges")}>
                {t("returnForChanges")}
              </FormSubmitButton>
            </form>
          </div>
        ) : null}
      </DacDesk>
    </div>
  );
}

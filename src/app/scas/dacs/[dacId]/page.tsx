import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { DeskBackLink } from "@/components/surface/desk-stage";
import { ActionError } from "@/components/origination/document-panel";
import { DacDesk } from "@/components/origination/dac-desk";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireScasVerifier } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import { OriginationError, allowsScasDacEdit, allowsScasDacSubmit, allowsScasSendToProducer } from "@/domain/origination";
import { lookupMessage } from "@/i18n/t-dynamic";
import { stageMediaForRole } from "@/lib/surface/role-media";
import { DacPartiesPanel, DacStageLegend } from "@/components/origination/dac-parties";
import {
  sendDacMessageAction,
  sendDacToProducerAction,
  submitDacAction,
  updateDacAction,
} from "@/app/scas/dacs/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dacId: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("origination");
  const { dacId } = await params;
  return { title: `${t("dacDeskTitle")} ${dacId}` };
}

export default async function ScasDacDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ dacId: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const actor = await requireScasVerifier();
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
  const tCatalog = await getTranslations("catalog");
  const media = stageMediaForRole("SCAS_OPERATOR");
  const { dac } = bundle;
  const canEdit = allowsScasDacEdit(dac.status);
  const canSendProducer = allowsScasSendToProducer(dac.status);
  const canSubmit = allowsScasDacSubmit(dac.status);
  const issuers = await originationService().listActiveIssuerOrganizations(actor);

  return (
    <div>
      <PageHeader
        eyebrow={dac.publicId}
        title={t("dacDeskTitle")}
        description={t("dacNotAToken")}
        photo={media.src}
        photoAlt=""
        photoPosition={media.position}
      />
      <DeskBackLink href="/scas/dacs" label={tDesk("backToDacs")} />
      <ActionError show={Boolean(query.error)} />
      <p className="mb-6">
        <StatusBadge value={dac.status} />
      </p>
      <DacDesk
        bundle={bundle}
        basePath={`/scas/dacs/${dac.publicId}`}
        tab={query.tab ?? "overview"}
        messageAction={sendDacMessageAction}
      >
        <p className="label-caps text-harvest">{t("dacCommercial")}</p>
        <div className="mt-4">
          <DacStageLegend />
        </div>
        <div className="mt-6">
          <DacPartiesPanel dac={dac} />
        </div>
        {canEdit ? (
          <form action={updateDacAction} className="mt-8 grid gap-4">
            <input type="hidden" name="dacId" value={dac.publicId} />
            <input type="hidden" name="expectedTermsHash" value={dac.currentTermsHash} />
            <label className="grid gap-2">
              <span className="label-caps">{t("issuer")}</span>
              <select
                name="issuerOrganizationId"
                required
                defaultValue={dac.issuerOrganizationId ?? ""}
                className="desk-control w-full py-2"
              >
                <option value="">{t("issuerNotSelected")}</option>
                {issuers.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("crop")}</span>
              <select name="crop" required defaultValue={dac.crop} className="desk-control w-full py-2">
                {dac.crop !== "Wheat" && dac.crop !== "Barley" ? (
                  <option value={dac.crop}>{lookupMessage(tCatalog, `crops.${dac.crop}`)}</option>
                ) : null}
                <option value="Wheat">{lookupMessage(tCatalog, "crops.Wheat")}</option>
                <option value="Barley">{lookupMessage(tCatalog, "crops.Barley")}</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("harvestYear")}</span>
              <input
                name="harvestYear"
                type="number"
                required
                defaultValue={dac.harvestYear}
                className="desk-control w-full py-2"
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("contractedVolume")}</span>
              <input
                name="contractedVolumeTonnes"
                type="number"
                step="0.01"
                defaultValue={dac.contractedVolumeTonnes ?? ""}
                className="desk-control w-full py-2"
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("deliveryStartDate")}</span>
              <input
                name="deliveryStartDate"
                type="date"
                defaultValue={dac.deliveryStartDate ?? ""}
                className="desk-control w-full py-2"
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("deliveryEndDate")}</span>
              <input
                name="deliveryEndDate"
                type="date"
                defaultValue={dac.deliveryEndDate ?? ""}
                className="desk-control w-full py-2"
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("deliveryLocation")}</span>
              <input
                name="deliveryLocation"
                defaultValue={dac.deliveryLocation ?? ""}
                className="desk-control w-full py-2"
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("qualityClass")}</span>
              <select name="qualityClass" defaultValue={dac.qualityClass ?? ""} className="desk-control w-full py-2">
                <option value="">—</option>
                <option value="Class 2">{lookupMessage(tCatalog, "quality.Class 2")}</option>
                <option value="Class 3">{lookupMessage(tCatalog, "quality.Class 3")}</option>
                <option value="Class 4">{lookupMessage(tCatalog, "quality.Class 4")}</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("producerReference")}</span>
              <input
                name="producerReference"
                defaultValue={dac.producerReference ?? ""}
                className="desk-control w-full py-2"
              />
            </label>
            <label className="grid gap-2">
              <span className="label-caps">{t("scasNotes")}</span>
              <textarea
                name="scasNotes"
                defaultValue={dac.scasNotes}
                className="desk-control min-h-[5rem] w-full py-2"
              />
            </label>
            <FormSubmitButton pendingLabel={t("saveDac")}>{t("saveDac")}</FormSubmitButton>
          </form>
        ) : (
          <dl className="mt-8 grid gap-3 text-sm text-bone">
            <div>
              <dt className="label-caps text-straw">{t("crop")}</dt>
              <dd className="mt-1">{lookupMessage(tCatalog, `crops.${dac.crop}`)}</dd>
            </div>
            <div>
              <dt className="label-caps text-straw">{t("contractedVolume")}</dt>
              <dd className="mt-1 font-tabular">{dac.contractedVolumeTonnes ?? "—"}</dd>
            </div>
            <div>
              <dt className="label-caps text-straw">{t("deliveryStartDate")}</dt>
              <dd className="mt-1 font-tabular">{dac.deliveryStartDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="label-caps text-straw">{t("deliveryEndDate")}</dt>
              <dd className="mt-1 font-tabular">{dac.deliveryEndDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="label-caps text-straw">{t("deliveryLocation")}</dt>
              <dd className="mt-1">{dac.deliveryLocation ?? "—"}</dd>
            </div>
            <div>
              <dt className="label-caps text-straw">{t("scasNotes")}</dt>
              <dd className="mt-1">{dac.scasNotes || "—"}</dd>
            </div>
          </dl>
        )}
        {canSendProducer ? (
          <form action={sendDacToProducerAction} className="mt-8">
            <input type="hidden" name="dacId" value={dac.publicId} />
            <input type="hidden" name="expectedTermsHash" value={dac.currentTermsHash} />
            <FormSubmitButton pendingLabel={t("sendToProducer")}>{t("sendToProducer")}</FormSubmitButton>
          </form>
        ) : null}
        {canSubmit ? (
          <form action={submitDacAction} className="mt-8">
            <input type="hidden" name="dacId" value={dac.publicId} />
            <FormSubmitButton pendingLabel={t("submitRegistrar")}>{t("submitRegistrar")}</FormSubmitButton>
          </form>
        ) : null}
      </DacDesk>
    </div>
  );
}

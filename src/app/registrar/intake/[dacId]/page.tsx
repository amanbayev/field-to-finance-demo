import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { DeskBackLink } from "@/components/surface/desk-stage";
import { ActionError } from "@/components/origination/document-panel";
import { DacDesk } from "@/components/origination/dac-desk";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataList } from "@/components/shared/data-list";
import { lookupMessage } from "@/i18n/t-dynamic";
import { organizationById } from "@/data/identity/demo-catalog";
import { DacPartiesPanel } from "@/components/origination/dac-parties";
import { requireRegistrarIntake } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import {
  OriginationError,
  allowsRegistrarDecision,
  allowsRegistrarReviewStart,
} from "@/domain/origination";
import { stageMediaForRole } from "@/lib/surface/role-media";
import {
  acceptDacIntakeAction,
  returnDacIntakeAction,
  sendRegistrarDacMessageAction,
  startRegistrarReviewAction,
} from "@/app/registrar/intake/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dacId: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("origination");
  const { dacId } = await params;
  return { title: `${t("intakeTitle")} ${dacId}` };
}

export default async function RegistrarIntakeDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ dacId: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const actor = await requireRegistrarIntake();
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
  const media = stageMediaForRole("REGISTRAR_OPERATOR");
  const { dac } = bundle;

  return (
    <div>
      <PageHeader
        eyebrow={dac.publicId}
        title={t("intakeTitle")}
        description={t("dacNotAToken")}
        photo={media.src}
        photoAlt=""
        photoPosition={media.position}
      />
      <DeskBackLink href="/registrar/intake" label={tDesk("backToIntake")} />
      <ActionError show={Boolean(query.error)} />
      <p className="mb-6">
        <StatusBadge value={dac.status} />
      </p>
      <DacDesk
        bundle={bundle}
        basePath={`/registrar/intake/${dac.publicId}`}
        tab={query.tab ?? "overview"}
        messageAction={sendRegistrarDacMessageAction}
      >
        <DacPartiesPanel dac={dac} />
        <div className="mt-8">
        <DataList
          items={[
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
            { label: t("producer"), value: organizationById(dac.producerOrganizationId)?.name ?? dac.producerOrganizationId },
            {
              label: t("issuer"),
              value: dac.issuerOrganizationId
                ? (organizationById(dac.issuerOrganizationId)?.name ?? dac.issuerOrganizationId)
                : "—",
            },
            { label: t("termsVersion"), value: String(dac.termsVersion) },
            { label: t("termsHash"), value: dac.executedTermsHash ? dac.executedTermsHash.slice(0, 12) + "…" : "—" },
            { label: t("executedAt"), value: dac.executedAt ?? "—" },
            { label: t("producerConfirmedAt"), value: dac.producerConfirmedAt ?? "—" },
            { label: t("issuerConfirmedAt"), value: dac.issuerConfirmedAt ?? "—" },
            { label: t("submittedAt"), value: dac.submittedToRegistrarAt ?? "—" },
            { label: t("producerReference"), value: dac.producerReference ?? "—" },
            { label: t("scasNotes"), value: dac.scasNotes || "—" },
            { label: t("registrarNotes"), value: dac.registrarNotes || "—" },
          ]}
        />
        </div>
        <div className="mt-8 grid gap-6">
          {allowsRegistrarReviewStart(dac.status) ? (
            <form action={startRegistrarReviewAction}>
              <input type="hidden" name="dacId" value={dac.publicId} />
              <FormSubmitButton pendingLabel={t("startReview")}>{t("startReview")}</FormSubmitButton>
            </form>
          ) : null}
          {allowsRegistrarDecision(dac.status) ? (
            <>
              <form action={acceptDacIntakeAction} className="grid gap-2">
                <input type="hidden" name="dacId" value={dac.publicId} />
                <textarea
                  name="notes"
                  placeholder={t("registrarNotes")}
                  className="desk-control min-h-[4rem] w-full py-2"
                />
                <FormSubmitButton pendingLabel={t("acceptIntake")}>{t("acceptIntake")}</FormSubmitButton>
              </form>
              <form action={returnDacIntakeAction} className="grid gap-2">
                <input type="hidden" name="dacId" value={dac.publicId} />
                <textarea
                  name="notes"
                  required
                  placeholder={t("returnReason")}
                  className="desk-control min-h-[4rem] w-full py-2"
                />
                <FormSubmitButton variant="outline" pendingLabel={t("returnIntake")}>
                  {t("returnIntake")}
                </FormSubmitButton>
              </form>
            </>
          ) : null}
        </div>
      </DacDesk>
    </div>
  );
}

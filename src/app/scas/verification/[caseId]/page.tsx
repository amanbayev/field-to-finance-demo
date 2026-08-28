import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { DataList } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeskBackLink } from "@/components/surface/desk-stage";
import { MessageForm, ActionError } from "@/components/origination/document-panel";
import { EvidenceViewer } from "@/components/origination/evidence-viewer";
import {
  documentsToViewerItems,
  evidenceToViewerItems,
} from "@/components/origination/viewer-items";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import type { AppLocale } from "@/i18n/config";
import { formatNumber, formatTimestamp } from "@/lib/format";
import { requireScasVerifier } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import { OriginationError } from "@/domain/origination";
import { organizationById } from "@/data/identity/demo-catalog";
import { lookupMessage } from "@/i18n/t-dynamic";
import {
  acceptDocumentAction,
  addEvidenceAction,
  approveFieldAction,
  assignReviewerAction,
  recordCadastreAction,
  rejectFieldAction,
  requestChangesAction,
  requestReplacementAction,
  sendCaseMessageAction,
} from "@/app/scas/verification/actions";
import { createDacAction } from "@/app/scas/dacs/actions";
import { stageMediaForRole } from "@/lib/surface/role-media";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ caseId: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("origination");
  const { caseId } = await params;
  return { title: `${t("caseTitle")} ${caseId}` };
}

export default async function ScasVerificationCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireScasVerifier();
  const { caseId } = await params;
  const query = await searchParams;
  let bundle;
  try {
    bundle = await originationService().getCaseBundle(actor, caseId);
  } catch (error) {
    if (error instanceof OriginationError && (error.code === "not_found" || error.code === "forbidden")) {
      notFound();
    }
    throw error;
  }
  const t = await getTranslations("origination");
  const tUnits = await getTranslations("units");
  const tCatalog = await getTranslations("catalog");
  const locale = (await getLocale()) as AppLocale;
  const media = stageMediaForRole("SCAS_OPERATOR");
  const { field, documents, cadastre, evidence, messages, verificationCase, submissions, dac } = bundle;
  const currentDocs = documents.filter((document) => document.current);
  const viewerItems = [
    ...documentsToViewerItems(documents),
    ...evidenceToViewerItems(evidence),
  ];
  const producerName = organizationById(field.organizationId)?.name ?? field.organizationId;
  const latestSubmission = submissions.at(-1);
  const verified = verificationCase.status === "VERIFIED";
  const closed = verified || verificationCase.status === "REJECTED";

  return (
    <div>
      <PageHeader
        eyebrow={verificationCase.publicId}
        title={field.publicId}
        description={`${producerName} · ${field.declared.cadastreNumber}`}
        photo={media.src}
        photoAlt=""
        photoPosition={media.position}
      />
      <DeskBackLink href="/scas/verification" label={t("queueTitle")} />
      <ActionError show={Boolean(query.error)} />

      <div className="flex min-w-0 flex-col gap-8 overflow-x-hidden lg:grid lg:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)_minmax(14rem,18rem)]">
        <aside className="order-2 min-w-0 lg:order-1">
          <p className="label-caps text-harvest">{t("declaredHeading")}</p>
          <div className="mt-4">
            <DataList
              items={[
                { label: t("producer"), value: producerName },
                { label: t("cadastre"), value: field.declared.cadastreNumber },
                { label: t("crop"), value: lookupMessage(tCatalog, `crops.${field.declared.crop}`) },
                { label: t("season"), value: String(field.declared.season) },
                {
                  label: t("declaredArea"),
                  value:
                    field.declared.declaredAreaHa != null
                      ? tUnits("hectaresShort", {
                          value: formatNumber(field.declared.declaredAreaHa, locale, 1),
                        })
                      : "—",
                },
                { label: t("verificationStatus"), value: <StatusBadge value={verificationCase.status} /> },
              ]}
            />
          </div>
          <p className="mt-8 label-caps text-harvest">{t("documents")}</p>
          <ul className="mt-3 divide-y divide-harvest/15 border-y border-harvest/20">
            {currentDocs.map((document) => (
              <li key={document.id} className="py-3">
                <p className="text-sm text-bone">{t(document.documentType)}</p>
                <p className="font-tabular text-xs text-straw">
                  {document.originalFilename} · v{document.version}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge value={document.status} />
                  {closed ? null : (
                    <>
                      <form action={acceptDocumentAction}>
                        <input type="hidden" name="caseId" value={verificationCase.publicId} />
                        <input type="hidden" name="documentId" value={document.id} />
                        <FormSubmitButton size="xs" variant="ghost" pendingLabel={t("accept")}>
                          {t("accept")}
                        </FormSubmitButton>
                      </form>
                      <form action={requestReplacementAction} className="grid gap-2">
                        <input type="hidden" name="caseId" value={verificationCase.publicId} />
                        <input type="hidden" name="documentId" value={document.id} />
                        <input
                          name="comment"
                          required
                          placeholder={t("replacementComment")}
                          className="desk-control h-8 w-full min-w-[12rem]"
                        />
                        <FormSubmitButton size="xs" variant="ghost" pendingLabel={t("requestReplacement")}>
                          {t("requestReplacement")}
                        </FormSubmitButton>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <section className="order-1 min-w-0 lg:order-2">
          <EvidenceViewer items={viewerItems} />
        </section>

        <aside className="order-3 min-w-0">
          {closed ? null : (
            <form action={assignReviewerAction} className="mb-8 grid gap-2">
              <span className="label-caps">{t("assign")}</span>
              <input
                name="reviewerUserId"
                defaultValue={verificationCase.assignedReviewerUserId ?? actor.principal.userId}
                className="desk-control h-8 w-full font-tabular"
              />
              <input type="hidden" name="caseId" value={verificationCase.publicId} />
              <FormSubmitButton size="xs" pendingLabel={t("assign")}>
                {t("assign")}
              </FormSubmitButton>
            </form>
          )}

          <p className="label-caps text-harvest">{t("cadastreForm")}</p>
          <p className="mt-2 text-xs text-straw">{t("providerManual")}</p>
          {closed ? null : (
          <form action={recordCadastreAction} className="mt-4 grid gap-3">
            <input type="hidden" name="caseId" value={verificationCase.publicId} />
            <input
              name="cadastreNumber"
              defaultValue={cadastre?.cadastreNumber ?? field.declared.cadastreNumber}
              className="desk-control h-8 w-full font-tabular"
            />
            <input
              name="rightHolder"
              required
              placeholder={t("rightHolder")}
              defaultValue={cadastre?.rightHolder ?? ""}
              className="desk-control h-8 w-full"
            />
            <input
              name="rightType"
              required
              placeholder={t("rightType")}
              defaultValue={cadastre?.rightType ?? ""}
              className="desk-control h-8 w-full"
            />
            <input
              name="registeredAreaHa"
              placeholder={t("verifiedArea")}
              defaultValue={cadastre?.registeredAreaHa ?? ""}
              className="desk-control h-8 w-full font-tabular"
            />
            <input name="region" defaultValue={cadastre?.region ?? field.declared.region ?? ""} className="desk-control h-8 w-full" />
            <input name="district" defaultValue={cadastre?.district ?? field.declared.district ?? ""} className="desk-control h-8 w-full" />
            <input
              name="validityStatus"
              required
              placeholder={t("validity")}
              defaultValue={cadastre?.validityStatus ?? ""}
              className="desk-control h-8 w-full"
            />
            <input
              name="sourceReference"
              placeholder={t("source")}
              defaultValue={cadastre?.sourceReference ?? ""}
              className="desk-control h-8 w-full"
            />
            <textarea name="notes" defaultValue={cadastre?.notes ?? ""} className="desk-control min-h-[4rem] w-full py-2" />
            <FormSubmitButton pendingLabel={t("recordCadastre")}>{t("recordCadastre")}</FormSubmitButton>
          </form>
          )}

          {cadastre && field.declared.declaredAreaHa != null && cadastre.registeredAreaHa != null ? (
            <p className="mt-4 font-tabular text-sm text-straw">
              {t("declaredArea")}:{" "}
              {tUnits("hectaresShort", {
                value: formatNumber(field.declared.declaredAreaHa, locale, 1),
              })}
              <br />
              {t("verifiedArea")}:{" "}
              {tUnits("hectaresShort", {
                value: formatNumber(cadastre.registeredAreaHa, locale, 1),
              })}
            </p>
          ) : null}

          <p className="mt-10 label-caps text-harvest">{t("evidence")}</p>
          {closed ? null : (
          <form action={addEvidenceAction} className="mt-4 grid gap-3">
            <input type="hidden" name="caseId" value={verificationCase.publicId} />
            <select name="kind" className="desk-control h-8 w-full">
              <option value="CADASTRAL">{t("CADASTRAL")}</option>
              <option value="SATELLITE_IMAGERY">{t("SATELLITE_IMAGERY")}</option>
              <option value="REVIEWER_NOTE">{t("REVIEWER_NOTE")}</option>
              <option value="OTHER">{t("OTHER")}</option>
            </select>
            <input name="imageryDate" type="date" className="desk-control h-8 w-full" />
            <textarea name="notes" className="desk-control min-h-[4rem] w-full py-2" />
            <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" className="desk-control h-10 w-full text-xs" />
            <FormSubmitButton pendingLabel={t("addEvidence")}>{t("addEvidence")}</FormSubmitButton>
          </form>
          )}

          <p className="mt-10 label-caps text-harvest">{t("conversation")}</p>
          <ul className="mt-3 max-h-64 overflow-auto divide-y divide-harvest/15 border-y border-harvest/20">
            {messages.map((message) => (
              <li key={message.id} className="py-3">
                <p className="label-caps text-straw">
                  {message.senderRole} · {formatTimestamp(message.createdAt, locale)}
                </p>
                <p className="mt-1 text-sm text-bone">{message.body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            {closed ? null : (
              <MessageForm action={sendCaseMessageAction} caseId={verificationCase.publicId} />
            )}
          </div>

          {verified ? (
            <div className="mt-10 grid gap-4">
              <p className="text-sm text-straw">{t("dacOpenDraftLead")}</p>
              {dac ? (
                <Link href={`/scas/dacs/${dac.publicId}`} className="label-caps text-harvest">
                  {t("dacOpenExisting")} · {dac.publicId}
                </Link>
              ) : (
                <form action={createDacAction}>
                  <input type="hidden" name="caseId" value={verificationCase.publicId} />
                  <FormSubmitButton pendingLabel={t("dacCreate")}>{t("dacCreate")}</FormSubmitButton>
                </form>
              )}
            </div>
          ) : closed ? null : (
          <div className="mt-10 grid gap-6">
            <form action={requestChangesAction} className="grid gap-2">
              <input type="hidden" name="caseId" value={verificationCase.publicId} />
              <textarea name="explanation" required placeholder={t("explanation")} className="desk-control min-h-[4rem] w-full py-2" />
              <FormSubmitButton variant="outline" pendingLabel={t("requestChanges")}>
                {t("requestChanges")}
              </FormSubmitButton>
            </form>
            <form action={rejectFieldAction} className="grid gap-2">
              <input type="hidden" name="caseId" value={verificationCase.publicId} />
              <textarea name="reason" required placeholder={t("reason")} className="desk-control min-h-[4rem] w-full py-2" />
              <FormSubmitButton variant="destructive" pendingLabel={t("reject")}>
                {t("reject")}
              </FormSubmitButton>
            </form>
            <form action={approveFieldAction}>
              <input type="hidden" name="caseId" value={verificationCase.publicId} />
              <FormSubmitButton pendingLabel={t("approve")}>{t("approve")}</FormSubmitButton>
            </form>
          </div>
          )}
          {latestSubmission ? (
            <p className="mt-4 font-tabular text-xs text-straw">
              {t("submitted")}: {formatTimestamp(latestSubmission.submittedAt, locale)}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

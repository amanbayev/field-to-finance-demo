import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { DeskFigure, DeskBackLink } from "@/components/surface/desk-stage";
import { DataList } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { DocumentPanel, MessageForm, ActionError } from "@/components/origination/document-panel";
import type { AppLocale } from "@/i18n/config";
import { formatNumber, formatTimestamp } from "@/lib/format";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import { OriginationError, allowsProducerDacConfirm, producerDacTimelineKey, producerNextActionMessageKey } from "@/domain/origination";
import { lookupMessage } from "@/i18n/t-dynamic";
import {
  demonstratorContractPath,
  isDemonstratorContractId,
} from "@/lib/origination/paths";
import {
  confirmDacTermsAction,
  resubmitFieldAction,
  returnDacTermsAction,
  sendFieldMessageAction,
  submitFieldAction,
  updateFieldAction,
} from "@/app/fields/actions";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { DacPartiesPanel, DacStageLegend } from "@/components/origination/dac-parties";
import { organizationById } from "@/data/identity/demo-catalog";
import { shortenTermsHash } from "@/domain/origination/terms";

export const dynamic = "force-dynamic";

const TABS = ["overview", "documents", "verification", "monitoring", "contracts", "audit"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ fieldId: string }>;
}): Promise<Metadata> {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const { fieldId } = await params;
  if (isDemonstratorContractId(fieldId)) {
    redirect(demonstratorContractPath(fieldId));
  }
  try {
    const bundle = await originationService().getFieldBundle(actor, fieldId);
    return { title: bundle.field.publicId };
  } catch {
    const t = await getTranslations("workspace");
    return { title: t("fieldsTitle") };
  }
}

export default async function FieldDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ fieldId: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const { fieldId } = await params;
  const query = await searchParams;

  if (isDemonstratorContractId(fieldId)) {
    redirect(demonstratorContractPath(fieldId));
  }

  let bundle;
  try {
    bundle = await originationService().getFieldBundle(actor, fieldId);
  } catch (error) {
    if (error instanceof OriginationError && error.code === "not_found") {
      notFound();
    }
    throw error;
  }

  const tOrig = await getTranslations("origination");
  const tDesk = await getTranslations("desk");
  const tUnits = await getTranslations("units");
  const tCatalog = await getTranslations("catalog");
  const locale = (await getLocale()) as AppLocale;
  const { field, documents, cadastre, messages, events, verificationCase, snapshot, latestRequest, dac } = bundle;
  const tab = TABS.includes(query.tab as (typeof TABS)[number]) ? query.tab : "overview";
  const nextCopy = tOrig(producerNextActionMessageKey(field.status));
  const canEdit = field.status === "DRAFT" || field.status === "CHANGES_REQUESTED";
  const canReplace = field.status === "CHANGES_REQUESTED";

  return (
    <div>
      <PageHeader
        eyebrow={field.publicId}
        title={field.declared.name}
        description={nextCopy}
        photo="/media/hero-harvest-dusk.png"
        figure={
          <DeskFigure
            label={tOrig("verificationStatus")}
            value={<StatusBadge value={field.status} />}
            meta={[
              {
                label: tOrig("declaredArea"),
                value:
                  field.declared.declaredAreaHa != null
                    ? tUnits("hectaresShort", {
                        value: formatNumber(field.declared.declaredAreaHa, locale, 1),
                      })
                    : "—",
              },
              {
                label: tOrig("verifiedArea"),
                value:
                  cadastre?.registeredAreaHa != null
                    ? tUnits("hectaresShort", {
                        value: formatNumber(cadastre.registeredAreaHa, locale, 1),
                      })
                    : tOrig("notVerifiedYet"),
              },
            ]}
          />
        }
      />
      <DeskBackLink href="/fields" label={tDesk("backToFields")} />
      <ActionError show={Boolean(query.error)} />
      {field.status === "CHANGES_REQUESTED" && latestRequest ? (
        <p className="mb-6 max-w-2xl border-l-2 border-harvest pl-4 text-sm text-bone">
          <span className="label-caps block text-harvest">{tOrig("latestRequest")}</span>
          {latestRequest.body}
        </p>
      ) : null}
      <nav className="mb-8 flex flex-wrap gap-x-5 gap-y-2 overflow-x-auto border-b border-harvest/20 pb-3">
        {TABS.map((item) => (
          <Link
            key={item}
            href={`/fields/${field.publicId}?tab=${item}`}
            className={item === tab ? "label-caps text-harvest" : "label-caps text-straw hover:text-harvest"}
          >
            {tOrig(
              item === "overview"
                ? "tabOverview"
                : item === "documents"
                  ? "tabDocuments"
                  : item === "verification"
                    ? "tabVerification"
                    : item === "monitoring"
                      ? "tabMonitoring"
                      : item === "contracts"
                        ? "tabContracts"
                        : "tabAudit",
            )}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-10 lg:grid-cols-2">
          <PageSection title={tOrig("declaredHeading")}>
            {canEdit ? (
              <form action={updateFieldAction} className="grid gap-4">
                <input type="hidden" name="fieldId" value={field.publicId} />
                <input type="hidden" name="name" value={field.declared.name} />
                <input type="hidden" name="season" value={String(field.declared.season)} />
                <input type="hidden" name="crop" value={field.declared.crop} />
                <label className="grid gap-2">
                  <span className="label-caps">{tOrig("cadastre")}</span>
                  <input
                    name="cadastreNumber"
                    defaultValue={field.declared.cadastreNumber}
                    className="desk-control h-10 w-full font-tabular"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="label-caps">{tOrig("declaredArea")}</span>
                  <input
                    name="declaredAreaHa"
                    defaultValue={field.declared.declaredAreaHa ?? ""}
                    className="desk-control h-10 w-full font-tabular"
                  />
                </label>
                <input type="hidden" name="region" value={field.declared.region ?? ""} />
                <input type="hidden" name="district" value={field.declared.district ?? ""} />
                <FormSubmitButton pendingLabel={tOrig("saveDraft")}>{tOrig("saveDraft")}</FormSubmitButton>
              </form>
            ) : (
              <DataList
                items={[
                  { label: tOrig("fieldId"), value: field.publicId },
                  { label: tOrig("cadastre"), value: field.declared.cadastreNumber },
                  {
                    label: tOrig("crop"),
                    value: lookupMessage(tCatalog, `crops.${field.declared.crop}`),
                  },
                  { label: tOrig("season"), value: String(field.declared.season) },
                  {
                    label: tOrig("declaredArea"),
                    value:
                      field.declared.declaredAreaHa != null
                        ? tUnits("hectaresShort", {
                            value: formatNumber(field.declared.declaredAreaHa, locale, 1),
                          })
                        : "—",
                  },
                ]}
              />
            )}
          </PageSection>
          <PageSection title={tOrig("verifiedHeading")}>
            {cadastre ? (
              <DataList
                items={[
                  { label: tOrig("cadastre"), value: cadastre.cadastreNumber },
                  { label: tOrig("rightHolder"), value: cadastre.rightHolder },
                  {
                    label: tOrig("verifiedArea"),
                    value:
                      cadastre.registeredAreaHa != null
                        ? tUnits("hectaresShort", {
                            value: formatNumber(cadastre.registeredAreaHa, locale, 1),
                          })
                        : "—",
                  },
                  { label: tOrig("providerManual"), value: cadastre.providerId },
                ]}
              />
            ) : (
              <p className="text-sm text-straw">{tOrig("notVerifiedYet")}</p>
            )}
          </PageSection>
        </div>
      ) : null}

      {tab === "documents" ? (
        <DocumentPanel
          fieldId={field.publicId}
          fieldPublicId={field.publicId}
          documents={documents}
          canEdit={canEdit}
          canReplace={canReplace}
        />
      ) : null}

      {tab === "verification" ? (
        <div className="grid gap-8">
          <PageSection title={tOrig("reviewTitle")}>
            {field.status === "DRAFT" ? (
              <form action={submitFieldAction}>
                <input type="hidden" name="fieldId" value={field.publicId} />
                <FormSubmitButton pendingLabel={tOrig("submitScas")}>{tOrig("submitScas")}</FormSubmitButton>
              </form>
            ) : null}
            {field.status === "CHANGES_REQUESTED" ? (
              <form action={resubmitFieldAction}>
                <input type="hidden" name="fieldId" value={field.publicId} />
                <FormSubmitButton pendingLabel={tOrig("resubmit")}>{tOrig("resubmit")}</FormSubmitButton>
              </form>
            ) : null}
            {snapshot ? (
              <p className="mt-4 font-tabular text-sm text-straw">
                {snapshot.approvedByUserId} · {formatTimestamp(snapshot.approvedAt, locale)}
              </p>
            ) : null}
          </PageSection>
          {verificationCase ? (
            <PageSection title={tOrig("conversation")}>
              <ul className="mb-6 divide-y divide-harvest/15 border-y border-harvest/20">
                {messages.map((message) => (
                  <li key={message.id} className="py-4">
                    <p className="label-caps text-straw">
                      {message.senderRole} · {formatTimestamp(message.createdAt, locale)}
                    </p>
                    <p className="mt-2 text-sm text-bone">{message.body}</p>
                  </li>
                ))}
              </ul>
              <MessageForm
                action={sendFieldMessageAction}
                caseId={verificationCase.publicId}
                fieldId={field.publicId}
              />
            </PageSection>
          ) : null}
        </div>
      ) : null}

      {tab === "monitoring" ? (
        <EmptyState title={tOrig("tabMonitoring")} body={tOrig("monitoringSoon")} />
      ) : null}
      {tab === "contracts" ? (
        dac ? (
          <PageSection title={tOrig("tabContracts")} description={tOrig("stageLegend")}>
            <DacStageLegend />
            <div className="mt-6">
              <DacPartiesPanel dac={dac} />
            </div>
            <div className="mt-8">
              <DataList
                items={[
                  { label: tOrig("dacId"), value: dac.publicId },
                  { label: tOrig("dacDeskTitle"), value: <StatusBadge value={dac.status} /> },
                  {
                    label: tOrig("issuer"),
                    value: dac.issuerOrganizationId
                      ? (organizationById(dac.issuerOrganizationId)?.name ?? dac.issuerOrganizationId)
                      : tOrig("issuerNotSelected"),
                  },
                  { label: tOrig("crop"), value: lookupMessage(tCatalog, `crops.${dac.crop}`) },
                  { label: tOrig("harvestYear"), value: String(dac.harvestYear) },
                  {
                    label: tOrig("expectedVolume"),
                    value: dac.expectedVolumeTonnes != null ? String(dac.expectedVolumeTonnes) : "—",
                  },
                  { label: tOrig("qualityClass"), value: dac.qualityClass ?? "—" },
                  { label: tOrig("termsVersion"), value: String(dac.termsVersion) },
                  { label: tOrig("termsHash"), value: shortenTermsHash(dac.currentTermsHash) },
                ]}
              />
            </div>
            {allowsProducerDacConfirm(dac.status) ? (
              <div className="mt-8 grid gap-6">
                <form action={confirmDacTermsAction}>
                  <input type="hidden" name="dacId" value={dac.publicId} />
                  <input type="hidden" name="fieldId" value={field.publicId} />
                  <FormSubmitButton pendingLabel={tOrig("confirmTerms")}>{tOrig("confirmTerms")}</FormSubmitButton>
                  <p className="mt-2 text-xs text-straw">{tOrig("demoConfirmation")}</p>
                </form>
                <form action={returnDacTermsAction} className="grid gap-2">
                  <input type="hidden" name="dacId" value={dac.publicId} />
                  <input type="hidden" name="fieldId" value={field.publicId} />
                  <textarea
                    name="reason"
                    required
                    placeholder={tOrig("returnReason")}
                    className="desk-control min-h-[4rem] w-full py-2"
                  />
                  <FormSubmitButton variant="outline" pendingLabel={tOrig("returnForChanges")}>
                    {tOrig("returnForChanges")}
                  </FormSubmitButton>
                </form>
              </div>
            ) : null}
            <ul className="mt-8 divide-y divide-harvest/15 border-y border-harvest/20">
              {events.flatMap((event) => {
                const copyKey = producerDacTimelineKey(event.eventType);
                if (!copyKey) {
                  return [];
                }
                return [
                  <li key={event.id} className="py-4">
                    <p className="font-tabular text-xs text-straw">
                      {formatTimestamp(event.occurredAt, locale)}
                    </p>
                    <p className="mt-1 text-bone">{tOrig(copyKey)}</p>
                  </li>,
                ];
              })}
            </ul>
          </PageSection>
        ) : (
          <EmptyState
            title={tOrig("tabContracts")}
            body={field.status === "VERIFIED" ? tOrig("noDacYet") : tOrig("contractsSoon")}
          />
        )
      ) : null}
      {tab === "audit" ? (
        events.length === 0 ? (
          <EmptyState title={tOrig("tabAudit")} body={tOrig("auditEmpty")} />
        ) : (
          <ul className="divide-y divide-harvest/15 border-y border-harvest/20">
            {events.map((event) => (
              <li key={event.id} className="py-4">
                <p className="font-tabular text-xs text-straw">{formatTimestamp(event.occurredAt, locale)}</p>
                <p className="mt-1 text-bone">{event.eventType}</p>
                <p className="mt-1 text-xs text-straw">
                  {event.actorUserId} · {event.effectiveRole}
                  {event.personaId ? ` · ${event.personaId}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

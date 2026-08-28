import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageSection } from "@/components/shared/page-section";
import { MessageForm } from "@/components/origination/document-panel";
import { organizationById } from "@/data/identity/demo-catalog";
import type { OriginationService } from "@/domain/origination";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatNumber, formatTimestamp } from "@/lib/format";

type DacBundle = Awaited<ReturnType<OriginationService["getDacBundle"]>>;

const TABS = ["overview", "basis", "documents", "comments", "audit"] as const;

export async function DacDesk({
  bundle,
  basePath,
  tab,
  messageAction,
  children,
  allowComments = true,
}: {
  bundle: DacBundle;
  basePath: string;
  tab: string;
  messageAction?: (formData: FormData) => void | Promise<void>;
  children?: React.ReactNode;
  allowComments?: boolean;
}) {
  const t = await getTranslations("origination");
  const tUnits = await getTranslations("units");
  const tCatalog = await getTranslations("catalog");
  const locale = (await getLocale()) as AppLocale;
  const { dac, field, snapshot, documents, cadastre, events, messages } = bundle;
  const producerName = organizationById(dac.producerOrganizationId)?.name ?? dac.producerOrganizationId;
  const accepted = documents.filter(
    (document) => document.current && snapshot?.payload.acceptedDocumentIds.includes(document.id),
  );
  const activeTab = TABS.includes(tab as (typeof TABS)[number]) ? tab : "overview";

  return (
    <div>
      <nav className="mb-8 flex flex-wrap gap-x-5 gap-y-2 overflow-x-auto border-b border-harvest/20 pb-3">
        {TABS.map((item) => (
          <Link
            key={item}
            href={`${basePath}?tab=${item}`}
            className={item === activeTab ? "label-caps text-harvest" : "label-caps text-straw hover:text-harvest"}
          >
            {t(
              item === "overview"
                ? "tabOverview"
                : item === "basis"
                  ? "tabBasis"
                  : item === "documents"
                    ? "tabDocuments"
                    : item === "comments"
                      ? "tabComments"
                      : "tabAudit",
            )}
          </Link>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-10 lg:grid lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <aside>
          <p className="label-caps text-harvest">{t("dacBasis")}</p>
          <div className="mt-4">
            <DataList
              items={[
                { label: t("producer"), value: producerName },
                { label: t("issuer"), value: organizationById(dac.issuerOrganizationId ?? "")?.name ?? t("issuerNotSelected") },
                { label: t("fieldId"), value: field.publicId },
                { label: t("cadastre"), value: dac.cadastreNumber },
                { label: t("landRightHolder"), value: dac.landRightHolder },
                { label: t("landRightType"), value: dac.landRightType },
                {
                  label: t("declaredArea"),
                  value:
                    dac.declaredAreaHectares != null
                      ? tUnits("hectaresShort", {
                          value: formatNumber(dac.declaredAreaHectares, locale, 1),
                        })
                      : "—",
                },
                {
                  label: t("verifiedArea"),
                  value:
                    dac.verifiedAreaHectares != null
                      ? tUnits("hectaresShort", {
                          value: formatNumber(dac.verifiedAreaHectares, locale, 1),
                        })
                      : "—",
                },
                { label: t("region"), value: dac.region ?? "—" },
                { label: t("district"), value: dac.district ?? "—" },
                { label: t("verificationStatus"), value: <StatusBadge value={field.status} /> },
              ]}
            />
          </div>
          <p className="mt-8 label-caps text-harvest">{t("documents")}</p>
          <ul className="mt-3 divide-y divide-harvest/15 border-y border-harvest/20">
            {accepted.map((document) => (
              <li key={document.id} className="py-3">
                <p className="text-sm text-bone">{t(document.documentType)}</p>
                <p className="mt-1 font-tabular text-xs text-straw">
                  {document.originalFilename} · v{document.version}
                </p>
                <a
                  className="mt-2 inline-block text-sm text-harvest"
                  href={`/api/origination/file?bucket=${encodeURIComponent(document.bucket)}&path=${encodeURIComponent(document.objectPath)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("preview")}
                </a>
              </li>
            ))}
          </ul>
          {cadastre ? (
            <p className="mt-6 text-xs text-straw">
              {t("providerManual")}
              {cadastre.sourceReference ? ` · ${cadastre.sourceReference}` : ""}
            </p>
          ) : null}
        </aside>
        <div className="min-w-0">
          {activeTab === "overview" ? children : null}
          {activeTab === "basis" ? (
            <PageSection title={t("verifiedHeading")}>
              <p className="text-sm text-straw">{t("dacNotAToken")}</p>
              <div className="mt-4">
                <DataList
                  items={[
                    { label: t("crop"), value: lookupMessage(tCatalog, `crops.${dac.crop}`) },
                    { label: t("harvestYear"), value: String(dac.harvestYear) },
                    { label: t("cadastre"), value: dac.cadastreNumber },
                    { label: t("landRightHolder"), value: dac.landRightHolder },
                  ]}
                />
              </div>
            </PageSection>
          ) : null}
          {activeTab === "documents" ? (
            <PageSection title={t("documents")}>
              {accepted.length === 0 ? (
                <p className="text-sm text-straw">{t("noDocument")}</p>
              ) : (
                <ul className="divide-y divide-harvest/15 border-y border-harvest/20">
                  {accepted.map((document) => (
                    <li key={document.id} className="py-4">
                      <p className="text-bone">{document.originalFilename}</p>
                      <p className="mt-1 font-tabular text-xs text-straw">
                        {t(document.documentType)} · sha256 {document.sha256.slice(0, 12)}…
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </PageSection>
          ) : null}
          {activeTab === "comments" ? (
            <PageSection title={t("tabComments")}>
              {messages.length === 0 ? (
                <p className="text-sm text-straw">{t("auditEmpty")}</p>
              ) : (
                <ul className="divide-y divide-harvest/15 border-y border-harvest/20">
                  {messages.map((message) => (
                    <li key={message.id} className="py-4">
                      <p className="font-tabular text-xs text-straw">
                        {formatTimestamp(message.createdAt, locale)} · {message.senderRole}
                      </p>
                      <p className="mt-2 text-sm text-bone">{message.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {allowComments && messageAction ? (
                <div className="mt-6">
                  <MessageForm action={messageAction} dacId={dac.publicId} />
                </div>
              ) : null}
            </PageSection>
          ) : null}
          {activeTab === "audit" ? (
            events.length === 0 ? (
              <p className="text-sm text-straw">{t("auditEmpty")}</p>
            ) : (
              <ul className="divide-y divide-harvest/15 border-y border-harvest/20">
                {events.map((event) => (
                  <li key={event.id} className="py-4">
                    <p className="font-tabular text-xs text-straw">
                      {formatTimestamp(event.occurredAt, locale)}
                    </p>
                    <p className="mt-1 text-bone">{event.eventType}</p>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

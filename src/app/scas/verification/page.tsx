import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure, DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { formatNumber, formatTimestamp } from "@/lib/format";
import { requireScasVerifier } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import { OriginationError, SCAS_CASE_FILTERS, type FieldVerificationCaseRecord, type ScasCaseFilter } from "@/domain/origination";
import { organizationById } from "@/data/identity/demo-catalog";
import { lookupMessage } from "@/i18n/t-dynamic";
import { stageMediaForRole } from "@/lib/surface/role-media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("origination");
  return { title: t("queueTitle") };
}

export default async function ScasVerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const actor = await requireScasVerifier();
  const t = await getTranslations("origination");
  const tDesk = await getTranslations("desk");
  const tCatalog = await getTranslations("catalog");
  const locale = (await getLocale()) as AppLocale;
  const params = await searchParams;
  const filter = SCAS_CASE_FILTERS.includes(params.filter as ScasCaseFilter)
    ? (params.filter as ScasCaseFilter)
    : "all";
  let cases: FieldVerificationCaseRecord[] = [];
  try {
    cases = await originationService().listVerificationQueue(actor, filter);
  } catch (error) {
    if (error instanceof OriginationError && error.code === "storage") {
      cases = [];
    } else {
      throw error;
    }
  }
  const media = stageMediaForRole("SCAS_OPERATOR");

  const rows = await Promise.all(
    cases.map(async (item) => {
      const bundle = await originationService().getCaseBundle(actor, item.id);
      return { item, bundle };
    }),
  );

  return (
    <div>
      <PageHeader
        eyebrow="SCAS"
        title={t("queueTitle")}
        description={t("queueLead")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        figure={
          <DeskFigure
            label={t("scasNew")}
            value={formatNumber(rows.filter((row) => row.item.status === "NEW").length, locale)}
          />
        }
      />
      <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-2 overflow-x-auto" aria-label={tDesk("filterRibbon")}>
        {SCAS_CASE_FILTERS.map((item) => (
          <Link
            key={item}
            href={item === "all" ? "/scas/verification" : `/scas/verification?filter=${item}`}
            className={item === filter ? "label-caps text-harvest" : "label-caps text-straw hover:text-harvest"}
          >
            {t(
              item === "all"
                ? "filterAll"
                : item === "new"
                  ? "scasNew"
                  : item === "under_review"
                    ? "scasUnder"
                    : item === "changes_requested"
                      ? "scasChanges"
                      : item === "resubmitted"
                        ? "scasResubmitted"
                        : item === "verified"
                          ? "scasVerified"
                          : "scasRejected",
            )}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title={t("queueTitle")} body={t("queueLead")} />
      ) : (
        <DeskLedger>
          {rows.map((row, index) => (
            <DeskRow
              key={row.item.id}
              href={`/scas/verification/${row.item.publicId}`}
              index={deskIndex(index)}
              kicker={row.bundle.field.publicId}
              title={row.bundle.field.declared.cadastreNumber}
              hint={`${organizationById(row.item.organizationId)?.name ?? "—"} · ${lookupMessage(tCatalog, `crops.${row.bundle.field.declared.crop}`)} · ${row.bundle.field.declared.season} · ${row.bundle.submissions.at(-1) ? formatTimestamp(row.bundle.submissions.at(-1)!.submittedAt, locale) : ""}`}
              value={
                <span className="flex flex-col items-end gap-1">
                  <StatusBadge value={row.item.status} />
                  <span className="text-xs text-straw">
                    {row.item.assignedReviewerUserId ?? t("unassigned")}
                  </span>
                </span>
              }
            />
          ))}
        </DeskLedger>
      )}
    </div>
  );
}

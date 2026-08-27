import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure, DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/format";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import {
  PRODUCER_FIELD_FILTERS,
  producerNextActionMessageKey,
  type ProducerFieldFilter,
} from "@/domain/origination";
import { lookupMessage } from "@/i18n/t-dynamic";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  return { title: t("fieldsTitle") };
}

export default async function FieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const actor = await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("workspace");
  const tOrig = await getTranslations("origination");
  const tDesk = await getTranslations("desk");
  const tUnits = await getTranslations("units");
  const tCatalog = await getTranslations("catalog");
  const locale = (await getLocale()) as AppLocale;
  const params = await searchParams;
  const filter = PRODUCER_FIELD_FILTERS.includes(params.filter as ProducerFieldFilter)
    ? (params.filter as ProducerFieldFilter)
    : "all";
  const fields = await originationService().listProducerFields(actor, filter);
  const hectares = fields.reduce((sum, field) => sum + (field.declared.declaredAreaHa ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow={t("fieldsEyebrow")}
        title={t("fieldsTitle")}
        description={t("fieldsIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          fields.length ? (
            <DeskFigure
              label={tOrig("filterAll")}
              value={formatNumber(fields.length, locale)}
              meta={[
                {
                  label: t("area"),
                  value: tUnits("hectaresShort", {
                    value: formatNumber(hectares, locale, 1),
                  }),
                },
              ]}
            />
          ) : undefined
        }
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <nav className="flex min-w-0 flex-wrap gap-x-5 gap-y-2 overflow-x-auto" aria-label={tDesk("filterRibbon")}>
          {PRODUCER_FIELD_FILTERS.map((item) => (
            <Link
              key={item}
              href={item === "all" ? "/fields" : `/fields?filter=${item}`}
              className={item === filter ? "label-caps text-harvest" : "label-caps text-straw hover:text-harvest"}
            >
              {tOrig(
                item === "all"
                  ? "filterAll"
                  : item === "draft"
                    ? "filterDraft"
                    : item === "under_verification"
                      ? "filterUnder"
                      : item === "requires_attention"
                        ? "filterAttention"
                        : item === "verified"
                          ? "filterVerified"
                          : "filterArchived",
              )}
            </Link>
          ))}
        </nav>
        <Link href="/fields/new" className={cn(buttonVariants())}>
          {tOrig("addField")}
        </Link>
      </div>
      {fields.length === 0 ? (
        <EmptyState
          kicker={t("fieldsEyebrow")}
          title={tDesk("noFieldsTitle")}
          body={tDesk("noFieldsBody")}
          action={
            <Link href="/fields/new" className={cn(buttonVariants())}>
              {tOrig("addField")}
            </Link>
          }
        />
      ) : (
        <DeskLedger>
          {fields.map((field, index) => (
            <DeskRow
              key={field.id}
              href={`/fields/${field.publicId}`}
              index={deskIndex(index)}
              kicker={field.publicId}
              title={field.declared.name}
              hint={`${field.declared.cadastreNumber} · ${lookupMessage(tCatalog, `crops.${field.declared.crop}`)} · ${field.declared.season} · ${tOrig(producerNextActionMessageKey(field.status))}`}
              value={
                <span className="flex flex-col items-end gap-1">
                  <StatusBadge value={field.status} />
                  <span className="font-tabular text-sm text-harvest">
                    {field.declared.declaredAreaHa != null
                      ? tUnits("hectaresShort", {
                          value: formatNumber(field.declared.declaredAreaHa, locale, 1),
                        })
                      : "—"}
                  </span>
                </span>
              }
            />
          ))}
        </DeskLedger>
      )}
      <p className="mt-6 text-sm text-straw">{tOrig("onboardingHint")}</p>
    </div>
  );
}

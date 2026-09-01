import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { DeskFigure, DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { F2F_PROTOCOL_ID } from "@/data/market-core/catalog";
import { formatNumber } from "@/lib/format";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { protocolModuleTrail } from "@/lib/market-core/hierarchy";
import { protocolModuleTrailAccess } from "@/lib/navigation/policy";
import { getAssetProtocol } from "@/services/market-core-service";
import { originationService } from "@/services/origination-service";
import {
  PRODUCER_FIELD_FILTERS,
  producerNextActionMessageKey,
  OriginationError,
  type ProducerFieldFilter,
  type ProducerFieldRecord,
} from "@/domain/origination";
import { lookupMessage } from "@/i18n/t-dynamic";
import { buttonVariants } from "@/components/ui/button";
import { originationFieldPath } from "@/lib/origination/paths";
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
  let fields: ProducerFieldRecord[] = [];
  let storageDown = false;
  try {
    fields = await originationService().listProducerFields(actor, filter);
  } catch (error) {
    if (error instanceof OriginationError && error.code === "storage") {
      fields = [];
      storageDown = true;
    } else {
      throw error;
    }
  }
  const hectares = fields.reduce((sum, field) => sum + (field.declared.declaredAreaHa ?? 0), 0);
  const f2fProtocol = getAssetProtocol(F2F_PROTOCOL_ID) ?? null;
  const tNav = await getTranslations("nav");
  const tCoreNav = await getTranslations("marketCore");

  return (
    <div>
      <MarketCoreContextHeader
        level="PROTOCOL"
        trail={protocolModuleTrail(
          f2fProtocol,
          tNav("myFields"),
          protocolModuleTrailAccess(actor),
        )}
        translate={tCoreNav}
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
          title={storageDown ? tOrig("storageUnavailable") : tDesk("noFieldsTitle")}
          body={storageDown ? tOrig("storageUnavailable") : tDesk("noFieldsBody")}
          action={
            storageDown ? undefined : (
              <Link href="/fields/new" className={cn(buttonVariants())}>
                {tOrig("addField")}
              </Link>
            )
          }
        />
      ) : (
        <DeskLedger>
          {fields.map((field, index) => (
            <DeskRow
              key={field.id}
              href={originationFieldPath(field.publicId)}
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

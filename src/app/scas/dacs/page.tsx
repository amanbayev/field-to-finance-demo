import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure, DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/format";
import { requireScasVerifier } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import {
  OriginationError,
  SCAS_DAC_FILTERS,
  type OriginationDacRecord,
  type ScasDacFilter,
} from "@/domain/origination";
import { organizationById } from "@/data/identity/demo-catalog";
import { lookupMessage } from "@/i18n/t-dynamic";
import { stageMediaForRole } from "@/lib/surface/role-media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("origination");
  return { title: t("dacQueueTitle") };
}

export default async function ScasDacQueuePage({
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
  const filter = SCAS_DAC_FILTERS.includes(params.filter as ScasDacFilter)
    ? (params.filter as ScasDacFilter)
    : "all";
  let dacs: OriginationDacRecord[] = [];
  let storageDown = false;
  try {
    dacs = await originationService().listScasDacs(actor, filter);
  } catch (error) {
    if (error instanceof OriginationError && error.code === "storage") {
      storageDown = true;
    } else {
      throw error;
    }
  }
  const media = stageMediaForRole("SCAS_OPERATOR");
  const filterLabel = (item: ScasDacFilter) => {
    if (item === "all") return t("filterAll");
    if (item === "draft") return t("filterDraft");
    if (item === "ready") return t("dacFilterReady");
    if (item === "under_review") return t("scasUnder");
    if (item === "returned") return t("dacFilterReturned");
    if (item === "accepted") return t("dacFilterAccepted");
    return t("filterArchived");
  };

  return (
    <div>
      <PageHeader
        eyebrow="SCAS"
        title={t("dacQueueTitle")}
        description={t("dacQueueLead")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        figure={
          storageDown ? undefined : (
            <DeskFigure
              label={t("filterAll")}
              value={formatNumber(dacs.length, locale)}
            />
          )
        }
      />
      <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-2 overflow-x-auto" aria-label={tDesk("filterRibbon")}>
        {SCAS_DAC_FILTERS.map((item) => (
          <Link
            key={item}
            href={item === "all" ? "/scas/dacs" : `/scas/dacs?filter=${item}`}
            className={item === filter ? "label-caps text-harvest" : "label-caps text-straw hover:text-harvest"}
          >
            {filterLabel(item)}
          </Link>
        ))}
      </nav>
      {dacs.length === 0 ? (
        <EmptyState
          title={storageDown ? t("queueStorageTitle") : t("dacEmptyTitle")}
          body={storageDown ? t("queueStorageBody") : t("dacEmptyBody")}
        />
      ) : (
        <DeskLedger>
          {dacs.map((dac, index) => (
            <DeskRow
              key={dac.id}
              href={`/scas/dacs/${dac.publicId}`}
              index={deskIndex(index)}
              kicker={dac.publicId}
              title={organizationById(dac.producerOrganizationId)?.name ?? dac.producerOrganizationId}
              hint={`${lookupMessage(tCatalog, `crops.${dac.crop}`)} · ${dac.harvestYear} · ${dac.cadastreNumber}`}
              value={<StatusBadge value={dac.status} />}
            />
          ))}
        </DeskLedger>
      )}
    </div>
  );
}

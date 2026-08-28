import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure, DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/format";
import { requireIssuerOperator } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import {
  OriginationError,
  ISSUER_DAC_FILTERS,
  type OriginationDacRecord,
  type IssuerDacFilter,
} from "@/domain/origination";
import { organizationLabels } from "@/components/origination/dac-parties";
import { lookupMessage } from "@/i18n/t-dynamic";
import { stageMediaForRole } from "@/lib/surface/role-media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("origination");
  return { title: t("issuerQueueTitle") };
}

export default async function IssuerDacQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const actor = await requireIssuerOperator();
  const t = await getTranslations("origination");
  const tDesk = await getTranslations("desk");
  const tCatalog = await getTranslations("catalog");
  const locale = (await getLocale()) as AppLocale;
  const params = await searchParams;
  const filter = ISSUER_DAC_FILTERS.includes(params.filter as IssuerDacFilter)
    ? (params.filter as IssuerDacFilter)
    : "all";
  let dacs: OriginationDacRecord[] = [];
  let storageDown = false;
  try {
    dacs = await originationService().listIssuerDacs(actor, filter);
  } catch (error) {
    if (error instanceof OriginationError && error.code === "storage") {
      storageDown = true;
    } else {
      throw error;
    }
  }
  const producerNames = await organizationLabels(dacs.map((dac) => dac.producerOrganizationId));
  const media = stageMediaForRole("ISSUER_OPERATOR");
  const filterLabel = (item: IssuerDacFilter) => {
    if (item === "all") return t("filterAll");
    if (item === "pending") return t("dacFilterPending");
    if (item === "executed") return t("dacFilterExecuted");
    return t("dacFilterReady");
  };

  return (
    <div>
      <PageHeader
        eyebrow={tDesk("issuerTitle")}
        title={t("issuerQueueTitle")}
        description={t("issuerQueueLead")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        figure={
          storageDown ? undefined : (
            <DeskFigure label={t("filterAll")} value={formatNumber(dacs.length, locale)} />
          )
        }
      />
      <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-2 overflow-x-auto" aria-label={tDesk("filterRibbon")}>
        {ISSUER_DAC_FILTERS.map((item) => (
          <Link
            key={item}
            href={item === "all" ? "/issuer/dacs" : `/issuer/dacs?filter=${item}`}
            className={item === filter ? "label-caps text-harvest" : "label-caps text-straw hover:text-harvest"}
          >
            {filterLabel(item)}
          </Link>
        ))}
      </nav>
      {dacs.length === 0 ? (
        <EmptyState
          title={storageDown ? t("queueStorageTitle") : t("issuerEmptyTitle")}
          body={storageDown ? t("queueStorageBody") : t("issuerEmptyBody")}
        />
      ) : (
        <DeskLedger>
          {dacs.map((dac, index) => (
            <DeskRow
              key={dac.id}
              href={`/issuer/dacs/${dac.publicId}`}
              index={deskIndex(index)}
              kicker={dac.publicId}
              title={producerNames[dac.producerOrganizationId] ?? dac.producerOrganizationId}
              hint={`${lookupMessage(tCatalog, `crops.${dac.crop}`)} · ${dac.harvestYear} · ${dac.cadastreNumber}`}
              value={<StatusBadge value={dac.status} />}
            />
          ))}
        </DeskLedger>
      )}
    </div>
  );
}

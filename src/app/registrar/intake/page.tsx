import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure, DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/format";
import { requireRegistrarIntake } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";
import {
  OriginationError,
  REGISTRAR_DAC_FILTERS,
  type OriginationDacRecord,
  type RegistrarDacFilter,
} from "@/domain/origination";
import { organizationById } from "@/data/identity/demo-catalog";
import { lookupMessage } from "@/i18n/t-dynamic";
import { stageMediaForRole } from "@/lib/surface/role-media";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("origination");
  return { title: t("intakeTitle") };
}

export default async function RegistrarIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const actor = await requireRegistrarIntake();
  const t = await getTranslations("origination");
  const tDesk = await getTranslations("desk");
  const tCatalog = await getTranslations("catalog");
  const locale = (await getLocale()) as AppLocale;
  const params = await searchParams;
  const filter = REGISTRAR_DAC_FILTERS.includes(params.filter as RegistrarDacFilter)
    ? (params.filter as RegistrarDacFilter)
    : "all";
  let dacs: OriginationDacRecord[] = [];
  let storageDown = false;
  try {
    dacs = await originationService().listRegistrarIntake(actor, filter);
  } catch (error) {
    if (error instanceof OriginationError && error.code === "storage") {
      storageDown = true;
    } else {
      throw error;
    }
  }
  const media = stageMediaForRole("REGISTRAR_OPERATOR");
  const filterLabel = (item: RegistrarDacFilter) => {
    if (item === "all") return t("filterAll");
    if (item === "ready") return t("dacFilterReady");
    if (item === "under_review") return t("scasUnder");
    if (item === "returned") return t("dacFilterReturned");
    return t("dacFilterAccepted");
  };

  return (
    <div>
      <PageHeader
        eyebrow={tDesk("registrarTitle")}
        title={t("intakeTitle")}
        description={t("intakeLead")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        figure={
          storageDown ? undefined : (
            <DeskFigure label={t("dacFilterReady")} value={formatNumber(dacs.length, locale)} />
          )
        }
      />
      <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-2 overflow-x-auto" aria-label={tDesk("filterRibbon")}>
        {REGISTRAR_DAC_FILTERS.map((item) => (
          <Link
            key={item}
            href={item === "all" ? "/registrar/intake" : `/registrar/intake?filter=${item}`}
            className={item === filter ? "label-caps text-harvest" : "label-caps text-straw hover:text-harvest"}
          >
            {filterLabel(item)}
          </Link>
        ))}
      </nav>
      {dacs.length === 0 ? (
        <EmptyState
          title={storageDown ? t("queueStorageTitle") : t("intakeEmptyTitle")}
          body={storageDown ? t("queueStorageBody") : t("intakeEmptyBody")}
        />
      ) : (
        <DeskLedger>
          {dacs.map((dac, index) => (
            <DeskRow
              key={dac.id}
              href={`/registrar/intake/${dac.publicId}`}
              index={deskIndex(index)}
              kicker={dac.publicId}
              title={organizationById(dac.producerOrganizationId)?.name ?? dac.producerOrganizationId}
              hint={`${lookupMessage(tCatalog, `crops.${dac.crop}`)} · ${dac.harvestYear}`}
              value={<StatusBadge value={dac.status} />}
            />
          ))}
        </DeskLedger>
      )}
    </div>
  );
}

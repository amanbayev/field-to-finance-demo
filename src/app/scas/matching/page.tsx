import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MatchingBoard } from "@/components/scas/matching-board";
import { PageHeader } from "@/components/shared/page-header";
import { DeskNote } from "@/components/surface/desk-stage";
import { stageMediaForRole } from "@/lib/surface/role-media";
import { getScasSnapshot } from "@/services/scas-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const tNav = await getTranslations("nav");
  return { title: tNav("matching") };
}

export default async function ScasMatchingPage() {
  await requirePermission("scas.match");
  const t = await getTranslations("scas");
  const tNav = await getTranslations("nav");
  const tDesk = await getTranslations("desk");
  const tSurface = await getTranslations("surface");
  const snapshot = getScasSnapshot();
  const media = stageMediaForRole("SCAS_OPERATOR");

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={tNav("matching")}
        description={t("matching.description")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        asOfLabel={tSurface("clockLabel")}
      />
      <DeskNote className="mb-8">{snapshot.operatorLabel}</DeskNote>
      <MatchingBoard
        initialListings={snapshot.listings}
        initialBids={snapshot.bids}
      />
    </div>
  );
}

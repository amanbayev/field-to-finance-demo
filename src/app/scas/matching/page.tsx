import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MatchingBoard } from "@/components/scas/matching-board";
import { PageHeader } from "@/components/shared/page-header";
import { getScasSnapshot } from "@/services/scas-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("scas.matching");
  return { title: t("title") };
}

export default async function ScasMatchingPage() {
  await requirePermission("scas.match");
  const t = await getTranslations("scas");
  const snapshot = getScasSnapshot();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("matching.title")}
        description={t("matching.description")}
      />
      <p className="mb-3 text-xs tracking-wide text-muted-foreground">
        {snapshot.operatorLabel}
      </p>
      <MatchingBoard
        initialListings={snapshot.listings}
        initialBids={snapshot.bids}
      />
    </div>
  );
}

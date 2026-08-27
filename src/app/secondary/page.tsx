import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure, DeskNote } from "@/components/surface/desk-stage";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("secondaryTitle") };
}

export default async function SecondaryMarketPage() {
  await requirePermission("market.read");
  const t = await getTranslations("workspace");
  const tCore = await getTranslations("marketCore");
  const tDesk = await getTranslations("desk");

  return (
    <div>
      <PageHeader
        eyebrow={t("secondaryEyebrow")}
        title={t("secondaryTitle")}
        description={tCore("marketClosed")}
        photo="/media/empty-silo-light.png"
        figure={
          <DeskFigure
            label={tCore("sectionMarket")}
            value={tCore("closedSecondary")}
          />
        }
      />
      <DeskNote className="mb-8">{tCore("clearingDistinct")}</DeskNote>
      <EmptyState
        kicker={t("secondaryEyebrow")}
        title={tDesk("secondaryClosed")}
        body={tDesk("secondaryClosedBody")}
        action={
          <Link href="/instruments" className={cn(buttonVariants())}>
            {tDesk("openInstruments")}
          </Link>
        }
      />
    </div>
  );
}

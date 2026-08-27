import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/page-section";
import { requireActor } from "@/lib/auth/load-actor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("origination");
  return { title: t("helpTitle") };
}

export default async function HelpPage() {
  await requireActor();
  const t = await getTranslations("origination");
  return (
    <div>
      <PageHeader
        eyebrow={t("helpReserved")}
        title={t("helpTitle")}
        description={t("helpLead")}
        photo="/media/empty-silo-light.png"
      />
      <EmptyState title={t("helpTitle")} body={t("helpLead")} />
    </div>
  );
}

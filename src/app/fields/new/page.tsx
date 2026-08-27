import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { DeskBackLink } from "@/components/surface/desk-stage";
import { FieldWizard } from "@/components/origination/field-wizard";
import { ActionError } from "@/components/origination/document-panel";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("origination");
  return { title: t("wizardTitle") };
}

export default async function NewFieldPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOwnProducerWorkspace({ manage: true });
  const t = await getTranslations("origination");
  const tDesk = await getTranslations("desk");
  const params = await searchParams;

  return (
    <div>
      <PageHeader
        eyebrow={t("wizardKicker")}
        title={t("wizardTitle")}
        description={t("wizardLead")}
        photo="/media/hero-harvest-dusk.png"
      />
      <DeskBackLink href="/fields" label={tDesk("backToFields")} />
      <ActionError show={Boolean(params.error)} />
      <FieldWizard />
    </div>
  );
}

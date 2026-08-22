import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ParticipantComplianceTable } from "@/components/compliance/participant-table";
import { PageHeader } from "@/components/shared/page-header";
import { listParticipantCompliance } from "@/services/compliance-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("checksTitle") };
}

export default async function ComplianceChecksPage() {
  await requirePermission("compliance.manage");
  const t = await getTranslations("workspace");
  const tCompliance = await getTranslations("compliance");
  const rows = listParticipantCompliance();

  return (
    <div>
      <PageHeader
        eyebrow={tCompliance("provider")}
        title={t("checksTitle")}
        description={t("checksIntro")}
      />
      <ParticipantComplianceTable
        rows={rows}
        columns={["kyc", "kyb", "directorKyc", "kyt", "sanctions", "wallet"]}
      />
    </div>
  );
}

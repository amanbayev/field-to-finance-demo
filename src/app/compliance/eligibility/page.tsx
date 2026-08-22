import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ParticipantComplianceTable } from "@/components/compliance/participant-table";
import { PageHeader } from "@/components/shared/page-header";
import { listParticipantCompliance } from "@/services/compliance-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("eligibilityTitle") };
}

export default async function ComplianceEligibilityPage() {
  await requirePermission("compliance.manage");
  const t = await getTranslations("workspace");
  const tCompliance = await getTranslations("compliance");
  const rows = listParticipantCompliance();

  return (
    <div>
      <PageHeader
        eyebrow={tCompliance("provider")}
        title={t("eligibilityTitle")}
        description={t("eligibilityIntro")}
      />
      <ParticipantComplianceTable rows={rows} columns={["type", "eligibility"]} />
    </div>
  );
}

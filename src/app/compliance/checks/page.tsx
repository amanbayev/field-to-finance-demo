import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ParticipantComplianceTable } from "@/components/compliance/participant-table";
import { PageHeader } from "@/components/shared/page-header";
import { stageMediaForRole } from "@/lib/surface/role-media";
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
  const tDesk = await getTranslations("desk");
  const tSurface = await getTranslations("surface");
  const rows = listParticipantCompliance();
  const media = stageMediaForRole("COMPLIANCE_OFFICER");

  return (
    <div>
      <PageHeader
        eyebrow={tCompliance("provider")}
        title={t("checksTitle")}
        description={t("checksIntro")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        asOfLabel={tSurface("clockLabel")}
      />
      <ParticipantComplianceTable
        rows={rows}
        columns={["kyc", "kyb", "directorKyc", "kyt", "sanctions", "wallet"]}
      />
    </div>
  );
}

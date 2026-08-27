import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ParticipantComplianceTable } from "@/components/compliance/participant-table";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { stageMediaForRole } from "@/lib/surface/role-media";
import { listParticipantCompliance } from "@/services/compliance-service";
import { isComplianceAlert } from "@/services/workspace-view";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("alertsTitle") };
}

export default async function ComplianceAlertsPage() {
  await requirePermission("compliance.manage");
  const t = await getTranslations("workspace");
  const tCompliance = await getTranslations("compliance");
  const tDesk = await getTranslations("desk");
  const tSurface = await getTranslations("surface");
  const rows = listParticipantCompliance().filter((row) =>
    isComplianceAlert(row.record),
  );
  const media = stageMediaForRole("COMPLIANCE_OFFICER");

  return (
    <div>
      <PageHeader
        eyebrow={tCompliance("provider")}
        title={t("alertsTitle")}
        description={t("alertsIntro")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        asOfLabel={tSurface("clockLabel")}
      />
      {rows.length === 0 ? (
        <EmptyState
          kicker={t("alertsTitle")}
          title={t("alertsClearTitle")}
          body={t("alertsClearBody")}
        />
      ) : (
        <ParticipantComplianceTable
          rows={rows}
          columns={["type", "kyt", "wallet", "sanctions", "eligibility"]}
        />
      )}
    </div>
  );
}

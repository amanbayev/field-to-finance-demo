import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ParticipantComplianceTable } from "@/components/compliance/participant-table";
import { InstrumentEligibilityTable } from "@/components/market-core/instrument-eligibility-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { DeskNote } from "@/components/surface/desk-stage";
import { stageMediaForRole } from "@/lib/surface/role-media";
import { listParticipantCompliance } from "@/services/compliance-service";
import { requirePermission } from "@/lib/auth/guard";
import { listInstrumentEligibilityReadModel } from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("eligibilityTitle") };
}

export default async function ComplianceEligibilityPage() {
  await requirePermission("compliance.manage");
  const t = await getTranslations("workspace");
  const tCompliance = await getTranslations("compliance");
  const tDesk = await getTranslations("desk");
  const tSurface = await getTranslations("surface");
  const tElig = await getTranslations("eligibility");
  const rows = listParticipantCompliance();
  const matrix = listInstrumentEligibilityReadModel();
  const media = stageMediaForRole("COMPLIANCE_OFFICER");

  return (
    <div>
      <PageHeader
        eyebrow={tCompliance("provider")}
        title={t("eligibilityTitle")}
        description={t("eligibilityIntro")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        asOfLabel={tSurface("clockLabel")}
      />
      <PageSection
        title={tElig("labelComplianceScreening")}
        description={tElig("screeningNotInstrumentAuthorization")}
      >
        <ParticipantComplianceTable rows={rows} columns={["type", "eligibility"]} />
      </PageSection>
      <PageSection
        title={tElig("labelInstrumentEligibility")}
        description={tElig("screeningVersusEligibility")}
      >
        <DeskNote className="mb-4">{tElig("fixtureDisclaimer")}</DeskNote>
        <InstrumentEligibilityTable rows={matrix} />
      </PageSection>
    </div>
  );
}

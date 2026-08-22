import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ParticipantComplianceTable } from "@/components/compliance/participant-table";
import { PageHeader } from "@/components/shared/page-header";
import { actorCan } from "@/domain/identity";
import { listParticipantCompliance } from "@/services/compliance-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const actor = await requirePermission("compliance.read");
  const t = await getTranslations("workspace");
  const manage = actorCan(actor, "compliance.manage");
  const supervisor = actorCan(actor, "regulator.read");
  return {
    title: manage
      ? t("participantsComplianceTitle")
      : supervisor
        ? t("supervisorComplianceTitle")
        : t("ownComplianceTitle"),
  };
}

export default async function CompliancePage() {
  const actor = await requirePermission("compliance.read");
  const t = await getTranslations("workspace");
  const tCompliance = await getTranslations("compliance");
  const manage = actorCan(actor, "compliance.manage");
  const supervisor = actorCan(actor, "regulator.read");
  const title = manage
    ? t("participantsComplianceTitle")
    : supervisor
      ? t("supervisorComplianceTitle")
      : t("ownComplianceTitle");
  const description = manage || supervisor
    ? tCompliance("description")
    : t("ownComplianceIntro");
  const rows = listParticipantCompliance().filter((row) => {
    if (manage || supervisor) {
      return true;
    }
    return (
      row.participant.id === "inv-0001" &&
      actor.effective.investorReference === "INVESTOR-0001"
    );
  });

  return (
    <div>
      <PageHeader
        eyebrow={tCompliance("provider")}
        title={title}
        description={description}
      />
      <p className="mb-3 text-xs tracking-wide text-muted-foreground">
        {tCompliance("provider")} · {t("simulatedLabel")}
      </p>
      <ParticipantComplianceTable rows={rows} />
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InstrumentEligibilityTable } from "@/components/market-core/instrument-eligibility-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  DeskLedger,
  DeskNote,
  DeskRow,
  DeskSplit,
  deskIndex,
} from "@/components/surface/desk-stage";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import { lookupMessage } from "@/i18n/t-dynamic";
import { organizationTypeLabelKey } from "@/lib/market-core/eligibility-presentation";
import { listParticipantCompliance } from "@/services/compliance-service";
import { requirePermission } from "@/lib/auth/guard";
import { listInstrumentEligibilityReadModel } from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("participantsTitle") };
}

export default async function ParticipantsPage() {
  await requirePermission("regulator.read");
  const t = await getTranslations("workspace");
  const tElig = await getTranslations("eligibility");
  const tStatus = await getTranslations("status");
  const compliance = listParticipantCompliance();
  const matrix = listInstrumentEligibilityReadModel();

  return (
    <div>
      <PageHeader
        eyebrow={t("participantsTitle")}
        title={t("participantsTitle")}
        description={t("participantsIntro")}
        photo="/media/grain-kernel-macro.png"
      />
      <PageSection title={tElig("organizationsTitle")}>
        <DeskSplit
          compact={
            <DeskLedger>
              {DEMO_ORGANIZATIONS.map((org, index) => (
                <DeskRow
                  key={org.id}
                  index={deskIndex(index)}
                  kicker={lookupMessage(tElig, organizationTypeLabelKey(org.type))}
                  title={org.name}
                  hint={lookupMessage(tStatus, org.status)}
                />
              ))}
            </DeskLedger>
          }
          wide={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("organization")}</TableHead>
                  <TableHead>{t("orgType")}</TableHead>
                  <TableHead>{t("orgStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {DEMO_ORGANIZATIONS.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>
                      {lookupMessage(tElig, organizationTypeLabelKey(org.type))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={org.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
      </PageSection>

      <PageSection
        title={tElig("labelInstrumentEligibility")}
        description={tElig("screeningVersusEligibility")}
      >
        <DeskNote className="mb-4">{tElig("fixtureDisclaimer")}</DeskNote>
        <InstrumentEligibilityTable rows={matrix} />
      </PageSection>

      <PageSection
        title={tElig("labelComplianceScreening")}
        description={tElig("screeningNotInstrumentAuthorization")}
      >
        <DeskSplit
          compact={
            <DeskLedger>
              {compliance.map(({ participant, record }, index) => (
                <DeskRow
                  key={participant.id}
                  index={deskIndex(index)}
                  kicker={lookupMessage(tStatus, participant.type)}
                  title={participant.name}
                  hint={lookupMessage(tStatus, record.sanctions)}
                />
              ))}
            </DeskLedger>
          }
          wide={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("holder")}</TableHead>
                  <TableHead>{t("orgType")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {compliance.map(({ participant, record }) => (
                  <TableRow key={participant.id}>
                    <TableCell>{participant.name}</TableCell>
                    <TableCell>{lookupMessage(tStatus, participant.type)}</TableCell>
                    <TableCell>
                      <StatusBadge value={record.sanctions} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
      </PageSection>
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import { listParticipantCompliance } from "@/services/compliance-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("participantsTitle") };
}

export default async function ParticipantsPage() {
  await requirePermission("regulator.read");
  const t = await getTranslations("workspace");
  const compliance = listParticipantCompliance();

  return (
    <div>
      <PageHeader
        eyebrow={t("participantsTitle")}
        title={t("participantsTitle")}
        description={t("participantsIntro")}
      />
      <Table className="min-w-[44rem]">
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
              <TableCell>{org.type}</TableCell>
              <TableCell>
                <StatusBadge value={org.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <h2 className="mt-8 mb-3 text-sm font-medium">{t("participantsComplianceTitle")}</h2>
      <Table className="min-w-[36rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("holder")}</TableHead>
            <TableHead>{t("orgType")}</TableHead>
            <TableHead>{t("eligibility")}</TableHead>
            <TableHead>{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {compliance.map(({ participant, record }) => (
            <TableRow key={participant.id}>
              <TableCell>{participant.name}</TableCell>
              <TableCell>{participant.type}</TableCell>
              <TableCell>
                <StatusBadge value={record.eligibility} />
              </TableCell>
              <TableCell>
                <StatusBadge value={record.sanctions} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

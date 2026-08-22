import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupMessage } from "@/i18n/t-dynamic";
import { cn } from "@/lib/utils";
import { listParticipantCompliance } from "@/services/compliance-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("compliance");
  return { title: t("title") };
}

export default async function CompliancePage() {
  const t = await getTranslations("compliance");
  const tStatus = await getTranslations("status");
  const rows = listParticipantCompliance();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <p className="mb-3 text-xs tracking-wide text-muted-foreground">
        {t("provider")}
      </p>
      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <StickyHead>{t("columns.participant")}</StickyHead>
            <TableHead>{t("columns.type")}</TableHead>
            <TableHead>{t("columns.kyc")}</TableHead>
            <TableHead>{t("columns.kyb")}</TableHead>
            <TableHead>{t("columns.kyt")}</TableHead>
            <TableHead>{t("columns.wallet")}</TableHead>
            <TableHead>{t("columns.sanctions")}</TableHead>
            <TableHead>{t("columns.eligibility")}</TableHead>
            <TableHead>{t("columns.lastReview")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ participant, record, liveKyc, liveKyb, liveKyt }) => {
            const blocked = record.eligibility === "BLOCKED";
            return (
              <TableRow
                key={participant.id}
                className={cn(blocked && "bg-destructive/5 hover:bg-destructive/10")}
              >
                <StickyCell
                  className={cn(
                    "font-medium",
                    blocked && "bg-destructive/5 group-hover:bg-destructive/10",
                  )}
                >
                  {participant.name}
                </StickyCell>
                <TableCell>
                  {lookupMessage(tStatus, participant.type)}
                </TableCell>
                <TableCell>
                  <StatusBadge value={liveKyc} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={liveKyb} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={liveKyt} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={record.walletOwnership} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={record.sanctions} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={record.eligibility} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t("notRecorded")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

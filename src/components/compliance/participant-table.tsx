import { getTranslations } from "next-intl/server";
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
import type { ParticipantCompliance } from "@/services/compliance-service";

export type ComplianceColumn =
  | "type"
  | "kyc"
  | "kyb"
  | "directorKyc"
  | "kyt"
  | "wallet"
  | "sanctions"
  | "pep"
  | "eligibility";

const DEFAULT_COLUMNS: ComplianceColumn[] = [
  "type",
  "kyc",
  "kyb",
  "kyt",
  "wallet",
  "sanctions",
  "eligibility",
];

export async function ParticipantComplianceTable({
  rows,
  columns = DEFAULT_COLUMNS,
}: {
  rows: ParticipantCompliance[];
  columns?: ComplianceColumn[];
}) {
  const t = await getTranslations("compliance");
  const tStatus = await getTranslations("status");

  return (
    <Table className="min-w-[48rem]">
      <TableHeader>
        <TableRow>
          <StickyHead>{t("columns.participant")}</StickyHead>
          {columns.includes("type") ? (
            <TableHead>{t("columns.type")}</TableHead>
          ) : null}
          {columns.includes("kyc") ? <TableHead>{t("columns.kyc")}</TableHead> : null}
          {columns.includes("kyb") ? <TableHead>{t("columns.kyb")}</TableHead> : null}
          {columns.includes("directorKyc") ? (
            <TableHead>{t("columns.directorKyc")}</TableHead>
          ) : null}
          {columns.includes("kyt") ? <TableHead>{t("columns.kyt")}</TableHead> : null}
          {columns.includes("wallet") ? (
            <TableHead>{t("columns.wallet")}</TableHead>
          ) : null}
          {columns.includes("sanctions") ? (
            <TableHead>{t("columns.sanctions")}</TableHead>
          ) : null}
          {columns.includes("pep") ? <TableHead>{t("columns.pep")}</TableHead> : null}
          {columns.includes("eligibility") ? (
            <TableHead>{t("columns.eligibility")}</TableHead>
          ) : null}
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
              {columns.includes("type") ? (
                <TableCell>{lookupMessage(tStatus, participant.type)}</TableCell>
              ) : null}
              {columns.includes("kyc") ? (
                <TableCell>
                  <StatusBadge value={liveKyc} />
                </TableCell>
              ) : null}
              {columns.includes("kyb") ? (
                <TableCell>
                  <StatusBadge value={liveKyb} />
                </TableCell>
              ) : null}
              {columns.includes("directorKyc") ? (
                <TableCell>
                  <StatusBadge value={record.directorKyc} />
                </TableCell>
              ) : null}
              {columns.includes("kyt") ? (
                <TableCell>
                  <StatusBadge value={liveKyt} />
                </TableCell>
              ) : null}
              {columns.includes("wallet") ? (
                <TableCell>
                  <StatusBadge value={record.walletOwnership} />
                </TableCell>
              ) : null}
              {columns.includes("sanctions") ? (
                <TableCell>
                  <StatusBadge value={record.sanctions} />
                </TableCell>
              ) : null}
              {columns.includes("pep") ? (
                <TableCell>
                  <StatusBadge value={record.pep} />
                </TableCell>
              ) : null}
              {columns.includes("eligibility") ? (
                <TableCell>
                  <StatusBadge value={record.eligibility} />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

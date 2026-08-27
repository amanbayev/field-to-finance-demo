import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import {
  DeskLedger,
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
    <DeskSplit
      compact={
        <DeskLedger>
          {rows.map((row, index) => {
            const blocked = row.record.eligibility === "BLOCKED";
            const value = columns.includes("eligibility")
              ? lookupMessage(tStatus, row.record.eligibility)
              : columns.includes("kyc")
                ? lookupMessage(tStatus, row.liveKyc)
                : undefined;
            return (
              <DeskRow
                key={row.participant.id}
                index={deskIndex(index)}
                kicker={
                  columns.includes("type")
                    ? lookupMessage(tStatus, row.participant.type)
                    : undefined
                }
                title={row.participant.name}
                value={
                  value ? (
                    <span className={blocked ? "text-ember" : undefined}>{value}</span>
                  ) : undefined
                }
                hint={compactHint(t, tStatus, columns, row)}
              />
            );
          })}
        </DeskLedger>
      }
      wide={
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
              {columns.includes("pep") ? (
                <TableHead>{t("columns.pep")}</TableHead>
              ) : null}
              {columns.includes("eligibility") ? (
                <TableHead>{t("columns.eligibility")}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ participant, record, liveKyc, liveKyb, liveKyt }) => {
              const blocked = record.eligibility === "BLOCKED";
              return (
                <TableRow key={participant.id}>
                  <StickyCell className={cn("font-medium", blocked && "text-ember")}>
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
      }
    />
  );
}

function compactHint(
  t: Awaited<ReturnType<typeof getTranslations>>,
  tStatus: Awaited<ReturnType<typeof getTranslations>>,
  columns: ComplianceColumn[],
  row: ParticipantCompliance,
): string {
  const parts: string[] = [];
  if (columns.includes("kyc")) {
    parts.push(`KYC ${lookupMessage(tStatus, row.liveKyc)}`);
  }
  if (columns.includes("kyb")) {
    parts.push(`KYB ${lookupMessage(tStatus, row.liveKyb)}`);
  }
  if (columns.includes("kyt")) {
    parts.push(`KYT ${lookupMessage(tStatus, row.liveKyt)}`);
  }
  if (columns.includes("wallet")) {
    parts.push(`${t("columns.wallet")} ${lookupMessage(tStatus, row.record.walletOwnership)}`);
  }
  if (columns.includes("sanctions")) {
    parts.push(`${t("columns.sanctions")} ${lookupMessage(tStatus, row.record.sanctions)}`);
  }
  return parts.join(" · ");
}

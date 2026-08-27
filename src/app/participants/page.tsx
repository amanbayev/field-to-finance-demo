import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
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
import { DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import { lookupMessage } from "@/i18n/t-dynamic";
import { listParticipantCompliance } from "@/services/compliance-service";
import { requirePermission } from "@/lib/auth/guard";
import {
  getMarketInstrument,
  listEligibility,
  tradeDecision,
} from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("participantsTitle") };
}

function eligibilityTone(state: string): string {
  if (state === "ELIGIBLE") {
    return "ELIGIBLE";
  }
  if (state === "POLICY_PENDING") {
    return "POLICY_PENDING";
  }
  return "NOT_ASSESSED";
}

export default async function ParticipantsPage() {
  await requirePermission("regulator.read");
  const t = await getTranslations("workspace");
  const tCore = await getTranslations("marketCore");
  const compliance = listParticipantCompliance();
  const matrix = listEligibility();

  return (
    <div>
      <PageHeader
        eyebrow={t("participantsTitle")}
        title={t("participantsTitle")}
        description={t("participantsIntro")}
        photo="/media/grain-kernel-macro.png"
      />
      <DeskSplit
        compact={
          <DeskLedger>
            {DEMO_ORGANIZATIONS.map((org, index) => (
              <DeskRow
                key={org.id}
                index={deskIndex(index)}
                kicker={org.type}
                title={org.name}
                hint={org.status}
              />
            ))}
          </DeskLedger>
        }
        wide={
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
        }
      />

      <PageSection title={tCore("eligibilityMatrix")}>
        <DeskSplit
          compact={
            <DeskLedger>
              {matrix.map((row, index) => {
                const instrument = getMarketInstrument(row.instrumentId);
                const label =
                  row.instrumentId === "WATER-FUTURE"
                    ? tCore("futureWaterInstrument")
                    : (instrument?.symbol ?? row.instrumentId);
                const href = instrument ? `/instruments/${instrument.id}` : undefined;
                return (
                  <DeskRow
                    key={`${row.participantReference}-${row.instrumentId}`}
                    href={href}
                    index={deskIndex(index)}
                    kicker={row.participantName}
                    title={label}
                    hint={row.state}
                  />
                );
              })}
            </DeskLedger>
          }
          wide={
            <Table className="min-w-[44rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("holder")}</TableHead>
              <TableHead>{tCore("instrument")}</TableHead>
              <TableHead>{t("eligibility")}</TableHead>
              <TableHead>{tCore("canTrade")}</TableHead>
              <TableHead>{tCore("canReceive")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.map((row) => {
              const instrument = getMarketInstrument(row.instrumentId);
              const decision = tradeDecision(row.participantReference, row.instrumentId);
              const label =
                row.instrumentId === "WATER-FUTURE"
                  ? tCore("futureWaterInstrument")
                  : (instrument?.symbol ?? row.instrumentId);
              const href = instrument ? `/instruments/${instrument.id}` : undefined;
              return (
                <TableRow key={`${row.participantReference}-${row.instrumentId}`}>
                  <TableCell>{row.participantName}</TableCell>
                  <TableCell>
                    {href ? (
                      <Link href={href} className="text-primary hover:underline">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </TableCell>
                  <TableCell>
                    <MarketStatusChip
                      label={lookupMessage(
                        tCore,
                        row.state === "ELIGIBLE"
                          ? "eligible"
                          : row.state === "POLICY_PENDING"
                            ? "policyPending"
                            : "notAssessed",
                      )}
                      tone={eligibilityTone(row.state)}
                    />
                  </TableCell>
                  <TableCell>
                    {decision.canTrade ? tCore("true") : tCore("false")}
                  </TableCell>
                  <TableCell>
                    {decision.canReceive ? tCore("true") : tCore("false")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
          }
        />
      </PageSection>

      <PageSection title={t("participantsComplianceTitle")}>
        <DeskSplit
          compact={
            <DeskLedger>
              {compliance.map(({ participant, record }, index) => (
                <DeskRow
                  key={participant.id}
                  index={deskIndex(index)}
                  kicker={participant.type}
                  title={participant.name}
                  hint={record.sanctions}
                />
              ))}
            </DeskLedger>
          }
          wide={
            <Table className="min-w-[36rem]">
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
                    <TableCell>{participant.type}</TableCell>
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

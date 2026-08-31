import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuditTrail } from "@/components/regulator/audit-trail";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
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
import { requirePermission } from "@/lib/auth/guard";
import { loadAuditEvents } from "@/services/admin-service";
import { listLedgerEvents } from "@/services/regulator-service";
import { getSecondaryEngineState } from "@/services/secondary-market-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("auditTitle") };
}

export default async function AuditPage() {
  await requirePermission("audit.read");
  const t = await getTranslations("workspace");
  const tAdmin = await getTranslations("admin");
  const tSec = await getTranslations("secondary");
  const [applicationEvents, ledger, engine] = await Promise.all([
    loadAuditEvents(),
    listLedgerEvents(),
    getSecondaryEngineState(),
  ]);
  const chainEvents = ledger.filter(
    (event) =>
      event.source === "blockchain" || event.displayStatus === "blockchain",
  );
  const marketEvents = [...engine.events].reverse();

  return (
    <div>
      <PageHeader
        eyebrow={t("auditTitle")}
        title={t("auditTitle")}
        description={t("auditIntro")}
        photo="/media/grain-kernel-macro.png"
      />
      <PageSection
        title={t("applicationEvents")}
        description={tAdmin("auditIntro")}
      >
        {applicationEvents.length === 0 ? (
          <EmptyState
            kicker={t("applicationEvents")}
            title={t("emptyChainEvidence")}
            body={t("auditIntro")}
          />
        ) : (
          <DeskSplit
            compact={
              <DeskLedger>
                {applicationEvents.map((event, index) => (
                  <DeskRow
                    key={event.id}
                    index={deskIndex(index)}
                    kicker={event.kind}
                    title={event.event_key}
                    hint={event.created_at}
                  />
                ))}
              </DeskLedger>
            }
            wide={
              <Table className="min-w-[52rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{tAdmin("columns.time")}</TableHead>
                    <TableHead>{tAdmin("columns.kind")}</TableHead>
                    <TableHead>{tAdmin("columns.event")}</TableHead>
                    <TableHead>{tAdmin("columns.principal")}</TableHead>
                    <TableHead>{tAdmin("columns.from")}</TableHead>
                    <TableHead>{tAdmin("columns.to")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applicationEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-tabular text-xs">
                        {event.created_at}
                      </TableCell>
                      <TableCell>{event.kind}</TableCell>
                      <TableCell>{event.event_key}</TableCell>
                      <TableCell className="break-all font-mono text-[10px]">
                        {event.principal_user_id}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {event.from_persona_id ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {event.to_persona_id ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          />
        )}
      </PageSection>
      <PageSection title={tSec("marketEvents")} description={tSec("matchedNotSettled")}>
        {marketEvents.length === 0 ? (
          <EmptyState
            kicker={tSec("marketEvents")}
            title={t("emptyChainEvidence")}
            body={tSec("awaitingDevnet")}
          />
        ) : (
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{tSec("time")}</TableHead>
                <TableHead>{tSec("eventType")}</TableHead>
                <TableHead>{tSec("actor")}</TableHead>
                <TableHead>{tSec("participant")}</TableHead>
                <TableHead>{tSec("instrument")}</TableHead>
                <TableHead>{tSec("marketId")}</TableHead>
                <TableHead>{tSec("entityId")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-tabular text-xs">{event.timestamp}</TableCell>
                  <TableCell className="font-mono text-xs">{event.type}</TableCell>
                  <TableCell className="text-xs">{event.actor}</TableCell>
                  <TableCell className="text-xs">{event.participantId ?? "—"}</TableCell>
                  <TableCell className="text-xs">{event.instrumentId}</TableCell>
                  <TableCell className="font-mono text-xs">{event.marketId}</TableCell>
                  <TableCell className="font-mono text-xs">{event.entityId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>
      <PageSection title={t("blockchainEvidence")}>
        <AuditTrail events={chainEvents} />
      </PageSection>
    </div>
  );
}

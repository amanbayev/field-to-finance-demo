import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuditTrail } from "@/components/regulator/audit-trail";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
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

  return (
    <div>
      <PageHeader
        eyebrow={t("auditTitle")}
        title={t("auditTitle")}
        description={t("auditIntro")}
      />
      <PageSection
        title={t("applicationEvents")}
        description={tAdmin("auditIntro")}
      >
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
            {applicationEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  {t("emptyChainEvidence")}
                </TableCell>
              </TableRow>
            ) : (
              applicationEvents.map((event) => (
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
              ))
            )}
          </TableBody>
        </Table>
      </PageSection>
      <PageSection title={tSec("marketEvents")} description={tSec("matchedNotSettled")}>
        {engine.events.length === 0 ? (
          <EmptyState>{t("emptyChainEvidence")}</EmptyState>
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
              {[...engine.events].reverse().map((event) => (
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

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("audit") };
}

export default async function AdminAuditPage() {
  await requirePermission("audit.read");
  const t = await getTranslations("admin");
  const events = await loadAuditEvents();

  return (
    <div>
      <PageHeader title={t("audit")} description={t("auditIntro")} />
      <Table className="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.time")}</TableHead>
            <TableHead>{t("columns.kind")}</TableHead>
            <TableHead>{t("columns.event")}</TableHead>
            <TableHead>{t("columns.principal")}</TableHead>
            <TableHead>{t("columns.from")}</TableHead>
            <TableHead>{t("columns.to")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="font-tabular text-xs">{event.created_at}</TableCell>
              <TableCell>{event.kind}</TableCell>
              <TableCell>{event.event_key}</TableCell>
              <TableCell className="break-all font-mono text-[10px]">
                {event.principal_user_id}
              </TableCell>
              <TableCell className="font-mono text-xs">{event.from_persona_id ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs">{event.to_persona_id ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

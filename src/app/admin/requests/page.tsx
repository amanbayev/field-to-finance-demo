import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { loadRoleRequests } from "@/services/admin-service";
import { reviewRoleRequestAction } from "@/app/admin/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("roleRequests") };
}

export default async function AdminRequestsPage() {
  await requirePermission("admin.roles");
  const t = await getTranslations("admin");
  const requests = await loadRoleRequests();

  return (
    <div>
      <PageHeader title={t("roleRequests")} description={t("requestsIntro")} />
      <Table className="min-w-[40rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.user")}</TableHead>
            <TableHead>{t("columns.intent")}</TableHead>
            <TableHead>{t("columns.organization")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead>{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="break-all font-mono text-xs">{request.user_id}</TableCell>
              <TableCell>{request.intent}</TableCell>
              <TableCell>{request.organization_name ?? "—"}</TableCell>
              <TableCell>{request.status}</TableCell>
              <TableCell>
                {request.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <form action={reviewRoleRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <Button type="submit" size="xs">{t("approve")}</Button>
                    </form>
                    <form action={reviewRoleRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                      <Button type="submit" variant="outline" size="xs">
                        {t("reject")}
                      </Button>
                    </form>
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

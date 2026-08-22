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
import { loadAdminOrganizations } from "@/services/admin-service";
import { setOrganizationStatusAction } from "@/app/admin/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("organizations") };
}

export default async function AdminOrganizationsPage() {
  await requirePermission("admin.organizations");
  const t = await getTranslations("admin");
  const organizations = await loadAdminOrganizations();

  return (
    <div>
      <PageHeader title={t("organizations")} description={t("organizationsIntro")} />
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.organization")}</TableHead>
            <TableHead>{t("columns.type")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead>{t("columns.members")}</TableHead>
            <TableHead>{t("columns.externalRef")}</TableHead>
            <TableHead>{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((org) => (
            <TableRow key={org.id}>
              <TableCell>
                <p className="font-medium">{org.name}</p>
                <p className="text-[10px] text-muted-foreground">{org.slug}</p>
              </TableCell>
              <TableCell>{org.type}</TableCell>
              <TableCell>{org.status}</TableCell>
              <TableCell>{org.memberCount}</TableCell>
              <TableCell className="font-mono text-xs">
                {org.external_producer_ref || org.external_investor_ref || "—"}
              </TableCell>
              <TableCell>
                <form action={setOrganizationStatusAction}>
                  <input type="hidden" name="organizationId" value={org.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={org.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                  />
                  <Button variant="outline" size="xs">
                    {org.status === "ACTIVE" ? t("suspend") : t("reactivate")}
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

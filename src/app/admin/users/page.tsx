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
import { loadAdminUsers } from "@/services/admin-service";
import { assignRoleAction, setUserStatusAction } from "@/app/admin/actions";
import { PLATFORM_ROLES } from "@/domain/identity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("users") };
}

export default async function AdminUsersPage() {
  await requirePermission("admin.users");
  const t = await getTranslations("admin");
  const users = await loadAdminUsers();

  return (
    <div>
      <PageHeader title={t("users")} description={t("usersIntro")} />
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.user")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead>{t("columns.organizations")}</TableHead>
            <TableHead>{t("columns.roles")}</TableHead>
            <TableHead>{t("columns.created")}</TableHead>
            <TableHead>{t("columns.lastLogin")}</TableHead>
            <TableHead>{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.user_id}>
              <TableCell>
                <p className="font-medium">{user.display_name}</p>
                <p className="break-all font-mono text-[10px] text-muted-foreground">
                  {user.user_id}
                </p>
              </TableCell>
              <TableCell>{user.status}</TableCell>
              <TableCell>
                {user.memberships.map((membership) => membership.organizationName).join(", ") || "—"}
              </TableCell>
              <TableCell>
                {user.memberships.flatMap((membership) => membership.roles).join(", ") || "—"}
              </TableCell>
              <TableCell className="font-tabular text-xs">{user.created_at}</TableCell>
              <TableCell className="font-tabular text-xs">
                {user.last_sign_in_at ?? "—"}
              </TableCell>
              <TableCell>
                <form action={setUserStatusAction} className="flex flex-col gap-2">
                  <input type="hidden" name="userId" value={user.user_id} />
                  <input
                    type="hidden"
                    name="status"
                    value={user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                  />
                  <Button variant="outline" size="xs">
                    {user.status === "ACTIVE" ? t("suspend") : t("reactivate")}
                  </Button>
                </form>
                {user.memberships[0] ? (
                  <form action={assignRoleAction} className="mt-2 flex flex-col gap-1">
                    <input type="hidden" name="membershipId" value={user.memberships[0].id} />
                    <select name="roleId" className="h-7 rounded-sm border border-input bg-background text-xs">
                      {PLATFORM_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px]">
                      <input type="checkbox" name="confirm" />
                      {t("confirmPrivileged")}
                    </label>
                    <Button variant="outline" size="xs">
                      {t("assignRole")}
                    </Button>
                  </form>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

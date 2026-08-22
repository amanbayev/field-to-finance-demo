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
import { loadAdminOrganizations, loadAdminUsers } from "@/services/admin-service";
import {
  addMembershipAction,
  assignRoleAction,
  removeMembershipAction,
  revokeRoleAction,
  setUserStatusAction,
} from "@/app/admin/actions";
import { PLATFORM_ROLES } from "@/domain/identity";
import { lookupMessage } from "@/i18n/t-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("users") };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("admin.users");
  const t = await getTranslations("admin");
  const params = await searchParams;
  const [users, organizations] = await Promise.all([
    loadAdminUsers(),
    loadAdminOrganizations(),
  ]);

  return (
    <div>
      <PageHeader title={t("users")} description={t("usersIntro")} />
      {params.error ? (
        <p className="mb-4 text-sm text-destructive">
          {lookupMessage(t, `errors.${params.error}`)}
        </p>
      ) : null}
      <Table className="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.user")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead>{t("memberships")}</TableHead>
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
                <ul className="space-y-2">
                  {user.memberships.length === 0 ? <li>—</li> : null}
                  {user.memberships.map((membership) => (
                    <li key={membership.id} className="text-xs">
                      <p className="font-medium">
                        {membership.organizationName} ({membership.status})
                      </p>
                      <p className="text-muted-foreground">
                        {membership.roles.join(", ") || t("noRole")}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {membership.roles.map((role) => (
                          <form action={revokeRoleAction} key={role}>
                            <input type="hidden" name="membershipId" value={membership.id} />
                            <input type="hidden" name="roleId" value={role} />
                            <Button type="submit" variant="ghost" size="xs">
                              {t("revokeRole")} {role}
                            </Button>
                          </form>
                        ))}
                        <form action={removeMembershipAction}>
                          <input type="hidden" name="membershipId" value={membership.id} />
                          <Button type="submit" variant="outline" size="xs">
                            {t("removeMembership")}
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
                <form action={addMembershipAction} className="mt-3 space-y-1">
                  <input type="hidden" name="userId" value={user.user_id} />
                  <select
                    name="organizationId"
                    required
                    className="h-7 w-full rounded-sm border border-input bg-background text-xs"
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <select
                    name="roleId"
                    className="h-7 w-full rounded-sm border border-input bg-background text-xs"
                  >
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
                  <Button type="submit" variant="outline" size="xs">
                    {t("addMembership")}
                  </Button>
                </form>
                {user.memberships[0] ? (
                  <form action={assignRoleAction} className="mt-2 space-y-1">
                    <input type="hidden" name="membershipId" value={user.memberships[0].id} />
                    <select
                      name="roleId"
                      className="h-7 w-full rounded-sm border border-input bg-background text-xs"
                    >
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
                    <Button type="submit" variant="outline" size="xs">
                      {t("assignRole")}
                    </Button>
                  </form>
                ) : null}
              </TableCell>
              <TableCell className="font-tabular text-xs">{user.created_at}</TableCell>
              <TableCell className="font-tabular text-xs">
                {user.last_sign_in_at ?? "—"}
              </TableCell>
              <TableCell>
                <form action={setUserStatusAction}>
                  <input type="hidden" name="userId" value={user.user_id} />
                  <input
                    type="hidden"
                    name="status"
                    value={user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                  />
                  <Button type="submit" variant="outline" size="xs">
                    {user.status === "ACTIVE" ? t("suspend") : t("reactivate")}
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

import { Button } from "@/components/ui/button";
import {
  addMembershipAction,
  assignRoleAction,
  removeMembershipAction,
  revokeRoleAction,
} from "@/app/admin/actions";
import { PLATFORM_ROLES } from "@/domain/identity";
import { getTranslations } from "next-intl/server";
import { loadAdminOrganizations, loadAdminUsers } from "@/services/admin-service";

type AdminUser = Awaited<ReturnType<typeof loadAdminUsers>>[number];
type AdminOrganization = Awaited<ReturnType<typeof loadAdminOrganizations>>[number];

export async function MembershipManager({
  users,
  organizations,
}: {
  users: AdminUser[];
  organizations: AdminOrganization[];
}) {
  const t = await getTranslations("admin");

  return (
    <ul className="space-y-6">
      {users.map((user) => (
        <li key={user.user_id} className="border-y border-harvest/20 py-5">
          <p className="font-medium">{user.display_name}</p>
          <p className="break-all font-mono text-[10px] text-muted-foreground">
            {user.user_id}
          </p>
          <ul className="mt-3 space-y-2">
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
              <input
                type="hidden"
                name="membershipId"
                value={user.memberships[0].id}
              />
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
        </li>
      ))}
    </ul>
  );
}

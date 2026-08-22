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
import { setUserStatusAction } from "@/app/admin/actions";
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
  const tWorkspace = await getTranslations("workspace");
  const params = await searchParams;
  const users = await loadAdminUsers();

  return (
    <div>
      <PageHeader title={t("users")} description={t("usersIntro")} />
      <p className="mb-4 text-xs text-muted-foreground">{tWorkspace("membershipsMoved")}</p>
      {params.error ? (
        <p className="mb-4 text-sm text-destructive">
          {lookupMessage(t, `errors.${params.error}`)}
        </p>
      ) : null}
      <Table className="min-w-[40rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.user")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
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

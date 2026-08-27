import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  createOrganizationAction,
  setOrganizationStatusAction,
} from "@/app/admin/actions";
import { ORGANIZATION_TYPES } from "@/domain/identity";
import { lookupMessage } from "@/i18n/t-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("organizations") };
}

export default async function AdminOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("admin.organizations");
  const t = await getTranslations("admin");
  const params = await searchParams;
  const organizations = await loadAdminOrganizations();

  return (
    <div>
      <PageHeader title={t("organizations")} description={t("organizationsIntro")} />
      {params.error ? (
        <p className="mb-4 text-sm text-destructive">
          {lookupMessage(t, `errors.${params.error}`)}
        </p>
      ) : null}
      <form
        action={createOrganizationAction}
        className="mb-6 grid gap-3 border-y border-harvest/20 py-6 sm:grid-cols-2"
      >
        <p className="label-caps sm:col-span-2">{t("createOrganization")}</p>
        <div>
          <label className="label-caps mb-1 block" htmlFor="name">
            {t("columns.organization")}
          </label>
          <Input id="name" name="name" required />
        </div>
        <div>
          <label className="label-caps mb-1 block" htmlFor="type">
            {t("columns.type")}
          </label>
          <select
            id="type"
            name="type"
            className="h-8 w-full rounded-sm border border-input bg-background px-2 text-sm"
          >
            {ORGANIZATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-caps mb-1 block" htmlFor="externalProducerRef">
            {t("producerRef")}
          </label>
          <Input id="externalProducerRef" name="externalProducerRef" />
        </div>
        <div>
          <label className="label-caps mb-1 block" htmlFor="externalInvestorRef">
            {t("investorRef")}
          </label>
          <Input id="externalInvestorRef" name="externalInvestorRef" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm">{t("createOrganization")}</Button>
        </div>
      </form>
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
                  <Button type="submit" variant="outline" size="xs">
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

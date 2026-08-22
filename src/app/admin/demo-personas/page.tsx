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
import { loadDemoPersonasAdmin } from "@/services/admin-service";
import { setPersonaStatusAction } from "@/app/admin/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("demoPersonas") };
}

export default async function AdminDemoPersonasPage() {
  await requirePermission("admin.demo_personas");
  const t = await getTranslations("admin");
  const personas = await loadDemoPersonasAdmin();

  return (
    <div>
      <PageHeader title={t("demoPersonas")} description={t("personasIntro")} />
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>{t("columns.displayName")}</TableHead>
            <TableHead>{t("columns.organization")}</TableHead>
            <TableHead>{t("columns.roles")}</TableHead>
            <TableHead>{t("columns.externalRef")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead>{t("columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {personas.map((persona) => (
            <TableRow key={persona.id}>
              <TableCell className="font-mono text-xs">{persona.id}</TableCell>
              <TableCell>{persona.display_name}</TableCell>
              <TableCell>{persona.organizationName}</TableCell>
              <TableCell>{persona.role_id}</TableCell>
              <TableCell className="font-mono text-xs">
                {persona.external_producer_ref || persona.external_investor_ref || "—"}
              </TableCell>
              <TableCell>{persona.status}</TableCell>
              <TableCell>
                <form action={setPersonaStatusAction}>
                  <input type="hidden" name="personaId" value={persona.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={persona.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"}
                  />
                  <Button variant="outline" size="xs">
                    {persona.status === "ACTIVE" ? t("deactivate") : t("activate")}
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

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";
import { HarvestOverview } from "@/components/surface/harvest-overview";
import { getOptionalActor } from "@/lib/auth/load-actor";
import { getDashboardSnapshot } from "@/services/dashboard-service";

export async function generateMetadata(): Promise<Metadata> {
  const actor = await getOptionalActor().catch(() => null);
  if (actor) {
    const t = await getTranslations("nav");
    return { title: t("dashboard") };
  }
  const t = await getTranslations("surface");
  return { title: t("thesis") };
}

export default async function DashboardPage() {
  const actor = await getOptionalActor().catch(() => null);
  if (actor) {
    return <RoleDashboard actor={actor} />;
  }

  const snapshot = await getDashboardSnapshot();
  return <HarvestOverview snapshot={snapshot} />;
}

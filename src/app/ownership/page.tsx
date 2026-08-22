import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireRegistrarOrRegulator } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("registryTitle") };
}

export default async function OwnershipRedirectPage() {
  await requireRegistrarOrRegulator();
  redirect("/registry");
}

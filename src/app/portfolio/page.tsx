import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { InvestorWorkspaceView } from "@/components/market-core/investor-workspace-view";
import type { AppLocale } from "@/i18n/config";
import { requirePermission } from "@/lib/auth/guard";
import { getInvestorWorkspace } from "@/services/investor-workspace";

/**
 * Platform-level institutional investor workspace.
 *
 * Callers: App Router `/portfolio` (route-registry id `portfolio`); dashboard
 * InvestorHome links here. The production guard remains
 * `portfolio.read.own`. `getInvestorWorkspace` then fail-closes unimpersonated
 * administrators and missing participant attribution. This page does not
 * import the legacy Field-to-Finance placement read model, does not submit
 * or cancel orders, and performs no SQL or persistence.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portfolio");
  return { title: t("title") };
}

export default async function PortfolioPage() {
  const actor = await requirePermission("portfolio.read.own");
  const workspace = await getInvestorWorkspace(actor);
  if (workspace.kind === "DENIED") {
    forbidden();
  }
  const t = await getTranslations("portfolio");
  const tCore = await getTranslations("marketCore");
  const tElig = await getTranslations("eligibility");
  const locale = (await getLocale()) as AppLocale;

  return (
    <InvestorWorkspaceView
      workspace={workspace}
      locale={locale}
      translate={t}
      translateCore={tCore}
      translateEligibility={tElig}
    />
  );
}

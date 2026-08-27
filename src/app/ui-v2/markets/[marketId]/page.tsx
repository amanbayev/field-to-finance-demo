import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { MarketWorkstationScreen } from "@/components/institutional/market/workstation-screen";
import type { AppLocale } from "@/i18n/config";
import { requirePermission } from "@/lib/auth/guard";
import { loadMarketWorkstation } from "@/lib/institutional/load-market-workstation";
import { parseMarketWorkstationTab } from "@/lib/institutional/tabs";
import { listMarkets } from "@/services/market-core-service";

export const dynamicParams = false;

export function generateStaticParams() {
  return listMarkets().map((market) => ({
    marketId: market.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ marketId: string }>;
}): Promise<Metadata> {
  const { marketId } = await params;
  return { title: marketId };
}

export default async function InstitutionalMarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ marketId: string }>;
  searchParams: Promise<{ tab?: string; submitted?: string; cancelled?: string; error?: string }>;
}) {
  const { marketId } = await params;
  const query = await searchParams;
  const actor = await requirePermission("market.read");
  const model = await loadMarketWorkstation(marketId, actor);
  if (!model) {
    notFound();
  }
  const locale = (await getLocale()) as AppLocale;
  const tab = parseMarketWorkstationTab(query.tab);
  const notice = query.error
    ? "error"
    : query.submitted
      ? "submitted"
      : query.cancelled
        ? "cancelled"
        : null;

  return <MarketWorkstationScreen model={model} tab={tab} locale={locale} notice={notice} />;
}

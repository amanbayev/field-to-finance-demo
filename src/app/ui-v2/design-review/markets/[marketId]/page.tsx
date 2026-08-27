import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { MarketWorkstationScreen } from "@/components/institutional/market/workstation-screen";
import type { AppLocale } from "@/i18n/config";
import {
  assertDesignReviewEnabled,
  DESIGN_REVIEW_MARKET_ID,
} from "@/lib/institutional/design-review";
import { loadDesignReviewMarketWorkstation } from "@/lib/institutional/wheat-overview-fixture";
import {
  DESIGN_REVIEW_MARKET_WORKSTATION_BASE,
  parseMarketWorkstationTab,
} from "@/lib/institutional/tabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ marketId: string }>;
}): Promise<Metadata> {
  const { marketId } = await params;
  return { title: `${marketId} · design review` };
}

export default async function DesignReviewMarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ marketId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  assertDesignReviewEnabled();
  const { marketId } = await params;
  const { tab: tabParam } = await searchParams;
  if (marketId !== DESIGN_REVIEW_MARKET_ID) {
    notFound();
  }
  const model = await loadDesignReviewMarketWorkstation(marketId);
  if (!model) {
    notFound();
  }
  const locale = (await getLocale()) as AppLocale;
  const tab = parseMarketWorkstationTab(tabParam);

  return (
    <MarketWorkstationScreen
      model={model}
      tab={tab}
      locale={locale}
      basePath={DESIGN_REVIEW_MARKET_WORKSTATION_BASE}
      reviewMode
    />
  );
}

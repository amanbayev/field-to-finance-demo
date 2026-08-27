import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { InstrumentOverviewScreen } from "@/components/institutional/instrument/overview-screen";
import type { AppLocale } from "@/i18n/config";
import { requirePermission } from "@/lib/auth/guard";
import { loadInstrumentOverview } from "@/lib/institutional/load-overview";
import { parseInstrumentShellTab } from "@/lib/institutional/tabs";
import { listMarketInstruments } from "@/services/market-core-service";

export const dynamicParams = false;

export function generateStaticParams() {
  return listMarketInstruments().map((instrument) => ({
    instrumentId: instrument.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ instrumentId: string }>;
}): Promise<Metadata> {
  const { instrumentId } = await params;
  return { title: instrumentId };
}

export default async function InstitutionalInstrumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ instrumentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { instrumentId } = await params;
  const { tab: tabParam } = await searchParams;
  const actor = await requirePermission("issuance.read", "market.read");
  const model = await loadInstrumentOverview(instrumentId, actor);
  if (!model) {
    notFound();
  }
  const locale = (await getLocale()) as AppLocale;
  const tab = parseInstrumentShellTab(tabParam);

  return <InstrumentOverviewScreen model={model} tab={tab} locale={locale} />;
}

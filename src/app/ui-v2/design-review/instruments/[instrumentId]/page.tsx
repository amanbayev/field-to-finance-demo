import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { InstrumentOverviewScreen } from "@/components/institutional/instrument/overview-screen";
import type { AppLocale } from "@/i18n/config";
import {
  assertDesignReviewEnabled,
  DESIGN_REVIEW_INSTRUMENT_ID,
} from "@/lib/institutional/design-review";
import { loadDesignReviewInstrumentOverview } from "@/lib/institutional/wheat-overview-fixture";
import {
  DESIGN_REVIEW_INSTRUMENT_SHELL_BASE,
  parseInstrumentShellTab,
} from "@/lib/institutional/tabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ instrumentId: string }>;
}): Promise<Metadata> {
  const { instrumentId } = await params;
  return { title: `${instrumentId} · design review` };
}

export default async function DesignReviewInstrumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ instrumentId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  assertDesignReviewEnabled();
  const { instrumentId } = await params;
  const { tab: tabParam } = await searchParams;
  if (instrumentId !== DESIGN_REVIEW_INSTRUMENT_ID) {
    notFound();
  }
  const model = await loadDesignReviewInstrumentOverview(instrumentId);
  if (!model) {
    notFound();
  }
  const locale = (await getLocale()) as AppLocale;
  const tab = parseInstrumentShellTab(tabParam);

  return (
    <InstrumentOverviewScreen
      model={model}
      tab={tab}
      locale={locale}
      basePath={DESIGN_REVIEW_INSTRUMENT_SHELL_BASE}
      reviewMode
    />
  );
}

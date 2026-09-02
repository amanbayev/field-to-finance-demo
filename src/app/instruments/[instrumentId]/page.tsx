import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { InstrumentShellView } from "@/components/market-core/instrument-shell-view";
import type { AppLocale } from "@/i18n/config";
import { requirePermission } from "@/lib/auth/guard";
import { parseInstrumentSection } from "@/lib/market-core/presentation";
import { getInstrumentShellContext } from "@/services/instrument-shell";
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

export default async function InstrumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ instrumentId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { instrumentId } = await params;
  const { section: sectionParam } = await searchParams;
  const actor = await requirePermission("issuance.read", "market.read");
  const context = await getInstrumentShellContext(instrumentId, actor);
  if (!context) {
    notFound();
  }
  const t = await getTranslations("marketCore");
  const locale = (await getLocale()) as AppLocale;
  const section = parseInstrumentSection(sectionParam);

  return (
    <InstrumentShellView
      context={context}
      section={section}
      locale={locale}
      translate={t}
    />
  );
}

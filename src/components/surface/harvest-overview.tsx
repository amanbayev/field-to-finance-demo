import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { CinematicImage } from "@/components/surface/cinematic-image";
import { LiveClock } from "@/components/surface/live-clock";
import { LifecycleStrip } from "@/components/dashboard/lifecycle-strip";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageSection } from "@/components/shared/page-section";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import type { DashboardSnapshot } from "@/services/dashboard-service";

export async function HarvestOverview({
  snapshot,
}: {
  snapshot: DashboardSnapshot;
}) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics, network } = snapshot;
  const coverage = formatInteger(metrics.eligibleCoverageTonnes, locale);
  const issuanceEmpty = !metrics.tokenIssuanceStarted;

  return (
    <div data-surface="flush">
      <section className="relative min-h-[calc(100svh-6.75rem)] overflow-hidden">
        <CinematicImage
          src="/media/hero-harvest-dusk.png"
          alt={t("surface.heroAlt")}
          kenBurns
          kenBurnsOrigin="bottom"
          objectPosition="center bottom"
          priority
          className="absolute inset-0"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/55 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />

        <div className="relative flex min-h-[calc(100svh-6.75rem)] flex-col justify-center px-5 pb-16 pt-8 sm:px-10 lg:px-16">
          <div className="reveal absolute top-8 right-5 sm:right-10 lg:right-16">
            <LiveClock locale={locale} label={t("surface.clockLabel")} />
          </div>
          <p className="reveal label-caps text-harvest">{t("surface.venue")}</p>
          <h1 className="reveal reveal-delay-1 mt-5 max-w-5xl font-heading text-[clamp(2.4rem,7vw,5.6rem)] leading-[0.95] text-bone">
            {t("surface.thesis")}
          </h1>
          <p className="reveal reveal-delay-2 mt-6 max-w-xl text-base leading-relaxed text-bone/80 sm:text-lg">
            {t("surface.thesisLead")}
          </p>

          <div className="reveal reveal-delay-3 mt-12 flex flex-wrap items-end gap-10">
            <div>
              <p className="label-caps">{t("dashboard.eligibleCoverage")}</p>
              <p className="mt-2 font-tabular text-5xl tracking-tight text-harvest sm:text-6xl">
                {t("units.tonnes", { value: coverage })}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pb-2">
              <Button size="lg" nativeButton={false} render={<Link href="/market" />}>
                {t("surface.openMarket")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                className="border-bone/25 bg-background/30 text-bone hover:bg-background/55"
                render={<Link href="/register" />}
              >
                {t("surface.requestAccess")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-10">
        <MetricStrip className="reveal reveal-delay-4 sm:grid-cols-4">
          <MetricCell
            emphasis="primary"
            label={t("dashboard.wheatMinted")}
            value={formatInteger(metrics.wheatMintedSupply, locale)}
          />
          <MetricCell
            label={t("dashboard.primaryPlacement")}
            value={formatInteger(metrics.primaryPlacementVolume, locale)}
          />
          <MetricCell
            label={t("dashboard.registrarInventory")}
            value={formatInteger(metrics.registrarInventory, locale)}
          />
          <MetricCell
            label={t("dashboard.circulating")}
            value={formatInteger(metrics.circulatingSupply, locale)}
          />
        </MetricStrip>

        {issuanceEmpty ? (
          <div className="relative mt-10 overflow-hidden border border-border">
            <CinematicImage
              src="/media/empty-silo-light.png"
              alt={t("surface.emptyAlt")}
              className="absolute inset-0 opacity-50"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/40" />
            <div className="relative max-w-lg px-6 py-14 sm:px-10">
              <p className="label-caps text-harvest">{t("surface.emptyEyebrow")}</p>
              <h2 className="mt-3 font-heading text-3xl text-bone">
                {t("surface.emptyTitle")}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-straw">
                {t("surface.emptyBody")}
              </p>
              <Button className="mt-6" nativeButton={false} render={<Link href="/contracts" />}>
                {t("surface.emptyAction")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-14 grid gap-8 lg:grid-cols-[1.4fr_0.8fr] lg:items-start">
          <PageSection
            title={t("lifecycle.title")}
            description={t("lifecycle.description")}
          >
            <LifecycleStrip />
          </PageSection>
          <aside className="relative min-h-64 overflow-hidden border border-border lg:mt-8">
            <CinematicImage
              src="/media/grain-kernel-macro.png"
              alt={t("surface.grainAlt")}
              className="absolute inset-0"
              sizes="(min-width: 1024px) 32vw, 100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
            <p className="absolute bottom-5 left-5 right-5 text-sm leading-relaxed text-bone/90">
              {t("surface.grainCaption")}
            </p>
          </aside>
        </div>

        <PageSection
          title={t("dashboard.infrastructure")}
          description={t("dashboard.infrastructureNote")}
        >
          <MetricStrip className="sm:grid-cols-4">
            <MetricCell
              label={network.network}
              value={
                network.connected
                  ? t("header.connected")
                  : t("header.disconnected")
              }
            />
            <MetricCell
              label={t("dashboard.registryProgram")}
              value={
                network.registryProgramDeployed
                  ? t("status.DEPLOYED")
                  : t("status.NOT_YET_DEPLOYED")
              }
            />
            <MetricCell
              label={t("dashboard.marketProgram")}
              value={
                network.marketProgramDeployed
                  ? t("status.DEPLOYED")
                  : t("status.NOT_YET_DEPLOYED")
              }
            />
            <MetricCell
              label={t("dashboard.onChainDemoContracts")}
              value={formatInteger(network.onChainDemoContracts, locale)}
            />
          </MetricStrip>
        </PageSection>
      </div>
    </div>
  );
}

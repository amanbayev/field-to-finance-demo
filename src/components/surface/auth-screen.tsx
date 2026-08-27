import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { CinematicImage } from "@/components/surface/cinematic-image";

export async function AuthScreen({ children }: { children: ReactNode }) {
  const t = await getTranslations("surface");

  return (
    <div
      data-surface="flush"
      data-auth-surface
      className="relative flex min-h-full w-full flex-1 overflow-hidden"
    >
      <CinematicImage
        src="/media/hero-harvest-dusk.png"
        alt={t("loginPanelAlt")}
        kenBurns
        priority
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-background/35 lg:bg-gradient-to-r lg:from-background/25 lg:via-background/10 lg:to-ink" />

      <div className="relative flex min-h-full flex-1 flex-col lg:flex-row">
        <div className="flex min-h-[32svh] flex-1 flex-col justify-end px-5 py-8 sm:px-10 lg:min-h-0 lg:justify-center lg:px-16 lg:py-16">
          <p className="reveal label-caps text-harvest">{t("venue")}</p>
          <p className="reveal reveal-delay-1 mt-4 max-w-md text-xl leading-snug text-bone sm:text-2xl lg:max-w-lg lg:text-[1.75rem]">
            {t("thesisLead")}
          </p>
        </div>
        <aside className="relative flex w-full shrink-0 flex-col justify-center border-t border-harvest/25 bg-ink px-6 py-10 sm:px-10 lg:w-[26.5rem] lg:border-l lg:border-t-0 lg:px-12 xl:w-[30rem]">
          {children}
        </aside>
      </div>
    </div>
  );
}

export async function AuthDeskClosed() {
  const t = await getTranslations("surface");

  return (
    <div>
      <p className="label-caps text-harvest">{t("deskEyebrow")}</p>
      <h1 className="mt-3 font-heading text-3xl text-bone">{t("deskClosedTitle")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-straw">{t("deskClosedBody")}</p>
      <Button className="mt-8" size="lg" nativeButton={false} render={<Link href="/" />}>
        {t("backToBook")}
      </Button>
    </div>
  );
}

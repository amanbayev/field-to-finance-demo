"use client";

import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import { CinematicImage } from "@/components/surface/cinematic-image";
import { LiveClock } from "@/components/surface/live-clock";
import type { AppLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { KenBurnsOrigin } from "@/lib/surface/role-media";

export function DeskStage({
  kicker,
  title,
  lead,
  figure,
  photo = "/media/grain-kernel-macro.png",
  photoAlt = "",
  photoPosition = "center",
  kenBurnsOrigin = "center",
  asOfLabel,
  variant = "page",
  className,
}: {
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  figure?: ReactNode;
  photo?: string;
  photoAlt?: string;
  photoPosition?: string;
  kenBurnsOrigin?: KenBurnsOrigin;
  asOfLabel?: string;
  variant?: "page" | "overview";
  className?: string;
}) {
  const locale = useLocale() as AppLocale;
  const overview = variant === "overview";
  const minHeight = overview
    ? "min-h-[min(72svh,36rem)] lg:min-h-[min(78svh,42rem)]"
    : "min-h-[220px] lg:min-h-[280px]";

  return (
    <section className={cn("desk-stage relative block w-full overflow-hidden", minHeight, className)}>
      <CinematicImage
        src={photo}
        alt={photoAlt}
        kenBurns
        kenBurnsOrigin={kenBurnsOrigin}
        objectPosition={photoPosition}
        priority
        sizes="(min-width: 1024px) 75vw, 100vw"
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/10" />
      <div
        className={cn(
          "relative flex flex-col justify-end px-5 py-8 sm:px-8 lg:px-10",
          minHeight,
        )}
      >
        {overview && asOfLabel ? (
          <div className="reveal absolute top-5 right-5 sm:top-8 sm:right-8 lg:right-10">
            <LiveClock locale={locale} label={asOfLabel} />
          </div>
        ) : null}
        <div className="reveal flex items-end justify-between gap-6">
          {kicker ? <p className="label-caps text-harvest">{kicker}</p> : <span />}
          {!overview && asOfLabel ? (
            <LiveClock locale={locale} label={asOfLabel} />
          ) : null}
        </div>
        <h1
          className={cn(
            "reveal reveal-delay-1 mt-3 max-w-3xl font-heading leading-[0.95] text-bone",
            overview
              ? "text-[clamp(2.15rem,6vw,4.6rem)]"
              : "text-[clamp(1.75rem,4.2vw,3.15rem)]",
          )}
        >
          {title}
        </h1>
        {lead ? (
          <p className="reveal reveal-delay-2 mt-4 max-w-xl text-sm leading-relaxed text-bone/80 sm:text-[0.95rem]">
            {lead}
          </p>
        ) : null}
        {figure ? <div className="reveal reveal-delay-3 mt-8">{figure}</div> : null}
      </div>
    </section>
  );
}

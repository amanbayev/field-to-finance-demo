import { getTranslations } from "next-intl/server";
import { CinematicImage } from "@/components/surface/cinematic-image";

export async function ScreenLoader() {
  const t = await getTranslations("surface");

  return (
    <div role="status" aria-live="polite">
      <section className="desk-stage relative min-h-[220px] overflow-hidden lg:min-h-[280px]">
        <CinematicImage
          src="/media/empty-silo-light.png"
          alt=""
          className="absolute inset-0 opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/25" />
        <div className="relative flex min-h-[220px] flex-col justify-end px-5 py-8 sm:px-8 lg:min-h-[280px] lg:px-10">
          <p className="label-caps text-harvest">{t("loadingTitle")}</p>
          <div className="mt-4 h-12 w-2/3 max-w-lg skeleton-shimmer rounded-sm" />
          <div className="mt-3 h-4 w-1/2 max-w-sm skeleton-shimmer rounded-sm" />
          <p className="mt-6 max-w-md text-sm text-straw">{t("loadingHint")}</p>
        </div>
      </section>
      <ul className="divide-y divide-harvest/15 border-b border-harvest/20" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="flex items-center justify-between gap-6 py-5">
            <div className="w-full max-w-md">
              <div className="h-2 w-16 skeleton-shimmer rounded-sm" />
              <div className="mt-3 h-4 w-3/4 skeleton-shimmer rounded-sm" />
            </div>
            <div className="h-6 w-16 skeleton-shimmer rounded-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

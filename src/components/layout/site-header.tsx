import { getTranslations } from "next-intl/server";
import { blockchainProvider } from "@/services/providers";
import { MainNav, MobileNav } from "@/components/layout/main-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { productName } from "@/lib/navigation";

export async function SiteHeader() {
  const t = await getTranslations();
  const network = await blockchainProvider.getNetworkStatus();

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 bg-primary px-4 py-1 text-primary-foreground sm:px-6">
        <p className="text-[10px] font-medium tracking-[0.16em] uppercase">
          {t("header.badge")}
        </p>
        <div className="flex items-center gap-4">
          <p className="hidden text-[10px] tracking-wide sm:block">
            {t("header.phase")}
          </p>
          <LanguageSwitcher variant="onPrimary" />
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
        <MobileNav />
        <div className="min-w-0 shrink-0">
          <p className="text-sm font-medium leading-none text-foreground sm:text-base">
            {productName}
          </p>
          <p className="mt-1 hidden max-w-xs text-[10px] leading-snug tracking-wide text-muted-foreground uppercase sm:block">
            {t("brand.subtitle")}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <MainNav />
        </div>
        <div className="hidden shrink-0 items-end gap-4 border-l border-border pl-4 text-right xl:flex">
          <div>
            <p className="label-caps">{t("header.network")}</p>
            <p className="text-xs font-medium">{network.network}</p>
          </div>
          <div>
            <p className="label-caps">{t("header.system")}</p>
            <p className="text-xs font-medium text-primary">
              {network.connected
                ? t("header.connected")
                : t("header.disconnected")}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

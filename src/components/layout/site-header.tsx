import { getTranslations } from "next-intl/server";
import { blockchainProvider } from "@/services/providers";
import { MainNav, MobileNav } from "@/components/layout/main-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { productName } from "@/lib/navigation";

export async function SiteHeader() {
  const t = await getTranslations();
  const network = blockchainProvider.getNetworkStatus();

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-primary px-4 py-1.5 text-primary-foreground sm:px-6">
        <p className="text-[11px] font-medium tracking-[0.16em] uppercase">
          {t("header.badge")}
        </p>
        <div className="flex items-center gap-4">
          <p className="hidden text-[11px] tracking-wide sm:block">
            {t("header.phase")}
          </p>
          <LanguageSwitcher variant="onPrimary" />
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <MobileNav />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg leading-none text-foreground sm:text-xl">
            {productName}
          </p>
          <p className="mt-1 truncate text-xs tracking-wide text-muted-foreground uppercase">
            {t("brand.subtitle")}
          </p>
        </div>
        <MainNav />
        <div className="hidden shrink-0 items-end gap-4 border-l border-border pl-4 text-right sm:flex">
          <div>
            <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              {t("header.network")}
            </p>
            <p className="text-xs font-medium">{network.network}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              {t("header.system")}
            </p>
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

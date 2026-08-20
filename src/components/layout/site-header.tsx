import { productName, productSubtitle, prototypeBadge } from "@/lib/navigation";
import { blockchainProvider } from "@/services/providers";
import { MainNav, MobileNav } from "@/components/layout/main-nav";

export function SiteHeader() {
  const network = blockchainProvider.getNetworkStatus();

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-primary px-4 py-1.5 text-primary-foreground sm:px-6">
        <p className="text-[11px] font-medium tracking-[0.16em] uppercase">
          {prototypeBadge}
        </p>
        <p className="hidden text-[11px] tracking-wide sm:block">
          Live public demo · Phase 0
        </p>
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <MobileNav />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-lg leading-none text-foreground sm:text-xl">
            {productName}
          </p>
          <p className="mt-1 truncate text-xs tracking-wide text-muted-foreground uppercase">
            {productSubtitle}
          </p>
        </div>
        <MainNav />
        <div className="hidden shrink-0 items-end gap-4 border-l border-border pl-4 text-right sm:flex">
          <div>
            <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Network
            </p>
            <p className="text-xs font-medium">{network.network}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              System
            </p>
            <p className="text-xs font-medium text-primary">
              {network.connected ? "Connected" : "Disconnected"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

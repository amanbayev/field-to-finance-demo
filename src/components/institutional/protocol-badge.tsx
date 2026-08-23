import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AssetClass } from "@/domain/market-core";

const ACCENT: Record<AssetClass, string> = {
  AGRICULTURE: "bg-[#EAF4EE] text-[#0B5D3B]",
  WATER: "bg-sky-50 text-sky-900",
  MUSIC_RIGHTS: "bg-violet-50 text-violet-900",
  GAMING_ASSETS: "bg-amber-50 text-amber-900",
};

export function ProtocolBadge({
  assetClass,
  children,
  className,
  muted = false,
}: {
  assetClass: AssetClass;
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] tracking-wide",
        muted
          ? "border border-border bg-transparent font-normal text-[#59645D]"
          : `font-medium ${ACCENT[assetClass]}`,
        className,
      )}
    >
      {children}
    </span>
  );
}

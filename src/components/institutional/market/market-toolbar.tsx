"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarketToolbar({
  watchLabel,
  actionsLabel,
  overviewLabel,
  classicLabel,
  overviewHref,
  classicHref,
}: {
  watchLabel: string;
  actionsLabel: string;
  overviewLabel: string;
  classicLabel: string;
  overviewHref: string;
  classicHref: string;
}) {
  const [watched, setWatched] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-pressed={watched}
        aria-label={watchLabel}
        onClick={() => setWatched((value) => !value)}
        className={cn(
          "flex size-8 items-center justify-center rounded-md border border-border",
          watched ? "text-amber-600" : "text-[#59645D] hover:bg-[#F1F4F1]",
        )}
      >
        <Star className={cn("size-3.5", watched && "fill-current")} />
      </button>
      <div className="relative">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-foreground hover:bg-[#F1F4F1]"
        >
          {actionsLabel}
          <ChevronDown className="size-3.5 text-[#59645D]" />
        </button>
        {open ? (
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-border bg-card py-1 shadow-sm">
            <Link
              href={overviewHref}
              className="block px-3 py-1.5 text-[12px] hover:bg-[#F1F4F1]"
              onClick={() => setOpen(false)}
            >
              {overviewLabel}
            </Link>
            <Link
              href={classicHref}
              className="block px-3 py-1.5 text-[12px] hover:bg-[#F1F4F1]"
              onClick={() => setOpen(false)}
            >
              {classicLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </>
  );
}

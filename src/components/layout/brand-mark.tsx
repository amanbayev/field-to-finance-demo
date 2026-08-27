"use client";

import Link from "next/link";
import { WheatMark } from "@/components/surface/wheat-mark";

export function BrandMark({
  fullName,
  shortName,
  compact = false,
}: {
  fullName: string;
  shortName: string;
  compact?: boolean;
}) {
  return (
    <Link
      href="/"
      aria-label={fullName}
      className="flex min-w-0 items-center gap-2 text-bone transition-colors duration-150 ease-out hover:text-harvest"
    >
      <WheatMark className="size-6 shrink-0 text-harvest" />
      <span className="min-w-0">
        <span className="block truncate font-wordmark text-sm tracking-tight">
          {shortName}
        </span>
        {compact ? null : (
          <span className="mt-0.5 hidden text-[10px] tracking-[0.18em] text-straw uppercase sm:block">
            {fullName}
          </span>
        )}
      </span>
    </Link>
  );
}

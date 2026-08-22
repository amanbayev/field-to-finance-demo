import Link from "next/link";
import { cn } from "@/lib/utils";
import { INSTRUMENT_SECTIONS, type InstrumentSection } from "@/domain/market-core";

export function InstrumentSectionNav({
  instrumentId,
  active,
  labels,
  ariaLabel,
}: {
  instrumentId: string;
  active: InstrumentSection;
  labels: Record<InstrumentSection, string>;
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="mb-6 flex flex-wrap gap-1 border-b border-border pb-2"
    >
      {INSTRUMENT_SECTIONS.map((section) => (
        <Link
          key={section}
          href={`/instruments/${instrumentId}?section=${section}`}
          className={cn(
            "px-2 py-1 text-xs tracking-wide",
            active === section
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[section]}
        </Link>
      ))}
    </nav>
  );
}

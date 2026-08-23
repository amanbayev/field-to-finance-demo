import Link from "next/link";
import type { ActivityItem } from "@/lib/institutional/load-overview";
import type { AppLocale } from "@/i18n/config";
import { formatTimestamp } from "@/lib/format";

export function AuditTimeline({
  items,
  locale,
  recordedLabel,
  empty,
}: {
  items: Array<ActivityItem & { label: string }>;
  locale: AppLocale;
  recordedLabel: string;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  const sorted = [...items].sort((a, b) => {
    if (a.at && b.at) {
      return a.at < b.at ? 1 : -1;
    }
    if (a.at) {
      return -1;
    }
    if (b.at) {
      return 1;
    }
    return 0;
  });

  return (
    <ol className="divide-y divide-border">
      {sorted.map((item) => {
        const row = (
          <span className="flex items-start justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm text-foreground">{item.label}</span>
              {item.reference ? (
                <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                  {item.reference}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-[11px] text-[#7B857F] tabular-nums">
              {item.at ? formatTimestamp(item.at, locale) : recordedLabel}
            </span>
          </span>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link
                href={item.href}
                className="block rounded-sm hover:bg-[#F1F4F1] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ol>
  );
}

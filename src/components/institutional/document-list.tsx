import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DocumentItem } from "@/lib/institutional/load-overview";

export function DocumentList({
  items,
  labels,
  empty,
}: {
  items: DocumentItem[];
  labels: Record<string, string>;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const title = labels[item.titleKey] ?? item.titleKey;
        const content = (
          <span className="flex items-start justify-between gap-3 py-2.5">
            <span>
              <span className="block text-sm font-medium text-foreground">{title}</span>
              <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                {item.detail === "record" || item.detail === "workspace"
                  ? labels[item.detail] ?? item.detail
                  : item.detail}
              </span>
            </span>
            {item.href ? (
              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-[#7B857F]" aria-hidden />
            ) : null}
          </span>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link
                href={item.href}
                className="block rounded-sm hover:bg-[#F1F4F1] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

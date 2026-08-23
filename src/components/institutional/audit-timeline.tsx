import Link from "next/link";
import { formatTimestamp } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";

export function AuditTimeline({
  items,
  locale,
  recordedLabel,
  empty,
}: {
  items: Array<{
    id: string;
    label: string;
    reference?: string;
    at: string | null;
    href?: string;
  }>;
  locale: AppLocale;
  recordedLabel: string;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ol className="space-y-2.5">
      {items.map((item) => {
        const when = item.at ? `${formatTimestamp(item.at, locale)} UTC` : recordedLabel;
        const inner = (
          <>
            <p className="text-sm font-medium">{item.label}</p>
            {item.reference ? (
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{item.reference}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-[#7B857F]">{when}</p>
          </>
        );
        return (
          <li key={item.id} className="border-l-2 border-[#D7DDD8] pl-3">
            {item.href ? (
              <Link href={item.href} className="block hover:text-foreground">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}

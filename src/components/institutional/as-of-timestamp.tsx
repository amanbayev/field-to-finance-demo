import { formatTimestamp } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";

export function AsOfTimestamp({
  iso,
  locale,
  label,
}: {
  iso: string | null;
  locale: AppLocale;
  label: string;
}) {
  if (!iso) {
    return null;
  }
  return (
    <p className="text-[11px] text-[#7B857F] tabular-nums">
      {label} {formatTimestamp(iso, locale)}
    </p>
  );
}

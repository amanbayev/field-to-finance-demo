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
    <p className="whitespace-nowrap text-[11px] tracking-wide text-[#7B857F]">
      {label} {formatTimestamp(iso, locale)} UTC
    </p>
  );
}

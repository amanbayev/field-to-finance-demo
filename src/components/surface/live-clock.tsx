"use client";

import { useEffect, useState } from "react";
import { intlLocales, type AppLocale } from "@/i18n/config";

export function LiveClock({
  locale,
  label,
}: {
  locale: AppLocale;
  label: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now
    ? new Intl.DateTimeFormat(intlLocales[locale], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(now)
    : "——:——:——";

  return (
    <p className="flex items-center gap-2 font-tabular text-[11px] tracking-wide text-straw">
      <span className="live-dot size-1.5 rounded-full bg-pulse" aria-hidden />
      <span className="sr-only">{label}</span>
      <time dateTime={now?.toISOString()}>{time}</time>
    </p>
  );
}

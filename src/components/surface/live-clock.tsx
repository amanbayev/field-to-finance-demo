"use client";

import { useSyncExternalStore } from "react";
import { intlLocales, type AppLocale } from "@/i18n/config";

function subscribe(onStoreChange: () => void) {
  const id = window.setInterval(onStoreChange, 1000);
  return () => window.clearInterval(id);
}

function nowMs() {
  return Date.now();
}

function serverNow() {
  return 0;
}

export function LiveClock({
  locale,
  label,
}: {
  locale: AppLocale;
  label: string;
}) {
  const timestamp = useSyncExternalStore(subscribe, nowMs, serverNow);
  const now = timestamp ? new Date(timestamp) : null;

  const time = now
    ? new Intl.DateTimeFormat(intlLocales[locale], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(now)
    : "——:——:——";

  return (
    <p className="flex items-center gap-2.5 text-[11px] tracking-wide text-straw">
      <span className="live-dot size-1.5 shrink-0 rounded-full bg-pulse" aria-hidden />
      <span className="label-caps">{label}</span>
      <time dateTime={now?.toISOString()} className="font-tabular text-bone">
        {time}
      </time>
    </p>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneForStatus, type StatusFamily } from "@/lib/institutional/status";

const TONE_CLASS = {
  success: "bg-[#EAF4EE] text-[#0B5D3B]",
  warning: "bg-amber-50 text-amber-950",
  danger: "bg-red-50 text-red-800",
  info: "bg-sky-50 text-sky-900",
  neutral: "bg-[#F1F4F1] text-[#59645D]",
} as const;

export function StatusChip({
  family,
  code,
  label,
  className,
}: {
  family: StatusFamily;
  code: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide",
        TONE_CLASS[toneForStatus(family, code)],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function StatusChipStatic({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-[#F1F4F1] px-2 py-0.5 text-[11px] font-medium text-[#59645D]",
        className,
      )}
    >
      {children}
    </span>
  );
}

import { cn } from "@/lib/utils";
import { toneForStatus, type StatusFamily, type StatusTone } from "@/lib/institutional/status";

const TONE_CLASS: Record<StatusTone, string> = {
  success:
    "border-[#0B5D3B]/20 bg-[#EAF4EE] text-[#084A30]",
  warning:
    "border-amber-700/20 bg-amber-50 text-amber-900",
  danger: "border-red-700/20 bg-red-50 text-red-800",
  info: "border-sky-800/20 bg-sky-50 text-sky-900",
  neutral: "border-[#B9C3BC] bg-[#F1F4F1] text-[#59645D]",
};

const DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-[#0B5D3B]",
  warning: "bg-amber-600",
  danger: "bg-red-700",
  info: "bg-sky-800",
  neutral: "bg-[#7B857F]",
};

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
  const tone = toneForStatus(family, code);
  return (
    <span
      data-family={family}
      data-status={code}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-[0.06em] uppercase",
        TONE_CLASS[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[tone])} />
      <span className="truncate">{label}</span>
    </span>
  );
}

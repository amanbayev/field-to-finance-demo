import { Card, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardContent>
        <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </p>
        <div className="mt-3 font-heading text-3xl tracking-tight">{value}</div>
        {hint ? (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

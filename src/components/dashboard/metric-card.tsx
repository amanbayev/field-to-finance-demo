import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent>
        <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-3 font-heading text-3xl tracking-tight">{value}</p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

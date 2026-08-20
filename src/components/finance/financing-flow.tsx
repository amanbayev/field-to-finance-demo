import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinancingPosition } from "@/domain";

export function FinancingFlow({ module }: { module: FinancingPosition }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{module.title}</CardTitle>
            {module.legalNote ? (
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {module.legalNote}
              </p>
            ) : null}
          </div>
          <StatusBadge value={module.status} />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {module.steps.map((step, index) => (
            <li
              key={step}
              className="rounded-md border border-border bg-muted/40 p-3"
            >
              <span className="font-mono text-[11px] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-sm font-medium leading-snug">{step}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

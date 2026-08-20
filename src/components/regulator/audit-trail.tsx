import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimestamp } from "@/lib/format";
import type { AuditEvent } from "@/domain";

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="space-y-3">
      {events.map((event, index) => (
        <li key={event.id}>
          <Card className="shadow-none">
            <CardContent className="flex gap-4">
              <div className="flex w-8 flex-col items-center">
                <span className="mt-1 size-2.5 rounded-full bg-primary" />
                {index < events.length - 1 ? (
                  <span className="mt-2 w-px flex-1 bg-border" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] text-muted-foreground">
                  {formatTimestamp(event.timestamp)} UTC
                </p>
                <p className="mt-1 font-medium">{event.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {event.detail}
                </p>
                {event.relatedEntityId && event.relatedEntityType === "contract" ? (
                  <Link
                    href={`/contracts/${event.relatedEntityId}`}
                    className="mt-2 inline-block text-xs text-primary hover:underline"
                  >
                    {event.relatedEntityId}
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}

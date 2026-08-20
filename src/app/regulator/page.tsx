import type { Metadata } from "next";
import { MetricCard } from "@/components/dashboard/metric-card";
import { AuditTrail } from "@/components/regulator/audit-trail";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSystemOverview,
  listAuditEvents,
  regulatorTopics,
} from "@/services/regulator-service";

export const metadata: Metadata = {
  title: "Regulator View",
};

export default function RegulatorPage() {
  const overview = getSystemOverview();
  const events = listAuditEvents();

  return (
    <div>
      <PageHeader
        eyebrow="Supervisory transparency"
        title="Regulator View"
        description="A dedicated read-only view of system provenance, coverage, token supply and compliance. Later records will cite Solana Devnet transactions."
      />

      <h2 className="mb-3 font-heading text-2xl">System overview</h2>
      <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Contracts" value={String(overview.contracts)} />
        <MetricCard label="Pools" value={String(overview.pools)} />
        <MetricCard label="Token series" value={String(overview.tokenSeries)} />
        <MetricCard label="Participants" value={String(overview.participants)} />
        <MetricCard
          label="Blocked participants"
          value={String(overview.blockedParticipants)}
        />
        <MetricCard
          label="Coverage alerts"
          value={String(overview.coverageAlerts)}
        />
      </section>

      <Card className="mb-8 shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Supervisory lenses</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {regulatorTopics.map((topic) => (
              <li
                key={topic}
                className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm"
              >
                {topic}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <h2 className="mb-3 font-heading text-2xl">Audit trail</h2>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Example control events for the 2027 wheat programme. Timestamps are mock
        records. Blockchain transaction references will be attached in a later
        phase.
      </p>
      <AuditTrail events={events} />
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MetricCard } from "@/components/dashboard/metric-card";
import { AuditTrail } from "@/components/regulator/audit-trail";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { regulatorTopicKeys } from "@/lib/navigation";
import {
  getSystemOverview,
  listAuditEvents,
} from "@/services/regulator-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("regulator");
  return { title: t("title") };
}

export default async function RegulatorPage() {
  const t = await getTranslations("regulator");
  const overview = getSystemOverview();
  const events = listAuditEvents();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <h2 className="mb-3 font-heading text-2xl">{t("overview")}</h2>
      <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label={t("contracts")} value={String(overview.contracts)} />
        <MetricCard label={t("pools")} value={String(overview.pools)} />
        <MetricCard label={t("tokenSeries")} value={String(overview.tokenSeries)} />
        <MetricCard label={t("participants")} value={String(overview.participants)} />
        <MetricCard
          label={t("blocked")}
          value={String(overview.blockedParticipants)}
        />
        <MetricCard
          label={t("coverageAlerts")}
          value={String(overview.coverageAlerts)}
        />
      </section>

      <Card className="mb-8 shadow-none">
        <CardHeader className="border-b">
          <CardTitle>{t("lenses")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {regulatorTopicKeys.map((topic) => (
              <li
                key={topic}
                className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm"
              >
                {t(`topics.${topic}`)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <h2 className="mb-3 font-heading text-2xl">{t("auditTitle")}</h2>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        {t("auditIntro")}
      </p>
      <AuditTrail events={events} />
    </div>
  );
}

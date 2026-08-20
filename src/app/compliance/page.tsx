import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { complianceControlKeys } from "@/lib/navigation";
import { listParticipantCompliance } from "@/services/compliance-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("compliance");
  return { title: t("title") };
}

export default async function CompliancePage() {
  const t = await getTranslations("compliance");
  const tStatus = await getTranslations("status");
  const rows = listParticipantCompliance();
  const featuredIds = new Set([
    "prd-akmola-agro",
    "inv-demo-a",
    "inv-demo-b",
  ]);
  const featured = rows.filter((row) => featuredIds.has(row.participant.id));

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <Card className="mb-6 shadow-none">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("controlModules")}</CardTitle>
            <StatusBadge value="MOCK" />
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {complianceControlKeys.map((control) => (
              <li
                key={control}
                className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm font-medium"
              >
                {t(`controls.${control}`)}
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  {t("provider")}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-6 shadow-none">
        <CardHeader className="border-b">
          <CardTitle>{t("sample")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {featured.map(({ participant, record, liveKyc, liveKyb, liveKyt }) => (
            <div key={participant.id} className="rounded-md border border-border p-4">
              <p className="font-medium">{participant.name}</p>
              <p className="mt-1 text-xs tracking-wide text-muted-foreground">
                {tStatus(participant.type)}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <Row
                  label={t("columns.kyb")}
                  value={liveKyb}
                  hidden={liveKyb === "NOT_APPLICABLE"}
                />
                <Row
                  label={t("columns.kyc")}
                  value={liveKyc}
                  hidden={liveKyc === "NOT_APPLICABLE"}
                />
                <Row
                  label={t("columns.directorKyc")}
                  value={record.directorKyc}
                  hidden={record.directorKyc === "NOT_APPLICABLE"}
                />
                <Row label={t("columns.kyt")} value={liveKyt} />
                <Row label={t("columns.eligibility")} value={record.eligibility} />
              </dl>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>{t("register")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.participant")}</TableHead>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.kyc")}</TableHead>
                <TableHead>{t("columns.kyb")}</TableHead>
                <TableHead>{t("columns.kyt")}</TableHead>
                <TableHead>{t("columns.wallet")}</TableHead>
                <TableHead>{t("columns.sanctions")}</TableHead>
                <TableHead>{t("columns.pep")}</TableHead>
                <TableHead>{t("columns.eligibility")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ participant, record, liveKyc, liveKyb, liveKyt }) => (
                <TableRow key={participant.id}>
                  <TableCell className="font-medium">{participant.name}</TableCell>
                  <TableCell>{tStatus(participant.type)}</TableCell>
                  <TableCell>
                    <StatusBadge value={liveKyc} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={liveKyb} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={liveKyt} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={record.walletOwnership} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={record.sanctions} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={record.pep} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={record.eligibility} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  hidden,
}: {
  label: string;
  value: string;
  hidden?: boolean;
}) {
  if (hidden) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <StatusBadge value={value} />
      </dd>
    </div>
  );
}

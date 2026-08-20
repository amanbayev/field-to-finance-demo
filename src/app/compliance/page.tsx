import type { Metadata } from "next";
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
import {
  complianceControls,
  listParticipantCompliance,
} from "@/services/compliance-service";

export const metadata: Metadata = {
  title: "Compliance",
};

export default function CompliancePage() {
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
        eyebrow="Compliance control center"
        title="Compliance"
        description="All checks are mock results from Demo Compliance Provider. They are not real KYC, KYB or KYT determinations."
      />

      <Card className="mb-6 shadow-none">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Control modules</CardTitle>
            <StatusBadge value="MOCK" />
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {complianceControls.map((control) => (
              <li
                key={control}
                className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm font-medium"
              >
                {control}
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  Demo Compliance Provider
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="mb-6 shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Sample participants</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {featured.map(({ participant, record, liveKyc, liveKyb, liveKyt }) => (
            <div key={participant.id} className="rounded-md border border-border p-4">
              <p className="font-medium">{participant.name}</p>
              <p className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">
                {participant.type}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <Row label="KYB" value={liveKyb} hidden={liveKyb === "NOT_APPLICABLE"} />
                <Row label="KYC" value={liveKyc} hidden={liveKyc === "NOT_APPLICABLE"} />
                <Row
                  label="Director KYC"
                  value={record.directorKyc}
                  hidden={record.directorKyc === "NOT_APPLICABLE"}
                />
                <Row label="KYT" value={liveKyt} />
                <Row label="Eligibility" value={record.eligibility} />
              </dl>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Participant register</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>KYB</TableHead>
                <TableHead>KYT</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead>Sanctions</TableHead>
                <TableHead>PEP</TableHead>
                <TableHead>Eligibility</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ participant, record, liveKyc, liveKyb, liveKyt }) => (
                <TableRow key={participant.id}>
                  <TableCell className="font-medium">{participant.name}</TableCell>
                  <TableCell>{participant.type}</TableCell>
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

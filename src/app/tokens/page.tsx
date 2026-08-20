import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { IssueTokenButton } from "@/components/tokens/issue-token-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList } from "@/components/shared/data-list";
import { formatNumber } from "@/lib/format";
import { getPrimaryToken } from "@/services/token-service";

export const metadata: Metadata = {
  title: "Tokens",
};

export default function TokensPage() {
  const { token, pool } = getPrimaryToken();

  return (
    <div>
      <PageHeader
        eyebrow="Agricultural token series"
        title={token.symbol}
        description="Token issuance is prepared in the product layer. Solana Devnet deployment is reserved for a later phase."
      />

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{token.id}</p>
              <CardTitle className="mt-1">{token.symbol}</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={token.blockchainStatus} />
              <IssueTokenButton />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataList
            items={[
              { label: "Type", value: token.type },
              { label: "Issuer", value: token.issuerName },
              { label: "Token unit", value: token.tokenUnitDescription },
              { label: "Contract pool", value: pool.id },
              {
                label: "Maximum issuance",
                value: formatNumber(token.maximumIssuance),
              },
              { label: "Issued", value: formatNumber(token.issued) },
              { label: "Network", value: token.network },
              {
                label: "Blockchain status",
                value: token.blockchainStatus.replaceAll("_", " "),
              },
            ]}
          />
          <p className="mt-6 text-sm">
            Underlying pool:{" "}
            <Link
              href={`/pools/${pool.id}`}
              className="font-medium text-primary hover:underline"
            >
              {pool.name}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

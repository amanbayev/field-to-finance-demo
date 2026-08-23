import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketClearingSplit } from "@/components/market-core/market-clearing-split";
import { TradeLifecycle } from "@/components/market-core/trade-lifecycle";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DataList } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppLocale } from "@/i18n/config";
import { formatDemoKzt, formatInteger, formatTimestamp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { requireRegistrarOrRegulator } from "@/lib/auth/guard";
import { marketCoreSnapshot } from "@/services/market-core-service";
import { getSecondaryEngineState } from "@/services/secondary-market-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("clearingTitle") };
}

export default async function ClearingPage() {
  await requireRegistrarOrRegulator();
  const t = await getTranslations("marketCore");
  const tSec = await getTranslations("secondary");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = marketCoreSnapshot();
  const engine = await getSecondaryEngineState();
  const primary = snapshot.settlements.find(
    (item) => item.evidenceLabel === "PRIMARY_PLACEMENT_EVIDENCE",
  );
  const secondaryTrades = engine.trades.filter((trade) => trade.kind === "SECONDARY");

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("clearingTitle")}
        description={t("clearingIntro")}
      />
      <p className="mb-4 text-sm text-muted-foreground">{tSec("matchedNotSettled")}</p>
      <MarketClearingSplit
        distinction={t("clearingDistinct")}
        marketTitle={t("marketFlow")}
        clearingTitle={t("clearingFlow")}
        marketSteps={[t("order"), t("matching"), t("trade")]}
        clearingSteps={[
          t("trade"),
          t("eligibilityRecheck"),
          t("sellerReservation"),
          t("buyerReservation"),
          t("dvp"),
          t("registryUpdate"),
          t("finalSettlement"),
          t("audit"),
        ]}
      />
      <PageSection title={t("primaryEvidence")}>
        {primary ? (
          <DataList
            items={[
              { label: t("placement"), value: t("placementId") },
              { label: t("notSecondaryClearing"), value: primary.evidenceLabel },
              { label: tSec("status"), value: primary.status },
            ]}
          />
        ) : (
          <EmptyState>{t("noSecondaryTrade")}</EmptyState>
        )}
      </PageSection>
      <PageSection title={tSec("recentTrades")} description={tSec("awaitingDevnet")}>
        {secondaryTrades.length === 0 ? (
          <EmptyState>{tSec("noTrades")}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>{t("instrument")}</TableHead>
                <TableHead>{tSec("buy")}</TableHead>
                <TableHead>{tSec("sell")}</TableHead>
                <TableHead className="text-right">{tSec("qty")}</TableHead>
                <TableHead className="text-right">{tSec("price")}</TableHead>
                <TableHead>{tSec("matched")}</TableHead>
                <TableHead>{tSec("clearing")}</TableHead>
                <TableHead>{tSec("settlement")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secondaryTrades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-tabular text-xs">{trade.id}</TableCell>
                  <TableCell>{trade.instrumentId}</TableCell>
                  <TableCell>{trade.buyerParticipantId}</TableCell>
                  <TableCell>{trade.sellerParticipantId}</TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(trade.quantity, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatDemoKzt(trade.price, locale)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value="MATCHED" />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      value={
                        trade.eligibilityRecheckPassed ? "CLEARING_READY" : "MATCHED"
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={trade.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>
      <PageSection title={tSec("ceremonyTitle")}>
        <p className="mb-3 text-sm text-muted-foreground">{tSec("ceremonyHelp")}</p>
        <p className="mb-3 text-sm text-muted-foreground">{tSec("ceremonyDisabled")}</p>
        <Button type="button" disabled variant="secondary">
          {tSec("ceremonyControl")}
        </Button>
      </PageSection>
      {secondaryTrades.map((trade) => (
        <PageSection key={trade.id} title={`${tSec("clearingStatus")} · ${trade.id}`}>
          <p className="mb-3 text-xs text-muted-foreground">
            {formatTimestamp(trade.createdAt, locale)} · {formatDemoKzt(trade.notional, locale)}
          </p>
          <TradeLifecycle
            eligibilityPassed={trade.eligibilityRecheckPassed}
            pendingLabel={tSec("pending")}
            confirmedLabel={tSec("confirmed")}
            labels={{
              matched: tSec("matched"),
              eligibilityRecheck: t("eligibilityRecheck"),
              sellerReservation: t("sellerReservation"),
              buyerReservation: t("buyerReservation"),
              dvp: t("dvp"),
              registryUpdate: t("registryUpdate"),
              finalSettlement: t("finalSettlement"),
            }}
          />
        </PageSection>
      ))}
    </div>
  );
}

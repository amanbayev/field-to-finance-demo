import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketClearingSplit } from "@/components/market-core/market-clearing-split";
import { TradeLifecycle } from "@/components/market-core/trade-lifecycle";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DataList } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeskFigure, DeskNote } from "@/components/surface/desk-stage";
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
  const tDesk = await getTranslations("desk");
  const tSec = await getTranslations("secondary");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = marketCoreSnapshot();
  const engine = await getSecondaryEngineState();
  const primary = snapshot.settlements.find(
    (item) => item.evidenceLabel === "PRIMARY_PLACEMENT_EVIDENCE",
  );
  const secondaryTrades = engine.trades.filter((trade) => trade.kind === "SECONDARY");
  const latestSecondary = secondaryTrades[secondaryTrades.length - 1];

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("clearingTitle")}
        description={t("clearingIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          <DeskFigure
            label={tSec("pendingSettlements")}
            value={formatInteger(secondaryTrades.length, locale)}
            meta={[
              {
                label: t("sectionMarket"),
                value: tSec("demoOpen"),
              },
              {
                label: tSec("settlement"),
                value: tSec("pending"),
              },
            ]}
          />
        }
      />
      <DeskNote className="mb-8">{tSec("matchedNotSettled")}</DeskNote>
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
      <PageSection title={t("primaryEvidence")} description={t("notSecondaryClearing")}>
        {primary ? (
          <DataList
            items={[
              { label: t("placement"), value: t("placementId") },
              { label: t("notSecondaryClearing"), value: primary.evidenceLabel },
              { label: tSec("status"), value: primary.status },
            ]}
          />
        ) : (
          <EmptyState
            kicker={t("primaryEvidence")}
            title={tDesk("noneOnBook")}
            body={t("noSecondaryTrade")}
          />
        )}
      </PageSection>
      <PageSection title={tSec("recentTrades")} description={tSec("awaitingDevnet")}>
        {secondaryTrades.length === 0 ? (
          <EmptyState
            kicker={tSec("recentTrades")}
            title={tSec("noTrades")}
            body={tSec("awaitingDevnet")}
          />
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
      {latestSecondary ? (
        <PageSection
          title={`${tSec("clearingStatus")} · ${latestSecondary.id}`}
          description={tSec("awaitingDevnet")}
        >
          <p className="mb-3 text-xs text-straw">
            {formatTimestamp(latestSecondary.createdAt, locale)} ·{" "}
            {formatDemoKzt(latestSecondary.notional, locale)}
          </p>
          <TradeLifecycle
            eligibilityPassed={latestSecondary.eligibilityRecheckPassed}
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
      ) : null}
    </div>
  );
}

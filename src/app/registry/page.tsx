import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import {
  DeskFigure,
  DeskLedger,
  DeskNote,
  DeskRow,
  DeskSplit,
  DeskToolbar,
  deskIndex,
} from "@/components/surface/desk-stage";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requireRegistrarOrRegulator } from "@/lib/auth/guard";
import { ASSET_CLASS_KEYS } from "@/lib/market-core/presentation";
import {
  getMarketInstrument,
  listAssetProtocols,
  listHoldings,
  listMarketInstruments,
} from "@/services/market-core-service";
import {
  getSecondaryEngineState,
  overlayWorkingHoldings,
} from "@/services/secondary-market-service";
import { rpcReconcileWheat } from "@/services/secondary-market-repository";
import { loadLiveWheatReconciliation } from "@/services/wheat-live-reconciliation";
import { grainDeskSettlementBlockers } from "@/data/market-core/settlement-identities";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("registryTitle") };
}

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{
    protocol?: string;
    assetClass?: string;
    instrument?: string;
    issuer?: string;
    holder?: string;
  }>;
}) {
  await requireRegistrarOrRegulator();
  const filters = await searchParams;
  const t = await getTranslations("marketCore");
  const tSec = await getTranslations("secondary");
  const tDesk = await getTranslations("desk");
  const locale = (await getLocale()) as AppLocale;
  const engine = await getSecondaryEngineState();
  const cachedReconciliation = await rpcReconcileWheat();
  const wheatHoldings = engine.holdings.filter((row) => row.instrumentId === "WHEAT-2027");
  const liveReconciliation = await loadLiveWheatReconciliation(
    wheatHoldings.map((row) => ({
      participantId: row.holderReference,
      holderName: row.holderName,
      registeredOwned: row.buckets.owned,
      pendingIn: row.buckets.pendingIn,
      pendingOut: row.buckets.pendingOut,
    })),
  );
  const reconciliation = liveReconciliation.ok ? liveReconciliation : cachedReconciliation;
  const grainDeskBlockers = grainDeskSettlementBlockers();
  const protocols = listAssetProtocols();
  const instruments = listMarketInstruments();
  const issuers = [...new Map(instruments.map((item) => [item.issuerId, item])).values()];
  const rows = overlayWorkingHoldings(
    listHoldings({
      protocolId: filters.protocol || undefined,
      assetClass: filters.assetClass || undefined,
      instrumentId: filters.instrument || undefined,
      issuerId: filters.issuer || undefined,
      holderReference: filters.holder || undefined,
    }),
    engine,
  );

  const holders = [...new Map(listHoldings().map((item) => [item.holderReference, item])).values()];
  const registrar = rows.find((row) => row.holderReference === "REGISTRAR");
  const investor = rows.find((row) => row.holderReference === "INVESTOR-0001");
  const grainDesk = rows.find((row) => row.holderReference === "GRAIN-DESK");
  const bookTotal =
    (registrar?.buckets.owned ?? 0) +
    (investor?.buckets.owned ?? 0) +
    (grainDesk?.buckets.owned ?? 0);

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("registryTitle")}
        description={t("registryIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          registrar ? (
            <DeskFigure
              label="WHEAT-2027"
              value={formatInteger(bookTotal, locale)}
              meta={[
                {
                  label: registrar.holderName,
                  value: formatInteger(registrar.buckets.owned, locale),
                },
                ...(investor
                  ? [
                      {
                        label: investor.holderName,
                        value: formatInteger(investor.buckets.owned, locale),
                      },
                    ]
                  : []),
                ...(grainDesk
                  ? [
                      {
                        label: grainDesk.holderName,
                        value: formatInteger(grainDesk.buckets.owned, locale),
                      },
                    ]
                  : []),
              ]}
            />
          ) : undefined
        }
      />
      <DeskNote className="mb-4">
        {t("bookOfRecord")} {t("legalOwnership")}
      </DeskNote>
      <DeskNote className="mb-6">
        {t("unresolvedCustody")} {t("issuedHoldingsProof")}
      </DeskNote>

      {reconciliation ? (
        <PageSection
          title={t("reconciliation")}
          description={
            reconciliation.source === "LIVE_RPC"
              ? t("reconciliationSourceLive")
              : t("reconciliationSourceCached")
          }
        >
          <p className="mb-3 text-sm text-straw">
            {reconciliation.rows.some((row) => row.exception)
              ? t("reconciliationException")
              : t("reconciliationOk")}
            {"slot" in reconciliation && reconciliation.slot != null
              ? ` · slot ${reconciliation.slot}`
              : ""}
          </p>
          {grainDeskBlockers.length > 0 ? (
            <p className="mb-3 text-sm text-straw">{t("grainDeskUnmapped")}</p>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("holder")}</TableHead>
                <TableHead className="text-right">{tSec("registeredOwnership")}</TableHead>
                <TableHead className="text-right">{t("onChainBalance")}</TableHead>
                <TableHead className="text-right">{t("pendingIn")}</TableHead>
                <TableHead className="text-right">{t("pendingOut")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reconciliation.rows.map((row) => (
                <TableRow key={row.participantId}>
                  <TableCell>{row.holderName}</TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(row.registeredOwned, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {row.chainBalance == null ? "—" : formatInteger(row.chainBalance, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(row.pendingIn, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(row.pendingOut, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PageSection>
      ) : null}

      <DeskToolbar>
        <p className="label-caps w-full text-harvest">{tDesk("filterRibbon")}</p>
        <form className="flex flex-wrap items-end gap-3 text-xs">
          <label className="grid gap-1">
            {t("filterProtocol")}
            <select
              name="protocol"
              defaultValue={filters.protocol ?? ""}
              className="desk-control"
            >
              <option value="">{t("all")}</option>
              {protocols.map((protocol) => (
                <option key={protocol.id} value={protocol.id}>
                  {protocol.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            {t("filterAssetClass")}
            <select
              name="assetClass"
              defaultValue={filters.assetClass ?? ""}
              className="desk-control"
            >
              <option value="">{t("all")}</option>
              {Object.entries(ASSET_CLASS_KEYS).map(([id, key]) => (
                <option key={id} value={id}>
                  {lookupMessage(t, key)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            {t("filterInstrument")}
            <select
              name="instrument"
              defaultValue={filters.instrument ?? ""}
              className="desk-control"
            >
              <option value="">{t("all")}</option>
              {instruments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            {t("filterIssuer")}
            <select
              name="issuer"
              defaultValue={filters.issuer ?? ""}
              className="desk-control"
            >
              <option value="">{t("all")}</option>
              {issuers.map((item) => (
                <option key={item.issuerId} value={item.issuerId}>
                  {item.issuerName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            {t("filterHolder")}
            <select
              name="holder"
              defaultValue={filters.holder ?? ""}
              className="desk-control"
            >
              <option value="">{t("all")}</option>
              {holders.map((item) => (
                <option key={item.holderReference} value={item.holderReference}>
                  {item.holderName}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="desk-control px-3 font-medium text-harvest">
            {t("applyFilters")}
          </button>
        </form>
      </DeskToolbar>

      <PageSection
        title={t("instrumentsTitle")}
        description={`${tSec("registeredOwnership")} · ${t("legalOwnership")}`}
        className="mt-0"
      >
        {rows.length === 0 ? (
          <EmptyState
            kicker={t("instrumentsTitle")}
            title={tDesk("noneOnBook")}
            body={t("registryIntro")}
          />
        ) : (
          <DeskSplit
            compact={
              <DeskLedger>
                {rows.map((holding, index) => {
                  const instrument = getMarketInstrument(holding.instrumentId);
                  return (
                    <DeskRow
                      key={holding.id}
                      href={`/instruments/${holding.instrumentId}`}
                      index={deskIndex(index)}
                      kicker={instrument?.symbol ?? holding.instrumentId}
                      title={holding.holderName}
                      value={formatInteger(holding.buckets.owned, locale)}
                      hint={`${t("available")} ${formatInteger(holding.available, locale)} · ${t("reserved")} ${formatInteger(holding.buckets.reservedForOrders, locale)}`}
                    />
                  );
                })}
              </DeskLedger>
            }
            wide={
              <Table className="min-w-[64rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("instrument")}</TableHead>
                    <TableHead>{t("holder")}</TableHead>
                    <TableHead className="text-right">{t("owned")}</TableHead>
                    <TableHead className="text-right">{t("available")}</TableHead>
                    <TableHead className="text-right">{t("reserved")}</TableHead>
                    <TableHead className="text-right">{t("pledged")}</TableHead>
                    <TableHead className="text-right">{t("blocked")}</TableHead>
                    <TableHead className="text-right">{t("pendingIn")}</TableHead>
                    <TableHead className="text-right">{t("pendingOut")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((holding) => {
                    const instrument = getMarketInstrument(holding.instrumentId);
                    return (
                      <TableRow key={holding.id}>
                        <TableCell>
                          <Link
                            href={`/instruments/${holding.instrumentId}`}
                            className="text-harvest hover:underline"
                          >
                            {instrument?.symbol ?? holding.instrumentId}
                          </Link>
                        </TableCell>
                        <TableCell>{holding.holderName}</TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(holding.buckets.owned, locale)}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(holding.available, locale)}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(holding.buckets.reservedForOrders, locale)}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(holding.buckets.pledged, locale)}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(holding.buckets.blocked, locale)}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(holding.buckets.pendingIn, locale)}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(holding.buckets.pendingOut, locale)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
          />
        )}
      </PageSection>

      <PageSection title={t("transfers")}>
        <EmptyState
          kicker={t("transfers")}
          title={tDesk("transfersWaiting")}
          body={tDesk("transfersWaitingBody")}
        />
      </PageSection>
      <PageSection title={t("restrictions")}>
        <EmptyState
          kicker={t("restrictions")}
          title={tDesk("restrictionsWaiting")}
          body={tDesk("restrictionsWaitingBody")}
        />
      </PageSection>
      <PageSection title={t("corporateActions")}>
        <EmptyState
          kicker={t("corporateActions")}
          title={tDesk("actionsWaiting")}
          body={tDesk("actionsWaitingBody")}
        />
      </PageSection>
    </div>
  );
}

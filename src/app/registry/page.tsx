import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import {
  DeskFigure,
  DeskLedger,
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
import { availableBalance } from "@/domain/market-core";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requireRegistrarOrRegulator } from "@/lib/auth/guard";
import { ASSET_CLASS_KEYS } from "@/lib/market-core/presentation";
import { getPlacementSnapshot } from "@/services/placement-service";
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
  const tDesk = await getTranslations("desk");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const engine = await getSecondaryEngineState();
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
  ).map((holding) => {
    if (holding.instrumentId !== "WHEAT-2027") {
      return holding;
    }
    const owned =
      holding.holderReference === "REGISTRAR"
        ? snapshot.supply.registrarInventory
        : holding.holderReference === "INVESTOR-0001"
          ? snapshot.supply.circulating
          : holding.buckets.owned;
    const buckets = { ...holding.buckets, owned };
    return { ...holding, buckets, available: availableBalance(buckets) };
  });

  const holders = [...new Map(listHoldings().map((item) => [item.holderReference, item])).values()];
  const registrar = rows.find((row) => row.holderReference === "REGISTRAR");
  const investor = rows.find((row) => row.holderReference === "INVESTOR-0001");
  const bookTotal =
    (registrar?.buckets.owned ?? 0) + (investor?.buckets.owned ?? 0);

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
              ]}
            />
          ) : undefined
        }
      />
      <p className="mb-6 max-w-2xl text-sm text-straw">
        {t("unresolvedCustody")} {t("issuedHoldingsProof")} {t("legalOwnership")}
      </p>

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

      <PageSection title={t("instrumentsTitle")} className="mt-0">
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

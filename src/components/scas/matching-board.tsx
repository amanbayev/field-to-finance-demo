"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import {
  DeskLedger,
  DeskNote,
  DeskRow,
  DeskSplit,
  DeskToolbar,
  deskIndex,
} from "@/components/surface/desk-stage";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/domain";
import type {
  ScasActorRole,
  ScasBid,
  ScasBidStatus,
  ScasListing,
  ScasListingStatus,
} from "@/domain";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatLedgerTimestamp, formatMoney } from "@/lib/format";
import { scasPartyName } from "@/services/scas-service";

const ISSUER_ID = "iss-demo-agro";
const PRODUCER_ID = "prd-karaganda-fields";

type Actor = { role: ScasActorRole; id: string };

export function MatchingBoard({
  initialListings,
  initialBids,
}: {
  initialListings: ScasListing[];
  initialBids: ScasBid[];
}) {
  const t = useTranslations("scas.matching");
  const tScas = useTranslations("scas");
  const tUnits = useTranslations("units");
  const locale = useLocale() as AppLocale;
  const [actorRole, setActorRole] = useState<ScasActorRole>("issuer");
  const [listings, setListings] = useState(initialListings);
  const [bids, setBids] = useState(initialBids);
  const [selectedListingId, setSelectedListingId] = useState(
    initialListings[0]?.id ?? "",
  );
  const [selectedBidId, setSelectedBidId] = useState<string | null>(
    initialBids.find((bid) => bid.listingId === initialListings[0]?.id)?.id ??
      null,
  );
  const [comment, setComment] = useState("");
  const [volumeInput, setVolumeInput] = useState(
    String(initialListings[0]?.volumeTonnes ?? ""),
  );
  const [priceInput, setPriceInput] = useState(
    String(initialListings[0]?.indicativePriceKztPerTonne ?? ""),
  );
  const [bidSeq, setBidSeq] = useState(1);
  const [messageSeq, setMessageSeq] = useState(1);
  const [dacSeq, setDacSeq] = useState(1);

  const actor: Actor =
    actorRole === "issuer"
      ? { role: "issuer", id: ISSUER_ID }
      : { role: "producer", id: PRODUCER_ID };

  const selectedListing = listings.find((row) => row.id === selectedListingId);
  const listingBids = useMemo(
    () => bids.filter((bid) => bid.listingId === selectedListingId),
    [bids, selectedListingId],
  );
  const selectedBid =
    listingBids.find((bid) => bid.id === selectedBidId) ?? listingBids[0];
  const formed = bids.filter((bid) => bid.resultingContractId);

  function nextBidId() {
    const id = `BID-DEMO-${String(bidSeq).padStart(3, "0")}`;
    setBidSeq((value) => value + 1);
    return id;
  }

  function nextMessageId() {
    const id = `MSG-DEMO-${String(messageSeq).padStart(3, "0")}`;
    setMessageSeq((value) => value + 1);
    return id;
  }

  function nextContractId() {
    const id = `DAC-SCAS-${String(dacSeq).padStart(4, "0")}`;
    setDacSeq((value) => value + 1);
    return id;
  }

  function selectListing(id: string) {
    setSelectedListingId(id);
    const first = bids.find((bid) => bid.listingId === id);
    setSelectedBidId(first?.id ?? null);
    const listing = listings.find((row) => row.id === id);
    setVolumeInput(listing ? String(listing.volumeTonnes) : "");
    setPriceInput(listing ? String(listing.indicativePriceKztPerTonne) : "");
    setComment("");
  }

  function appendMessage(bidId: string, body: string) {
    const messageId = nextMessageId();
    setBids((current) =>
      current.map((bid) =>
        bid.id === bidId
          ? {
              ...bid,
              messages: [
                ...bid.messages,
                {
                  id: messageId,
                  authorId: actor.id,
                  body,
                  at: new Date().toISOString(),
                },
              ],
            }
          : bid,
      ),
    );
    setComment("");
  }

  function placeBid() {
    if (!selectedListing || !canPlaceBid(selectedListing, actor, bids)) {
      return;
    }
    const volume = Number(volumeInput || selectedListing.volumeTonnes);
    const price = Number(priceInput || selectedListing.indicativePriceKztPerTonne);
    if (!Number.isFinite(volume) || volume <= 0) {
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      return;
    }
    const bidId = nextBidId();
    const note = comment.trim();
    const messageId = note ? nextMessageId() : null;
    const bid: ScasBid = {
      id: bidId,
      listingId: selectedListing.id,
      bidderId: actor.id,
      volumeTonnes: Math.min(volume, selectedListing.volumeTonnes),
      priceKztPerTonne: price,
      deliveryPeriod: selectedListing.deliveryPeriod,
      status: "OPEN",
      messages: note && messageId
        ? [
            {
              id: messageId,
              authorId: actor.id,
              body: note,
              at: new Date().toISOString(),
            },
          ]
        : [],
    };
    setBids((current) => [...current, bid]);
    setSelectedBidId(bidId);
    setComment("");
  }

  function acceptBid(bid: ScasBid) {
    if (!selectedListing || !canDecide(selectedListing, actor, bid)) {
      return;
    }
    const contractId = nextContractId();
    const note = comment.trim();
    const messageId = note ? nextMessageId() : null;
    setListings((current) =>
      current.map((row) =>
        row.id === selectedListing.id
          ? { ...row, status: "MATCHED" satisfies ScasListingStatus }
          : row,
      ),
    );
    setBids((current) =>
      current.map((item) => {
        if (item.id === bid.id) {
          return {
            ...item,
            status: "ACCEPTED" satisfies ScasBidStatus,
            resultingContractId: contractId,
            messages: note && messageId
              ? [
                  ...item.messages,
                  {
                    id: messageId,
                    authorId: actor.id,
                    body: note,
                    at: new Date().toISOString(),
                  },
                ]
              : item.messages,
          };
        }
        if (item.listingId === selectedListing.id && item.status === "OPEN") {
          return { ...item, status: "REJECTED" satisfies ScasBidStatus };
        }
        return item;
      }),
    );
    setComment("");
  }

  function rejectBid(bid: ScasBid) {
    if (!selectedListing || !canDecide(selectedListing, actor, bid)) {
      return;
    }
    const note = comment.trim();
    const messageId = note ? nextMessageId() : null;
    setBids((current) =>
      current.map((item) =>
        item.id === bid.id
          ? {
              ...item,
              status: "REJECTED" satisfies ScasBidStatus,
              messages: note && messageId
                ? [
                    ...item.messages,
                    {
                      id: messageId,
                      authorId: actor.id,
                      body: note,
                      at: new Date().toISOString(),
                    },
                  ]
                : item.messages,
            }
          : item,
      ),
    );
    setComment("");
  }

  function withdrawBid(bid: ScasBid) {
    if (bid.bidderId !== actor.id || bid.status !== "OPEN") {
      return;
    }
    setBids((current) =>
      current.map((item) =>
        item.id === bid.id
          ? { ...item, status: "WITHDRAWN" satisfies ScasBidStatus }
          : item,
      ),
    );
  }

  return (
    <div>
      <DeskNote className="mb-6">{t("demoNote")}</DeskNote>
      <DeskToolbar>
        <span className="label-caps text-straw">{t("actAs")}</span>
        <Button
          size="xs"
          variant={actorRole === "issuer" ? "default" : "outline"}
          onClick={() => setActorRole("issuer")}
        >
          {t("actIssuer")}
        </Button>
        <Button
          size="xs"
          variant={actorRole === "producer" ? "default" : "outline"}
          onClick={() => setActorRole("producer")}
        >
          {t("actProducer")}
        </Button>
        <span className="text-sm text-straw">
          {t("actingAs", { name: scasPartyName(actor.id) })}
        </span>
      </DeskToolbar>

      <DeskSplit
        compact={
          <DeskLedger className="mb-10">
            {listings.map((listing, index) => (
              <DeskRow
                key={listing.id}
                onSelect={() => selectListing(listing.id)}
                active={listing.id === selectedListingId}
                index={deskIndex(index)}
                kicker={lookupMessage(t, `sides.${listing.side}`)}
                title={listing.id}
                value={tUnits("tonnes", {
                  value: formatInteger(listing.volumeTonnes, locale),
                })}
                hint={`${scasPartyName(listing.ownerId)} · ${listing.crop}, ${listing.quality}`}
              />
            ))}
          </DeskLedger>
        }
        wide={
          <Table className="mb-10 min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <StickyHead>{t("columns.id")}</StickyHead>
                <TableHead>{t("columns.side")}</TableHead>
                <TableHead>{t("columns.owner")}</TableHead>
                <TableHead>{t("columns.crop")}</TableHead>
                <TableHead>{t("columns.volume")}</TableHead>
                <TableHead>{t("columns.delivery")}</TableHead>
                <TableHead>{t("columns.price")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listings.map((listing) => (
                <TableRow
                  key={listing.id}
                  data-state={listing.id === selectedListingId ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => selectListing(listing.id)}
                >
                  <StickyCell className="font-tabular text-xs">{listing.id}</StickyCell>
                  <TableCell>{lookupMessage(t, `sides.${listing.side}`)}</TableCell>
                  <TableCell>{scasPartyName(listing.ownerId)}</TableCell>
                  <TableCell>
                    {listing.crop}, {listing.quality}
                  </TableCell>
                  <TableCell className="font-tabular">
                    {tUnits("tonnes", {
                      value: formatInteger(listing.volumeTonnes, locale),
                    })}
                  </TableCell>
                  <TableCell>{listing.deliveryPeriod}</TableCell>
                  <TableCell className="font-tabular text-xs">
                    {t("perTonne", {
                      value: formatMoney(
                        money(listing.indicativePriceKztPerTonne, "KZT"),
                        locale,
                      ),
                    })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={listing.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />

      {selectedListing ? (
        <PageSection
          title={t("detailTitle", { id: selectedListing.id })}
          description={lookupMessage(t, `terms.${selectedListing.termsKey}`)}
        >
          <p className="mb-6 max-w-2xl text-sm text-straw">
            {t("related")}:{" "}
            {selectedListing.relatedContractId ? (
              <Link
                href={`/contracts/${selectedListing.relatedContractId}`}
                className="font-tabular text-harvest hover:underline"
              >
                {selectedListing.relatedContractId}
              </Link>
            ) : (
              t("noRelated")
            )}
            <span className="mx-3 text-harvest/40">·</span>
            {t("indicative")}:{" "}
            {t("perTonne", {
              value: formatMoney(
                money(selectedListing.indicativePriceKztPerTonne, "KZT"),
                locale,
              ),
            })}
          </p>

          {listingBids.length === 0 ? (
            <EmptyState
              kicker={t("placeBid")}
              title={t("noBidsTitle")}
              body={t("noBids")}
            />
          ) : (
            <DeskSplit
              compact={
                <DeskLedger>
                  {listingBids.map((bid, index) => (
                    <DeskRow
                      key={bid.id}
                      onSelect={() => setSelectedBidId(bid.id)}
                      active={bid.id === selectedBid?.id}
                      index={deskIndex(index)}
                      kicker={scasPartyName(bid.bidderId)}
                      title={bid.id}
                      value={t("perTonne", {
                        value: formatMoney(money(bid.priceKztPerTonne, "KZT"), locale),
                      })}
                      hint={tUnits("tonnes", {
                        value: formatInteger(bid.volumeTonnes, locale),
                      })}
                    />
                  ))}
                </DeskLedger>
              }
              wide={
                <Table className="min-w-[40rem]">
                  <TableHeader>
                    <TableRow>
                      <StickyHead>{t("columns.bid")}</StickyHead>
                      <TableHead>{t("columns.bidder")}</TableHead>
                      <TableHead>{t("columns.volume")}</TableHead>
                      <TableHead>{t("columns.price")}</TableHead>
                      <TableHead>{t("columns.status")}</TableHead>
                      <TableHead>{t("columns.dac")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listingBids.map((bid) => (
                      <TableRow
                        key={bid.id}
                        data-state={bid.id === selectedBid?.id ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => setSelectedBidId(bid.id)}
                      >
                        <StickyCell className="font-tabular text-xs">{bid.id}</StickyCell>
                        <TableCell>{scasPartyName(bid.bidderId)}</TableCell>
                        <TableCell className="font-tabular">
                          {tUnits("tonnes", {
                            value: formatInteger(bid.volumeTonnes, locale),
                          })}
                        </TableCell>
                        <TableCell className="font-tabular text-xs">
                          {t("perTonne", {
                            value: formatMoney(
                              money(bid.priceKztPerTonne, "KZT"),
                              locale,
                            ),
                          })}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={bid.status} />
                        </TableCell>
                        <TableCell className="font-tabular text-xs">
                          {bid.resultingContractId ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          )}

          {selectedBid ? (
            <div className="mt-8">
              <p className="label-caps text-harvest">
                {t("threadTitle", { id: selectedBid.id })}
              </p>
              <ul className="mt-3 divide-y divide-harvest/15 border-y border-harvest/20">
                {selectedBid.messages.length === 0 ? (
                  <li className="py-4 text-sm text-straw">{t("noMessages")}</li>
                ) : (
                  selectedBid.messages.map((message) => (
                    <li key={message.id} className="py-4 text-sm">
                      <span className="font-tabular text-[11px] text-straw">
                        {formatLedgerTimestamp(message.at, locale)} ·{" "}
                        {scasPartyName(message.authorId)}
                      </span>
                      <p className="mt-1 text-bone">
                        {message.body ??
                          (message.bodyKey
                            ? lookupMessage(t, `thread.${message.bodyKey}`)
                            : "")}
                      </p>
                    </li>
                  ))
                )}
              </ul>
              {canComment(selectedListing, actor, selectedBid) ? (
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={2}
                  className="desk-control mt-4 h-auto min-h-16 w-full px-3 py-2"
                  placeholder={t("commentPlaceholder")}
                />
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {canComment(selectedListing, actor, selectedBid) ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!comment.trim()}
                    onClick={() => appendMessage(selectedBid.id, comment.trim())}
                  >
                    {t("sendComment")}
                  </Button>
                ) : null}
                {canDecide(selectedListing, actor, selectedBid) ? (
                  <>
                    <Button size="xs" onClick={() => acceptBid(selectedBid)}>
                      {t("accept")}
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => rejectBid(selectedBid)}
                    >
                      {tScas("reject")}
                    </Button>
                  </>
                ) : null}
                {selectedBid.bidderId === actor.id &&
                selectedBid.status === "OPEN" ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => withdrawBid(selectedBid)}
                  >
                    {t("withdraw")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {canPlaceBid(selectedListing, actor, bids) ? (
            <div className="mt-8 border-y border-harvest/20 py-6">
              <p className="label-caps text-harvest">{t("placeBid")}</p>
              <div className="mt-4 flex flex-wrap gap-4">
                <label className="text-xs text-straw">
                  {t("columns.volume")}
                  <input
                    value={volumeInput}
                    onChange={(event) => setVolumeInput(event.target.value)}
                    inputMode="numeric"
                    className="desk-control ml-2 w-28"
                  />
                </label>
                <label className="text-xs text-straw">
                  {t("columns.price")}
                  <input
                    value={priceInput}
                    onChange={(event) => setPriceInput(event.target.value)}
                    inputMode="numeric"
                    className="desk-control ml-2 w-32"
                  />
                </label>
              </div>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={2}
                className="desk-control mt-4 h-auto min-h-16 w-full px-3 py-2"
                placeholder={t("commentPlaceholder")}
              />
              <Button size="xs" className="mt-4" onClick={placeBid}>
                {t("submitBid")}
              </Button>
            </div>
          ) : selectedListing.ownerId === actor.id ? (
            <DeskNote className="mt-6">{t("ownListing")}</DeskNote>
          ) : null}
        </PageSection>
      ) : null}

      <PageSection title={t("formedTitle")} description={t("formedIntro")}>
        {formed.length === 0 ? (
          <EmptyState
            kicker={t("formedTitle")}
            title={t("noFormedTitle")}
            body={t("noFormed")}
          />
        ) : (
          <DeskLedger>
            {formed.map((bid, index) => (
              <DeskRow
                key={bid.id}
                index={deskIndex(index)}
                kicker={bid.listingId}
                title={bid.resultingContractId ?? "—"}
                hint={t("formedLine", {
                  listing: bid.listingId,
                  bidder: scasPartyName(bid.bidderId),
                })}
              />
            ))}
          </DeskLedger>
        )}
      </PageSection>
    </div>
  );
}

function canPlaceBid(
  listing: ScasListing,
  actor: Actor,
  bids: ScasBid[],
): boolean {
  if (listing.status !== "OPEN" || listing.ownerId === actor.id) {
    return false;
  }
  if (actor.role === "issuer" && listing.side !== "OFFER") {
    return false;
  }
  if (actor.role === "producer" && listing.side !== "DEMAND") {
    return false;
  }
  return !bids.some(
    (bid) =>
      bid.listingId === listing.id &&
      bid.bidderId === actor.id &&
      bid.status === "OPEN",
  );
}

function canDecide(listing: ScasListing, actor: Actor, bid: ScasBid): boolean {
  return (
    listing.ownerId === actor.id &&
    listing.status === "OPEN" &&
    bid.status === "OPEN"
  );
}

function canComment(listing: ScasListing, actor: Actor, bid: ScasBid): boolean {
  return (
    bid.status === "OPEN" &&
    (bid.bidderId === actor.id || listing.ownerId === actor.id)
  );
}

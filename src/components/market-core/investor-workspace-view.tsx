import Link from "next/link";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import {
  DeskLedger,
  DeskNote,
  DeskRow,
  DeskSplit,
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
import type { AppLocale } from "@/i18n/config";
import { lookupMessage } from "@/i18n/t-dynamic";
import { formatInteger, formatTimestamp } from "@/lib/format";
import { HOLDING_BUCKETS } from "@/lib/market-core/instrument-shell";
import { portfolioTrail } from "@/lib/market-core/hierarchy";
import {
  presentWorkspaceEligibility,
  presentWorkspaceExecution,
  presentWorkspaceOrder,
  workspaceTradeLifecycleKey,
} from "@/lib/market-core/investor-workspace-presentation";
import type { InvestorWorkspaceReady } from "@/lib/market-core/investor-workspace";

type Translate = (key: string) => string;

function scopedTranslate(translate: (key: never) => string): Translate {
  return (key) => lookupMessage(translate, key);
}

function availableRows<T>(
  value: readonly T[] | { readonly unavailable: true },
): readonly T[] | null {
  return typeof value === "object" && value !== null && "unavailable" in value
    ? null
    : value;
}

/**
 * Institutional investor workspace renderer.
 *
 * Callers: `src/app/portfolio/page.tsx` (production `/portfolio` route) and
 * `src/lib/market-core/investor-workspace-view.test.ts`. This is not the
 * universal instrument shell and not a second order-entry or cancellation
 * surface. It renders an already-composed `InvestorWorkspaceReady` read model
 * and performs no fetch, SQL, valuation or mutation.
 */
export function InvestorWorkspaceView({
  workspace,
  locale,
  translate,
  translateCore,
  translateEligibility,
}: {
  workspace: InvestorWorkspaceReady;
  locale: AppLocale;
  translate: (key: never) => string;
  translateCore: (key: never) => string;
  translateEligibility: (key: never) => string;
}) {
  const t = scopedTranslate(translate);
  const tCore = scopedTranslate(translateCore);
  const tElig = scopedTranslate(translateEligibility);
  const provenance =
    workspace.holdingsProvenance === "CANONICAL_WITH_WORKING_OVERLAY"
      ? t("provenanceOverlay")
      : t("provenanceCanonical");
  const activity = workspace.overview.activity;
  const lifecycleCounts =
    activity.kind === "AVAILABLE"
      ? activity.executionsByLifecycle.filter((row) => row.count > 0)
      : [];
  const orders = availableRows(workspace.orders);
  const executions = availableRows(workspace.executions);

  return (
    <div className="min-w-0">
      <MarketCoreContextHeader
        level="PLATFORM"
        trail={portfolioTrail()}
        translate={translateCore}
        title={t("title")}
        description={t("intro")}
      />
      <DeskNote className="mb-3">{provenance}</DeskNote>
      <DeskNote className="mb-3">{t("noValuation")}</DeskNote>
      <DeskNote className="mb-8">{t("holdingsAreQuantities")}</DeskNote>

      <PageSection title={t("overviewTitle")}>
        <MetricStrip>
          <MetricCell
            label={t("overviewInstruments")}
            value={formatInteger(workspace.overview.instrumentCount, locale)}
          />
          <MetricCell
            label={t("overviewProtocols")}
            value={formatInteger(workspace.overview.protocolCount, locale)}
          />
          {activity.kind === "AVAILABLE" ? (
            <>
              <MetricCell
                label={t("overviewOpenOrders")}
                value={formatInteger(activity.openOrderCount, locale)}
              />
              <MetricCell
                label={t("overviewReservations")}
                value={formatInteger(activity.reservationsRequiringAttention, locale)}
              />
            </>
          ) : null}
        </MetricStrip>
        {activity.kind === "UNAVAILABLE" ? (
          <DeskNote className="mt-4">{t("activityUnavailable")}</DeskNote>
        ) : null}
        {lifecycleCounts.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-sm font-medium">{t("overviewExecutions")}</h3>
            <ul className="mt-2 grid gap-2 text-sm">
              {lifecycleCounts.map((row) => (
                <li key={row.status} className="flex justify-between gap-4">
                  <span>{t(workspaceTradeLifecycleKey(row.status))}</span>
                  <span className="font-tabular">{formatInteger(row.count, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </PageSection>

      <PageSection title={t("holdingsTitle")} description={t("holdingsIntro")}>
        {workspace.protocolGroups.length === 0 ? (
          <EmptyState illustration="none">{t("holdingsEmpty")}</EmptyState>
        ) : (
          workspace.protocolGroups.map((group) => (
            <section key={group.protocolId} className="mb-8 last:mb-0">
              <h3 className="text-base font-medium">{group.protocolName}</h3>
              <DeskSplit
                compact={
                  <DeskLedger className="mt-3">
                    {group.instruments.map((row, index) => (
                      <DeskRow
                        key={row.holdingId}
                        href={row.instrumentHref}
                        index={deskIndex(index)}
                        title={row.instrumentSymbol}
                        hint={
                          row.protocolVersionId
                            ? row.protocolVersionId
                            : t("protocolVersionUnbound")
                        }
                        block={
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            {HOLDING_BUCKETS.map((bucket) => (
                              <div key={bucket.id} className="flex justify-between gap-2">
                                <dt className="text-straw">{tCore(bucket.labelKey)}</dt>
                                <dd className="font-tabular">
                                  {formatInteger(row.buckets[bucket.id], locale)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        }
                      />
                    ))}
                  </DeskLedger>
                }
                wide={
                  <Table className="mt-3 min-w-[40rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("columnInstrument")}</TableHead>
                        {HOLDING_BUCKETS.map((bucket) => (
                          <TableHead key={bucket.id} className="text-right">
                            {tCore(bucket.labelKey)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.instruments.map((row) => (
                        <TableRow key={row.holdingId}>
                          <TableCell>
                            <Link
                              href={row.instrumentHref}
                              className="text-primary hover:underline"
                            >
                              {row.instrumentSymbol}
                            </Link>
                          </TableCell>
                          {HOLDING_BUCKETS.map((bucket) => (
                            <TableCell key={bucket.id} className="text-right font-tabular">
                              {formatInteger(row.buckets[bucket.id], locale)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
              />
            </section>
          ))
        )}
      </PageSection>

      <PageSection title={t("eligibilityTitle")} description={t("eligibilityIntro")}>
        {workspace.eligibility.length === 0 ? (
          <EmptyState illustration="none">{t("eligibilityEmpty")}</EmptyState>
        ) : (
          <DeskSplit
            compact={
              <DeskLedger>
                {workspace.eligibility.map((row, index) => {
                  const presented = presentWorkspaceEligibility(row);
                  return (
                    <DeskRow
                      key={row.instrumentId}
                      href={row.instrumentHref}
                      index={deskIndex(index)}
                      title={row.instrumentSymbol}
                      value={
                        <MarketStatusChip
                          label={tElig(presented.eligibility.stateKey)}
                          tone={presented.eligibility.tone}
                        />
                      }
                      block={
                        <EligibilityBlock
                          presented={presented}
                          translate={t}
                          translateEligibility={tElig}
                        />
                      }
                    />
                  );
                })}
              </DeskLedger>
            }
            wide={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnInstrument")}</TableHead>
                    <TableHead>{tElig("labelInstrumentEligibility")}</TableHead>
                    <TableHead>{tElig("labelNewOrderAdmission")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.eligibility.map((row) => {
                    const presented = presentWorkspaceEligibility(row);
                    return (
                      <TableRow key={row.instrumentId}>
                        <TableCell>
                          <Link
                            href={row.instrumentHref}
                            className="text-primary hover:underline"
                          >
                            {row.instrumentSymbol}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <MarketStatusChip
                            label={tElig(presented.eligibility.stateKey)}
                            tone={presented.eligibility.tone}
                          />
                        </TableCell>
                        <TableCell>{tElig(presented.admission.summaryKey)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
          />
        )}
        <DeskNote className="mt-4">{t("cancellationIndependent")}</DeskNote>
      </PageSection>

      <PageSection title={t("ordersTitle")}>
        {orders === null ? (
          <EmptyState illustration="none">{t("ordersUnavailable")}</EmptyState>
        ) : orders.length === 0 ? (
          <EmptyState illustration="none">{t("ordersEmpty")}</EmptyState>
        ) : (
          <DeskSplit
            compact={
              <DeskLedger>
                {orders.map((row, index) => {
                  const presented = presentWorkspaceOrder(row);
                  return (
                    <DeskRow
                      key={row.id}
                      href={row.instrumentHref}
                      index={deskIndex(index)}
                      title={row.instrumentSymbol}
                      value={t(presented.statusKey)}
                      hint={`${t(presented.sideKey)} · ${formatInteger(row.remainingQuantity, locale)}`}
                      block={
                        <dl className="grid grid-cols-1 gap-1 text-sm">
                          <div className="flex justify-between gap-2">
                            <dt className="text-straw">{t("columnLimitPrice")}</dt>
                            <dd className="font-tabular">
                              {formatInteger(row.limitPrice, locale)} {t("demonstratorUnit")}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-straw">{t("columnOriginalQty")}</dt>
                            <dd className="font-tabular">
                              {formatInteger(row.originalQuantity, locale)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-straw">{t("columnReservation")}</dt>
                            <dd>{t(presented.reservationKey)}</dd>
                          </div>
                        </dl>
                      }
                    />
                  );
                })}
              </DeskLedger>
            }
            wide={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnInstrument")}</TableHead>
                    <TableHead>{t("columnSide")}</TableHead>
                    <TableHead className="text-right">{t("columnLimitPrice")}</TableHead>
                    <TableHead className="text-right">{t("columnOriginalQty")}</TableHead>
                    <TableHead className="text-right">{t("columnRemainingQty")}</TableHead>
                    <TableHead>{t("columnStatus")}</TableHead>
                    <TableHead>{t("columnReservation")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((row) => {
                    const presented = presentWorkspaceOrder(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link
                            href={row.instrumentHref}
                            className="text-primary hover:underline"
                          >
                            {row.instrumentSymbol}
                          </Link>
                        </TableCell>
                        <TableCell>{t(presented.sideKey)}</TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(row.limitPrice, locale)} {t("demonstratorUnit")}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(row.originalQuantity, locale)}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(row.remainingQuantity, locale)}
                        </TableCell>
                        <TableCell>{t(presented.statusKey)}</TableCell>
                        <TableCell>{t(presented.reservationKey)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
          />
        )}
      </PageSection>

      <PageSection title={t("executionsTitle")} description={t("executionsIntro")}>
        {executions === null ? (
          <EmptyState illustration="none">{t("executionsUnavailable")}</EmptyState>
        ) : executions.length === 0 ? (
          <EmptyState illustration="none">{t("executionsEmpty")}</EmptyState>
        ) : (
          <DeskSplit
            compact={
              <DeskLedger>
                {executions.map((row, index) => {
                  const presented = presentWorkspaceExecution(row);
                  return (
                    <DeskRow
                      key={row.id}
                      href={row.instrumentHref}
                      index={deskIndex(index)}
                      title={row.instrumentSymbol}
                      value={t(presented.lifecycleKey)}
                      hint={
                        row.createdAt
                          ? formatTimestamp(row.createdAt, locale)
                          : tElig("dateNotClaimed")
                      }
                      block={
                        <dl className="grid grid-cols-1 gap-1 text-sm">
                          <div className="flex justify-between gap-2">
                            <dt className="text-straw">{t("columnQuantity")}</dt>
                            <dd className="font-tabular">
                              {formatInteger(row.quantity, locale)}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-straw">{t("columnLimitPrice")}</dt>
                            <dd className="font-tabular">
                              {formatInteger(row.price, locale)} {t("demonstratorUnit")}
                            </dd>
                          </div>
                        </dl>
                      }
                    />
                  );
                })}
              </DeskLedger>
            }
            wide={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnInstrument")}</TableHead>
                    <TableHead className="text-right">{t("columnQuantity")}</TableHead>
                    <TableHead className="text-right">{t("columnLimitPrice")}</TableHead>
                    <TableHead>{t("columnTime")}</TableHead>
                    <TableHead>{t("columnLifecycle")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.map((row) => {
                    const presented = presentWorkspaceExecution(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Link
                            href={row.instrumentHref}
                            className="text-primary hover:underline"
                          >
                            {row.instrumentSymbol}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(row.quantity, locale)}
                        </TableCell>
                        <TableCell className="text-right font-tabular">
                          {formatInteger(row.price, locale)} {t("demonstratorUnit")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.createdAt
                            ? formatTimestamp(row.createdAt, locale)
                            : tElig("dateNotClaimed")}
                        </TableCell>
                        <TableCell>{t(presented.lifecycleKey)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
          />
        )}
      </PageSection>

      <PageSection title={t("workflowTitle")}>
        <ul className="grid gap-2 text-sm">
          {workspace.secondaryHref ? (
            <li>
              <Link href={workspace.secondaryHref} className="text-primary hover:underline">
                {t("linkSecondary")}
              </Link>
              <span className="text-straw"> — {t("openSecondary")}</span>
            </li>
          ) : null}
          {workspace.marketsHref ? (
            <li>
              <Link href={workspace.marketsHref} className="text-primary hover:underline">
                {t("linkMarkets")}
              </Link>
            </li>
          ) : null}
        </ul>
      </PageSection>
    </div>
  );
}

function EligibilityBlock({
  presented,
  translate: t,
  translateEligibility: tElig,
}: {
  presented: ReturnType<typeof presentWorkspaceEligibility>;
  translate: Translate;
  translateEligibility: Translate;
}) {
  return (
    <div className="text-sm">
      <p>{tElig(presented.eligibility.summaryKey)}</p>
      <p className="mt-1">
        {presented.admission.kind === "ALLOWED" ? t("newOrderReady") : t("newOrderNotReady")}
      </p>
      {presented.eligibility.gapKeys.length > 0 ||
      presented.eligibility.inconsistencyKeys.length > 0 ? (
        <details className="mt-2">
          <summary>{tElig("assessmentDetails")}</summary>
          <ul className="mt-2 list-disc ps-5">
            {presented.eligibility.gapKeys.map((key) => (
              <li key={key}>{tElig(key)}</li>
            ))}
            {presented.eligibility.inconsistencyKeys.map((key) => (
              <li key={key}>{tElig(key)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

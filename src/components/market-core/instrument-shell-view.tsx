import type { ReactNode } from "react";
import Link from "next/link";
import { TokenMintProofPanel } from "@/components/tokens/token-mint-proof-panel";
import { InstrumentSectionNav } from "@/components/market-core/instrument-section-nav";
import { MarketClearingSplit } from "@/components/market-core/market-clearing-split";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { SpvStack } from "@/components/market-core/spv-stack";
import { DataList } from "@/components/shared/data-list";
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
import { INSTRUMENT_SECTIONS, type InstrumentSection } from "@/domain/market-core";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatPercent } from "@/lib/format";
import {
  ASSET_CLASS_KEYS,
  INSTRUMENT_SECTION_KEYS,
} from "@/lib/market-core/presentation";
import {
  HOLDING_BUCKETS,
  holdingBucketValues,
  type InstrumentShellContext,
} from "@/lib/market-core/instrument-shell";
import {
  isChainMintProofSlot,
  type InstrumentBasisFact,
  type InstrumentBasisValue,
  type InstrumentProtocolSlot,
} from "@/lib/market-core/instrument-basis-adapter";

type Translate = (key: string) => string;

function scopedTranslate(translate: (key: never) => string): Translate {
  return (key) => lookupMessage(translate, key);
}

/**
 * Universal instrument renderer. Branches only on generic lifecycle and
 * typed adapter-result variants. It must not switch on instrument id,
 * protocol id, or asset class.
 *
 * Token mint proof is a `chainMintProof` protocol slot. That slot is a
 * generic chain-evidence variant, not a WHEAT/F2F conditional. F2F is the
 * only production producer of the slot.
 */
export function InstrumentShellView({
  context,
  section,
  locale,
  translate,
  renderProtocolSlot,
}: {
  context: InstrumentShellContext;
  section: InstrumentSection;
  locale: AppLocale;
  translate: (key: never) => string;
  renderProtocolSlot?: (
    slot: InstrumentProtocolSlot,
    locale: AppLocale,
  ) => ReactNode;
}) {
  const t = scopedTranslate(translate);
  const { instrument } = context;
  const withheld = !context.mayShowEconomics;
  const sectionLabels = Object.fromEntries(
    INSTRUMENT_SECTIONS.map((item) => [
      item,
      lookupMessage(t, INSTRUMENT_SECTION_KEYS[item]),
    ]),
  ) as Record<InstrumentSection, string>;

  return (
    <div className="min-w-0">
      <MarketCoreContextHeader
        level="INSTRUMENT"
        trail={[...context.trail]}
        title={instrument.symbol}
        description={instrument.name}
        translate={translate}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        {withheld ? (
          <>
            <MarketStatusChip
              label={
                instrument.instrumentType === "PROTOCOL_INVESTMENT"
                  ? t("protocolInvestmentStatus")
                  : lookupMessage(t, `status${instrument.status}`)
              }
              tone={instrument.status}
            />
            <MarketStatusChip label={t("noOffering")} tone="FUTURE" />
            <MarketStatusChip label={t("notIssued")} tone="FUTURE" />
            <MarketStatusChip label={t("notAdmitted")} tone="FUTURE" />
          </>
        ) : (
          <>
            <MarketStatusChip
              label={lookupMessage(t, `type${instrument.instrumentType}`)}
              tone="ACTIVE"
            />
            <MarketStatusChip
              label={
                instrument.status === "ISSUED"
                  ? t("issuedDemonstratorInstrument")
                  : lookupMessage(t, `status${instrument.status}`)
              }
              tone={instrument.status}
            />
          </>
        )}
      </div>
      {instrument.instrumentType === "PROTOCOL_INVESTMENT" ? (
        <DeskNote className="mb-4">
          {t("protocolInvestmentNote")} {t("protocolInvestmentFlags")}
        </DeskNote>
      ) : null}

      <InstrumentSectionNav
        instrumentId={instrument.id}
        active={section}
        labels={sectionLabels}
        ariaLabel={t("instrumentsTitle")}
      />

      {section === "overview" ? (
        <OverviewSection context={context} locale={locale} translate={t} />
      ) : null}
      {section === "terms" ? (
        <TermsSection context={context} locale={locale} translate={t} />
      ) : null}
      {section === "basis" ? (
        <BasisSection context={context} locale={locale} translate={t} />
      ) : null}
      {section === "risk" ? (
        <RiskSection context={context} locale={locale} translate={t} />
      ) : null}
      {section === "market" ? <MarketSection context={context} translate={t} /> : null}
      {section === "clearing" ? (
        <ClearingSection context={context} translate={t} />
      ) : null}
      {section === "ownership" ? (
        <OwnershipSection context={context} locale={locale} translate={t} />
      ) : null}
      {section === "documents" ? <EmptyState>{t("documentsEmpty")}</EmptyState> : null}
      {section === "audit" ? (
        <AuditSection
          context={context}
          locale={locale}
          translate={t}
          renderProtocolSlot={renderProtocolSlot}
        />
      ) : null}
    </div>
  );
}

function OverviewSection({
  context,
  locale,
  translate: t,
}: {
  context: InstrumentShellContext;
  locale: AppLocale;
  translate: Translate;
}) {
  const { instrument, protocol, protocolVersion, versionHref, basis } = context;
  const protocolValue = protocol ? (
    <Link href={`/protocols/${protocol.id}`} className="text-primary hover:underline">
      {protocol.name}
    </Link>
  ) : (
    t("protocolRecordUnavailable")
  );
  const versionValue =
    protocolVersion && versionHref ? (
      <Link href={versionHref} className="text-primary hover:underline">
        {`${protocolVersion.id} · ${protocolVersion.displayVersion}`}
      </Link>
    ) : (
      t("notBoundToProtocolVersion")
    );
  const overviewMetrics = basis.kind === "AVAILABLE" ? basis.overviewMetrics : [];

  return (
    <div className="space-y-8">
      <DataList
        items={[
          {
            label: t("assetClass"),
            value: lookupMessage(t, ASSET_CLASS_KEYS[instrument.assetClass]),
          },
          { label: t("levelProtocol"), value: protocolValue },
          { label: t("boundProtocolVersion"), value: versionValue },
          { label: t("rowSpv"), value: instrument.issuerName },
          {
            label: t("issuance"),
            value: instrument.issuanceId ?? t("issuanceNotRecorded"),
          },
          { label: t("regulatory"), value: t("demonstratorOnly") },
        ]}
      />
      <p className="text-xs text-straw">
        {protocolVersion ? t("boundAtIssuance") : t("notBoundToProtocolVersion")}
      </p>
      <SpvStack
        title={t("spvTitle")}
        rows={[
          {
            label: t("rowProtocol"),
            value: protocol?.name ?? t("protocolRecordUnavailable"),
          },
          { label: t("rowSpv"), value: instrument.issuerName },
          { label: t("rowInstrument"), value: instrument.symbol },
          { label: t("rowMarket"), value: t("marketCore") },
        ]}
      />
      {overviewMetrics.length > 0 ? (
        <MetricStrip className="sm:grid-cols-2 lg:grid-cols-4">
          {overviewMetrics.map((metric) => (
            <MetricCell
              key={metric.id}
              label={lookupMessage(t, metric.labelKey)}
              value={formatBasisValue(metric.value, t, locale)}
            />
          ))}
        </MetricStrip>
      ) : (
        <EmptyState>
          {context.mayShowEconomics ? t("noFakeEconomics") : t("economicsWithheldNotIssued")}
        </EmptyState>
      )}
    </div>
  );
}

function TermsSection({
  context,
  locale,
  translate: t,
}: {
  context: InstrumentShellContext;
  locale: AppLocale;
  translate: Translate;
}) {
  if (!context.mayShowEconomics) {
    return <EmptyState>{t("termsNotOffered")}</EmptyState>;
  }
  const adapterTerms = context.basis.kind === "AVAILABLE" ? context.basis.terms : [];
  const terms =
    adapterTerms.length > 0
      ? adapterTerms
      : [
          {
            id: "denomination",
            labelKey: "denomination",
            value: {
              kind: "TEXT" as const,
              text: context.instrument.denomination,
            },
          },
        ];
  if (context.basis.kind === "UNAVAILABLE" && adapterTerms.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState>{t("termsUnavailable")}</EmptyState>
        <DataList items={terms.map((item) => factToItem(item, t, locale))} />
      </div>
    );
  }
  return <DataList items={terms.map((item) => factToItem(item, t, locale))} />;
}

function BasisSection({
  context,
  locale,
  translate: t,
}: {
  context: InstrumentShellContext;
  locale: AppLocale;
  translate: Translate;
}) {
  if (!context.mayShowEconomics) {
    return <EmptyState>{t("economicsWithheldNotIssued")}</EmptyState>;
  }
  if (context.basis.kind !== "AVAILABLE") {
    return (
      <EmptyState>
        {lookupMessage(
          t,
          context.basis.kind === "UNAVAILABLE"
            ? context.basis.reasonKey
            : "basisUnavailable",
        )}
      </EmptyState>
    );
  }
  const { notices, facts, metrics } = context.basis;
  return (
    <div className="space-y-6">
      {notices.map((notice) => (
        <p key={notice.id} className="text-sm text-muted-foreground">
          {lookupMessage(t, notice.messageKey)}
        </p>
      ))}
      {facts.length > 0 ? (
        <DataList items={facts.map((item) => factToItem(item, t, locale))} />
      ) : null}
      {metrics.length > 0 ? (
        <MetricStrip>
          {metrics.map((metric) => (
            <MetricCell
              key={metric.id}
              label={lookupMessage(t, metric.labelKey)}
              value={formatBasisValue(metric.value, t, locale)}
            />
          ))}
        </MetricStrip>
      ) : null}
    </div>
  );
}

function RiskSection({
  context,
  locale,
  translate: t,
}: {
  context: InstrumentShellContext;
  locale: AppLocale;
  translate: Translate;
}) {
  if (!context.mayShowEconomics) {
    return <EmptyState>{t("riskNotOffered")}</EmptyState>;
  }
  const risks = context.basis.kind === "AVAILABLE" ? context.basis.risks : [];
  if (risks.length === 0) {
    return <EmptyState>{t("riskNotRecorded")}</EmptyState>;
  }
  return <DataList items={risks.map((item) => factToItem(item, t, locale))} />;
}

function MarketSection({
  context,
  translate: t,
}: {
  context: InstrumentShellContext;
  translate: Translate;
}) {
  if (!context.mayShowEconomics) {
    return <EmptyState>{t("marketNotOffered")}</EmptyState>;
  }
  const market = context.market;
  if (!market) {
    return <EmptyState>{t("noMarketRecorded")}</EmptyState>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {market.phase === "SECONDARY_OPEN"
          ? t("secondaryMarketOpenDemonstrator")
          : t("matchingDoesNotChangeOwnership")}
      </p>
      {market.phase === "SECONDARY_OPEN" ? (
        <p className="text-sm">
          <Link href="/secondary" className="text-primary hover:underline">
            {t("stageSECONDARY_MARKET")}
          </Link>
        </p>
      ) : null}
      <DataList
        items={[
          { label: t("sectionMarket"), value: market.id },
          {
            label: t("marketStatus"),
            value:
              market.phase === "SECONDARY_OPEN"
                ? t("closedSecondary")
                : market.phase === "PRIMARY_ONLY"
                  ? t("primaryOnly")
                  : t("marketPhaseClosed"),
          },
        ]}
      />
      <p className="text-xs text-muted-foreground">{t("matchingDoesNotChangeOwnership")}</p>
      <ClearingDiagram translate={t} includeAudit={false} />
    </div>
  );
}

function ClearingSection({
  context,
  translate: t,
}: {
  context: InstrumentShellContext;
  translate: Translate;
}) {
  if (!context.mayShowEconomics) {
    return <EmptyState>{t("clearingNotOffered")}</EmptyState>;
  }
  const notices =
    context.basis.kind === "AVAILABLE"
      ? context.basis.evidence.filter((item) => item.kind === "NOTICE")
      : [];
  return (
    <div className="space-y-4">
      <ClearingDiagram translate={t} includeAudit />
      {notices.length > 0 ? (
        notices.map((item) => (
          <PageSection key={item.id} title={lookupMessage(t, item.titleKey)}>
            <p className="text-sm">
              {item.bodyKeys.map((key) => lookupMessage(t, key)).join(" · ")}
            </p>
          </PageSection>
        ))
      ) : (
        <EmptyState>{t("clearingNotRecorded")}</EmptyState>
      )}
    </div>
  );
}

function OwnershipSection({
  context,
  locale,
  translate: t,
}: {
  context: InstrumentShellContext;
  locale: AppLocale;
  translate: Translate;
}) {
  const holdings = context.holdings;
  if (holdings.length === 0) {
    return (
      <EmptyState>
        {context.mayShowEconomics ? t("holdingsNotRecorded") : t("noFakeEconomics")}
      </EmptyState>
    );
  }
  return (
    <DeskSplit
      compact={
        <DeskLedger>
          {holdings.map((holding, index) => {
            const buckets = holdingBucketValues(holding);
            return (
              <DeskRow
                key={holding.id}
                index={deskIndex(index)}
                title={holding.holderName}
                block={
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {HOLDING_BUCKETS.map((bucket) => (
                      <div key={bucket.id} className="flex justify-between gap-2">
                        <dt className="text-straw">{lookupMessage(t, bucket.labelKey)}</dt>
                        <dd className="font-tabular">
                          {formatInteger(buckets[bucket.id], locale)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                }
              />
            );
          })}
        </DeskLedger>
      }
      wide={
        <Table className="min-w-[40rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("holder")}</TableHead>
              {HOLDING_BUCKETS.map((bucket) => (
                <TableHead key={bucket.id} className="text-right">
                  {lookupMessage(t, bucket.labelKey)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((holding) => {
              const buckets = holdingBucketValues(holding);
              return (
                <TableRow key={holding.id}>
                  <TableCell>{holding.holderName}</TableCell>
                  {HOLDING_BUCKETS.map((bucket) => (
                    <TableCell key={bucket.id} className="text-right font-tabular">
                      {formatInteger(buckets[bucket.id], locale)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      }
    />
  );
}

function AuditSection({
  context,
  locale,
  translate: t,
  renderProtocolSlot,
}: {
  context: InstrumentShellContext;
  locale: AppLocale;
  translate: Translate;
  renderProtocolSlot?: (
    slot: InstrumentProtocolSlot,
    locale: AppLocale,
  ) => ReactNode;
}) {
  const slot =
    context.mayShowEconomics && context.basis.kind === "AVAILABLE"
      ? context.basis.protocolSlot
      : null;
  return (
    <div className="space-y-6">
      <PageSection
        title={t("admissionTitle")}
        description={t("admissionIntro")}
        className="mt-0"
      >
        <p className="mb-3 text-xs text-muted-foreground">
          {t("platformWorkflow")} · {t("formalApproval")}: {t("formalApprovalNote")}
        </p>
        <DeskLedger>
          {context.admission.map((item, index) => (
            <DeskRow
              key={item.stage}
              index={deskIndex(index)}
              title={lookupMessage(t, `stage${item.stage}`)}
              value={
                <MarketStatusChip
                  label={item.complete ? t("stageComplete") : t("stageOpen")}
                  tone={item.complete ? "ACTIVE" : "FUTURE"}
                />
              }
            />
          ))}
        </DeskLedger>
      </PageSection>
      {slot ? (
        <>
          {renderProtocolSlot
            ? renderProtocolSlot(slot, locale)
            : defaultProtocolSlot(slot, locale)}
          <p className="text-xs text-muted-foreground">
            {t("tokenProofIsDemonstratorEvidence")}
          </p>
        </>
      ) : null}
      <p className="text-sm text-muted-foreground">
        <Link href="/audit" className="text-primary hover:underline">
          {t("auditLink")}
        </Link>
      </p>
    </div>
  );
}

function defaultProtocolSlot(slot: InstrumentProtocolSlot, locale: AppLocale) {
  if (!isChainMintProofSlot(slot)) {
    return null;
  }
  return (
    <TokenMintProofPanel
      lookup={slot.lookup}
      locale={locale}
      registrarInventory={slot.registrarInventory}
    />
  );
}

function ClearingDiagram({
  translate: t,
  includeAudit,
}: {
  translate: Translate;
  includeAudit: boolean;
}) {
  return (
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
        ...(includeAudit ? [t("audit")] : []),
      ]}
    />
  );
}

function formatBasisValue(
  value: InstrumentBasisValue,
  translate: Translate,
  locale: AppLocale,
): ReactNode {
  switch (value.kind) {
    case "TEXT":
      return value.text;
    case "INTEGER":
      return formatInteger(value.value, locale);
    case "PERCENT":
      return formatPercent(value.value, locale);
    case "MESSAGE":
      return lookupMessage(translate, value.messageKey);
  }
}

function factToItem(
  fact: InstrumentBasisFact,
  translate: Translate,
  locale: AppLocale,
): { label: string; value: ReactNode } {
  const formatted = formatBasisValue(fact.value, translate, locale);
  return {
    label: lookupMessage(translate, fact.labelKey),
    value: fact.href ? (
      <Link href={fact.href} className="font-tabular text-xs text-primary hover:underline">
        {formatted}
      </Link>
    ) : (
      formatted
    ),
  };
}

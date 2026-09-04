import type { ActorContext } from "@/domain/identity";
import type {
  AssetProtocol,
  Market,
  MarketInstrument,
  ProtocolVersion,
} from "@/domain/market-core";
import type { OnChainTokenMintLookup } from "@/adapters/blockchain/types";
import type { EconomicsVisibility } from "./economics-visibility";

/**
 * Categories the central economics policy treats as offering language.
 * Adapters should tag facts they consider economic so a WITHHELD lifecycle
 * can never leak them, even if an adapter is invoked by mistake.
 */
export const ECONOMIC_FACT_CATEGORIES = [
  "OFFER",
  "PRICE",
  "YIELD",
  "RETURN",
  "TERM",
  "SUBSCRIPTION",
  "REDEMPTION",
  "USE_OF_PROCEEDS",
  "MARKET_AVAILABILITY",
] as const;

export type EconomicFactCategory = (typeof ECONOMIC_FACT_CATEGORIES)[number];

export type InstrumentBasisValue =
  | { readonly kind: "TEXT"; readonly text: string }
  | { readonly kind: "INTEGER"; readonly value: number }
  | { readonly kind: "PERCENT"; readonly value: number }
  | { readonly kind: "MESSAGE"; readonly messageKey: string };

export interface InstrumentBasisFact {
  readonly id: string;
  readonly labelKey: string;
  readonly value: InstrumentBasisValue;
  readonly href?: string;
  readonly category?: EconomicFactCategory;
}

export interface InstrumentBasisMetric {
  readonly id: string;
  readonly labelKey: string;
  readonly value: InstrumentBasisValue;
  readonly category?: EconomicFactCategory;
}

export interface InstrumentBasisLink {
  readonly id: string;
  readonly labelKey: string;
  readonly href: string;
}

export interface InstrumentBasisNotice {
  readonly id: string;
  readonly messageKey: string;
}

/**
 * Opaque protocol-owned presentation slot.
 *
 * Token mint proof cannot be reduced to message keys without dropping
 * explorer / lookup semantics. Adapters may return a `chainMintProof` slot.
 * The generic shell never switches on WHEAT, F2F, or agriculture types; it
 * renders slots only through this typed variant or an injected renderer.
 * This is an explicit code-level adapter boundary, not a protocol plugin engine.
 */
export const CHAIN_MINT_PROOF_RENDERER_ID = "chainMintProof";

export interface InstrumentProtocolSlot {
  readonly rendererId: string;
}

export interface ChainMintProofSlot extends InstrumentProtocolSlot {
  readonly rendererId: typeof CHAIN_MINT_PROOF_RENDERER_ID;
  readonly lookup: OnChainTokenMintLookup;
  readonly registrarInventory: number;
}

export function isChainMintProofSlot(
  slot: InstrumentProtocolSlot,
): slot is ChainMintProofSlot {
  return slot.rendererId === CHAIN_MINT_PROOF_RENDERER_ID && "lookup" in slot;
}

export type InstrumentEvidenceDescriptor =
  | {
      readonly kind: "NOTICE";
      readonly id: string;
      readonly titleKey: string;
      readonly bodyKeys: readonly string[];
    }
  | {
      readonly kind: "PROTOCOL_SLOT";
      readonly id: string;
      readonly slot: InstrumentProtocolSlot;
    };

export const BASIS_ADAPTER_UNAVAILABLE_KEY = "basisUnavailable";
export const BASIS_DATA_UNAVAILABLE_KEY = "basisDataUnavailable";
export const BASIS_FAMILY_UNAVAILABLE_KEY = "basisUnavailableForInstrumentFamily";

export type InstrumentBasisResult =
  | {
      readonly kind: "AVAILABLE";
      readonly facts: readonly InstrumentBasisFact[];
      readonly metrics: readonly InstrumentBasisMetric[];
      readonly terms: readonly InstrumentBasisFact[];
      readonly risks: readonly InstrumentBasisFact[];
      readonly overviewMetrics: readonly InstrumentBasisMetric[];
      readonly links: readonly InstrumentBasisLink[];
      readonly notices: readonly InstrumentBasisNotice[];
      readonly evidence: readonly InstrumentEvidenceDescriptor[];
      readonly protocolSlot: InstrumentProtocolSlot | null;
    }
  | {
      readonly kind: "UNAVAILABLE";
      readonly reasonKey: string;
    }
  | {
      readonly kind: "WITHHELD";
      readonly reasonKey: string;
    };

export interface InstrumentBasisAdapterInput {
  readonly instrument: MarketInstrument;
  readonly protocol: AssetProtocol | null;
  readonly protocolVersion: ProtocolVersion | null;
  readonly market: Market | null;
  readonly actor: ActorContext;
}

/**
 * Protocol economic-basis adapter.
 *
 * May explain protocol-specific basis, metrics, disclaimers, links and
 * evidence. Must not redefine canonical instrument identity, lifecycle,
 * protocol/version binding, market state or holdings, authorize trading,
 * invent economic values, or become a second instrument catalogue.
 */
export interface InstrumentEconomicBasisAdapter {
  readonly protocolId: string;
  supports(input: InstrumentBasisAdapterInput): boolean;
  resolve(input: InstrumentBasisAdapterInput): Promise<InstrumentBasisResult>;
}

export class DuplicateProtocolAdapterError extends Error {
  constructor(readonly protocolId: string) {
    super(`Duplicate economic-basis adapter registered for protocol ${protocolId}.`);
    this.name = "DuplicateProtocolAdapterError";
  }
}

export interface InstrumentBasisAdapterRegistry {
  readonly adapters: readonly InstrumentEconomicBasisAdapter[];
  select(protocolId: string): InstrumentEconomicBasisAdapter | null;
}

export function createInstrumentBasisAdapterRegistry(
  adapters: readonly InstrumentEconomicBasisAdapter[],
): InstrumentBasisAdapterRegistry {
  const byProtocol = new Map<string, InstrumentEconomicBasisAdapter>();
  for (const adapter of adapters) {
    if (byProtocol.has(adapter.protocolId)) {
      throw new DuplicateProtocolAdapterError(adapter.protocolId);
    }
    byProtocol.set(adapter.protocolId, adapter);
  }
  return Object.freeze({
    adapters: Object.freeze([...adapters]),
    select(protocolId: string) {
      return byProtocol.get(protocolId) ?? null;
    },
  });
}

function freezeBasisValue(value: InstrumentBasisValue): InstrumentBasisValue {
  if (value.kind === "TEXT") {
    return Object.freeze({ kind: "TEXT", text: value.text });
  }
  if (value.kind === "INTEGER") {
    return Object.freeze({ kind: "INTEGER", value: value.value });
  }
  if (value.kind === "PERCENT") {
    return Object.freeze({ kind: "PERCENT", value: value.value });
  }
  return Object.freeze({ kind: "MESSAGE", messageKey: value.messageKey });
}

function freezeFact(fact: InstrumentBasisFact): InstrumentBasisFact {
  const copy: InstrumentBasisFact = {
    id: fact.id,
    labelKey: fact.labelKey,
    value: freezeBasisValue(fact.value),
    ...(fact.href !== undefined ? { href: fact.href } : {}),
    ...(fact.category !== undefined ? { category: fact.category } : {}),
  };
  return Object.freeze(copy);
}

function freezeMetric(metric: InstrumentBasisMetric): InstrumentBasisMetric {
  const copy: InstrumentBasisMetric = {
    id: metric.id,
    labelKey: metric.labelKey,
    value: freezeBasisValue(metric.value),
    ...(metric.category !== undefined ? { category: metric.category } : {}),
  };
  return Object.freeze(copy);
}

function freezeLink(link: InstrumentBasisLink): InstrumentBasisLink {
  return Object.freeze({
    id: link.id,
    labelKey: link.labelKey,
    href: link.href,
  });
}

function freezeNotice(notice: InstrumentBasisNotice): InstrumentBasisNotice {
  return Object.freeze({
    id: notice.id,
    messageKey: notice.messageKey,
  });
}

function freezeTokenMintLookup(
  lookup: OnChainTokenMintLookup,
): OnChainTokenMintLookup {
  const copy: OnChainTokenMintLookup = { status: lookup.status };
  if (lookup.createSignature !== undefined) {
    copy.createSignature = lookup.createSignature;
  }
  if (lookup.mintToSignature !== undefined) {
    copy.mintToSignature = lookup.mintToSignature;
  }
  if (lookup.mint !== undefined) {
    copy.mint = Object.freeze({ ...lookup.mint });
  }
  return Object.freeze(copy);
}

function freezeProtocolSlot(
  slot: InstrumentProtocolSlot | null,
): InstrumentProtocolSlot | null {
  if (slot === null) {
    return null;
  }
  if (isChainMintProofSlot(slot)) {
    return Object.freeze({
      rendererId: CHAIN_MINT_PROOF_RENDERER_ID,
      registrarInventory: slot.registrarInventory,
      lookup: freezeTokenMintLookup(slot.lookup),
    });
  }
  return Object.freeze({ rendererId: slot.rendererId });
}

function freezeEvidence(
  item: InstrumentEvidenceDescriptor,
): InstrumentEvidenceDescriptor {
  if (item.kind === "NOTICE") {
    return Object.freeze({
      kind: "NOTICE",
      id: item.id,
      titleKey: item.titleKey,
      bodyKeys: Object.freeze([...item.bodyKeys]),
    });
  }
  const slot = freezeProtocolSlot(item.slot);
  return Object.freeze({
    kind: "PROTOCOL_SLOT",
    id: item.id,
    slot: slot === null ? Object.freeze({ rendererId: item.slot.rendererId }) : slot,
  });
}

/**
 * Copy-then-freeze the owned result graph. Nested objects are new copies so
 * adapter-owned input is not frozen by side effect.
 */
export function freezeInstrumentBasisResult(
  result: InstrumentBasisResult,
): InstrumentBasisResult {
  if (result.kind === "UNAVAILABLE") {
    return Object.freeze({
      kind: "UNAVAILABLE",
      reasonKey: result.reasonKey,
    });
  }
  if (result.kind === "WITHHELD") {
    return Object.freeze({
      kind: "WITHHELD",
      reasonKey: result.reasonKey,
    });
  }
  return Object.freeze({
    kind: "AVAILABLE",
    facts: Object.freeze(result.facts.map(freezeFact)),
    metrics: Object.freeze(result.metrics.map(freezeMetric)),
    terms: Object.freeze(result.terms.map(freezeFact)),
    risks: Object.freeze(result.risks.map(freezeFact)),
    overviewMetrics: Object.freeze(result.overviewMetrics.map(freezeMetric)),
    links: Object.freeze(result.links.map(freezeLink)),
    notices: Object.freeze(result.notices.map(freezeNotice)),
    evidence: Object.freeze(result.evidence.map(freezeEvidence)),
    protocolSlot: freezeProtocolSlot(result.protocolSlot),
  });
}

/**
 * Central filter. A WITHHELD lifecycle always wins over adapter output, so an
 * over-eager adapter cannot place offer / price / yield / term on the shell.
 */
export function applyEconomicsVisibility(
  visibility: EconomicsVisibility,
  result: InstrumentBasisResult,
): InstrumentBasisResult {
  if (visibility.kind === "WITHHELD") {
    return freezeInstrumentBasisResult({
      kind: "WITHHELD",
      reasonKey: visibility.reasonKey,
    });
  }
  return freezeInstrumentBasisResult(result);
}

export async function resolveInstrumentBasis(
  adapters: InstrumentBasisAdapterRegistry,
  input: InstrumentBasisAdapterInput,
): Promise<InstrumentBasisResult> {
  const adapter = adapters.select(input.instrument.assetProtocolId);
  if (!adapter || !adapter.supports(input)) {
    return freezeInstrumentBasisResult({
      kind: "UNAVAILABLE",
      reasonKey: BASIS_ADAPTER_UNAVAILABLE_KEY,
    });
  }
  const resolved = await adapter.resolve(input);
  return freezeInstrumentBasisResult(resolved);
}

import type { ActorContext } from "@/domain/identity";
import type {
  AdmissionStage,
  AssetProtocol,
  Holding,
  Market,
  MarketInstrument,
  ProtocolVersion,
} from "@/domain/market-core";
import { boundProtocolVersionHref, instrumentTrail, type HierarchyCrumb } from "./hierarchy";
import {
  economicsVisibilityForInstrument,
  type EconomicsVisibility,
} from "./economics-visibility";
import {
  applyEconomicsVisibility,
  resolveInstrumentBasis,
  type InstrumentBasisAdapterRegistry,
  type InstrumentBasisResult,
} from "./instrument-basis-adapter";

/**
 * Canonical instrument-shell read model.
 *
 * Identity, lifecycle, issuer, protocol binding, issuance, market and holdings
 * come from Market Core. This object is not a second instrument record and not
 * a registry. The instrument supplied by `getInstrumentMarketContext` (or an
 * injected equivalent of that function) remains authoritative.
 */
export interface InstrumentShellCanonicalSource {
  getInstrumentMarketContext(instrumentId: string): {
    instrument: MarketInstrument;
    protocol: AssetProtocol | null;
    market: Market | null;
    protocolVersion: ProtocolVersion | null;
  } | null;
  listHoldings(filters: { instrumentId: string }): readonly Holding[];
  listAdmission(instrumentId: string): readonly {
    stage: AdmissionStage;
    complete: boolean;
  }[];
}

export const HOLDING_BUCKETS = [
  { id: "owned", labelKey: "owned" },
  { id: "available", labelKey: "available" },
  { id: "reserved", labelKey: "reserved" },
  { id: "pledged", labelKey: "pledged" },
  { id: "blocked", labelKey: "blocked" },
] as const;

export type HoldingBucketId = (typeof HOLDING_BUCKETS)[number]["id"];

export interface HoldingBucketValues {
  readonly owned: number;
  readonly available: number;
  readonly reserved: number;
  readonly pledged: number;
  readonly blocked: number;
}

export function holdingBucketValues(holding: Holding): HoldingBucketValues {
  return {
    owned: holding.buckets.owned,
    available: holding.available,
    reserved: holding.buckets.reservedForOrders,
    pledged: holding.buckets.pledged,
    blocked: holding.buckets.blocked,
  };
}

export interface InstrumentShellContext {
  readonly instrument: MarketInstrument;
  readonly protocol: AssetProtocol | null;
  readonly protocolVersion: ProtocolVersion | null;
  readonly market: Market | null;
  readonly holdings: readonly Holding[];
  readonly admission: readonly { stage: AdmissionStage; complete: boolean }[];
  readonly trail: readonly HierarchyCrumb[];
  readonly versionHref: string | undefined;
  readonly economicsVisibility: EconomicsVisibility;
  readonly mayShowEconomics: boolean;
  readonly basis: InstrumentBasisResult;
}

export interface ResolveInstrumentShellInput {
  readonly instrumentId: string;
  readonly actor: ActorContext;
  readonly canonical: InstrumentShellCanonicalSource;
  readonly adapters: InstrumentBasisAdapterRegistry;
}

export async function resolveInstrumentShell(
  input: ResolveInstrumentShellInput,
): Promise<InstrumentShellContext | null> {
  const canonical = input.canonical.getInstrumentMarketContext(input.instrumentId);
  if (!canonical) {
    return null;
  }
  const { instrument, protocol, market, protocolVersion } = canonical;
  const visibility = economicsVisibilityForInstrument(instrument);
  const adapterInput = {
    instrument,
    protocol,
    protocolVersion,
    market,
    actor: input.actor,
  };
  // Non-issued instruments do not invoke economic adapters. The visibility
  // filter still runs so a mistaken AVAILABLE result cannot leak through.
  const resolvedBasis =
    visibility.kind === "PERMITTED"
      ? await resolveInstrumentBasis(input.adapters, adapterInput)
      : { kind: "WITHHELD" as const, reasonKey: visibility.reasonKey };
  const basis = applyEconomicsVisibility(visibility, resolvedBasis);
  return Object.freeze({
    instrument,
    protocol,
    protocolVersion,
    market,
    holdings: Object.freeze(
      [...input.canonical.listHoldings({ instrumentId: instrument.id })],
    ),
    admission: Object.freeze([...input.canonical.listAdmission(instrument.id)]),
    trail: Object.freeze(instrumentTrail(instrument, protocol, protocolVersion)),
    versionHref: boundProtocolVersionHref(instrument),
    economicsVisibility: visibility,
    mayShowEconomics: visibility.kind === "PERMITTED",
    basis,
  });
}

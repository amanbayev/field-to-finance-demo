import type { ActorContext } from "@/domain/identity";
import {
  createInstrumentBasisAdapterRegistry,
  type InstrumentBasisAdapterRegistry,
} from "@/lib/market-core/instrument-basis-adapter";
import {
  resolveInstrumentShell,
  type InstrumentShellCanonicalSource,
  type InstrumentShellContext,
} from "@/lib/market-core/instrument-shell";
import { createF2fInstrumentBasisAdapter } from "@/lib/protocols/f2f/f2f-instrument-basis-adapter";
import {
  getInstrumentMarketContext,
  listAdmission,
  listHoldings,
} from "./market-core-service";

const productionCanonicalSource: InstrumentShellCanonicalSource = {
  getInstrumentMarketContext,
  listHoldings,
  listAdmission,
};

const productionAdapterRegistry = createInstrumentBasisAdapterRegistry([
  createF2fInstrumentBasisAdapter(),
]);

export function instrumentShellCanonicalSource(): InstrumentShellCanonicalSource {
  return productionCanonicalSource;
}

export function productionInstrumentBasisAdapterRegistry(): InstrumentBasisAdapterRegistry {
  return productionAdapterRegistry;
}

/**
 * Production entry: canonical Market Core plus the registered protocol
 * economic-basis adapters. Does not create a second instrument catalogue.
 */
export async function getInstrumentShellContext(
  instrumentId: string,
  actor: ActorContext,
): Promise<InstrumentShellContext | null> {
  return resolveInstrumentShell({
    instrumentId,
    actor,
    canonical: productionCanonicalSource,
    adapters: productionAdapterRegistry,
  });
}

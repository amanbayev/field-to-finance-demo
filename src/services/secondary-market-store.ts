import type { EngineState } from "@/domain/market-core";
import { seedFirstWheatSecondaryScenario } from "@/data/market-core/seed-scenario";

interface StoreBox {
  state: EngineState;
  chain: Promise<unknown>;
}

const globalStore = globalThis as typeof globalThis & {
  __mtpSecondaryMarket5b?: StoreBox;
};

function box(): StoreBox {
  if (!globalStore.__mtpSecondaryMarket5b) {
    globalStore.__mtpSecondaryMarket5b = {
      state: seedFirstWheatSecondaryScenario(),
      chain: Promise.resolve(),
    };
  }
  return globalStore.__mtpSecondaryMarket5b;
}

/**
 * In-process mutex around a cloned-state engine.
 *
 * Concurrency model:
 * - submitLimitOrder / cancelOrder clone EngineState and apply mutations atomically
 *   in memory (no partial writes).
 * - This lock serializes Preview/local requests on one Node process so two SELL
 *   reservations cannot consume the same available balance in that process.
 * - Serverless instances do not share memory. The first WHEAT scenario is seeded
 *   per process so review UI is visible without a Production Supabase migration.
 * - Distributed/database locking is specified in the additive SQL migration and
 *   is not applied to the shared Production project in this Preview stage.
 */
export async function mutateSecondaryMarket<T extends { state: EngineState }>(
  fn: (state: EngineState) => T | Promise<T>,
): Promise<T> {
  const store = box();
  const run = store.chain.then(async () => {
    const result = await fn(store.state);
    store.state = result.state;
    return result;
  });
  store.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function readSecondaryMarketState(): Promise<EngineState> {
  const result = await mutateSecondaryMarket((state) => ({ state }));
  return structuredClone(result.state);
}

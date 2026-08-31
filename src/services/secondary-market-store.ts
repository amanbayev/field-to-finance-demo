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
 * In-process store for unit-test fixtures only.
 * Preview/runtime market authority is PostgreSQL via market_core_* RPCs.
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

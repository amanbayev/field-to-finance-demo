import { DemoFxProvider } from "./demo-fx-provider";

export {
  BASE_CURRENCY,
  DEMO_USD_KZT_RATE,
  REFERENCE_CURRENCY,
} from "./config";
export type { FxProvider, FxQuote } from "./types";
export { DemoFxProvider };

export const fxProvider = new DemoFxProvider();

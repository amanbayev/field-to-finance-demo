import type { FinancingPosition } from "@/domain";
import { money } from "@/domain/money";

const exampleMarketValue = money(100_000_000, "KZT");
const examplePrincipal = money(80_000_000, "KZT");

export const financingModules: FinancingPosition[] = [
  {
    id: "fin-secured-loan",
    module: "SECURED_LOAN",
    status: "COMING_NEXT",
    marketValue: exampleMarketValue,
    haircutPercent: 20,
    principal: examplePrincipal,
  },
  {
    id: "fin-repo",
    module: "REPO",
    status: "EXPERIMENTAL",
    marketValue: exampleMarketValue,
    haircutPercent: 20,
    principal: examplePrincipal,
  },
];

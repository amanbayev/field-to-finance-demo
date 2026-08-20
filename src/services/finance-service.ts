import { financingModules } from "@/data/mock/financing";
import type { FinancingPosition } from "@/domain";

export function listFinancingModules(): FinancingPosition[] {
  return financingModules;
}

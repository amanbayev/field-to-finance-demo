import { tokens } from "@/data/mock/tokens";
import { pools } from "@/data/mock/pools";
import type { AgriculturalToken, ContractPool } from "@/domain";

export interface TokenDetail {
  token: AgriculturalToken;
  pool: ContractPool;
}

export function listTokens(): AgriculturalToken[] {
  return tokens;
}

export function getToken(id: string): TokenDetail | undefined {
  const token = tokens.find((item) => item.id === id);
  if (!token) {
    return undefined;
  }
  const pool = pools.find((item) => item.id === token.poolId);
  if (!pool) {
    throw new Error(`Token pool ${token.poolId} is missing from mock data.`);
  }
  return { token, pool };
}

export function getPrimaryToken(): TokenDetail {
  const token = tokens[0];
  if (!token) {
    throw new Error("No mock token series is configured.");
  }
  const detail = getToken(token.id);
  if (!detail) {
    throw new Error("Primary token detail could not be assembled.");
  }
  return detail;
}

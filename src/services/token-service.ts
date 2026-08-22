import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { pools } from "@/data/mock/pools";
import { tokens } from "@/data/mock/tokens";
import type {
  AgriculturalToken,
  ContractCoverage,
  ContractPool,
  IssuanceTranche,
} from "@/domain";
import { remainingIssuanceCapacity } from "@/domain";
import type { OnChainTokenMintLookup } from "@/adapters/blockchain";
import { scasProvider } from "./providers";

export interface TokenDetail {
  token: AgriculturalToken;
  pool: ContractPool;
}

export type IssuanceGateKey =
  | "scasPoolLock"
  | "scasCoverage"
  | "termsRecorded"
  | "coverageCap"
  | "registrarMint"
  | "token2022Mint";

export interface IssuanceGate {
  key: IssuanceGateKey;
  passed: boolean;
}

export interface IssuanceDesk {
  token: AgriculturalToken;
  pool: ContractPool;
  coverage: ContractCoverage;
  remaining: number;
  mintDeployed: boolean;
  gates: IssuanceGate[];
}

export function listTokens(): AgriculturalToken[] {
  return tokens;
}

export function getTokenBySymbol(symbol: string): TokenDetail | undefined {
  const token = tokens.find((item) => item.symbol === symbol);
  if (!token) {
    return undefined;
  }
  return getToken(token.id);
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

export function liveOutstanding(
  lookup: OnChainTokenMintLookup,
  fallbackIssued: number,
): number {
  return lookup.status === "found" && lookup.mint
    ? lookup.mint.supply
    : fallbackIssued;
}

export function getIssuanceDesk(options?: {
  mintDeployed?: boolean;
  outstandingTokens?: number;
  tranches?: IssuanceTranche[];
}): IssuanceDesk {
  const { token, pool } = getPrimaryToken();
  const coverage = wheatPoolCoverageFromEngine();
  const attestations = scasProvider.listAttestations();
  const poolLock = attestations.some(
    (item) =>
      item.kind === "poolLock" &&
      item.subjectId === pool.id &&
      item.status === "ATTESTED",
  );
  const coverageAttested = attestations.some(
    (item) =>
      item.kind === "coverageSnapshot" &&
      item.subjectId === pool.id &&
      item.status === "ATTESTED",
  );
  const mintDeployed = options?.mintDeployed ?? Boolean(token.mintAddress);
  const outstandingTokens = options?.outstandingTokens ?? token.issued;
  const reserved = (options?.tranches ?? [])
    .filter((item) => item.status === "PREPARED")
    .reduce((sum, item) => sum + item.volumeTonnes, 0);
  const remaining = remainingIssuanceCapacity({
    eligibleCoverageTonnes: coverage.eligibleCoverageTonnes,
    outstandingTokens,
    reservedTokens: reserved,
  });

  return {
    token,
    pool,
    coverage,
    remaining,
    mintDeployed,
    gates: [
      { key: "scasPoolLock", passed: poolLock },
      { key: "scasCoverage", passed: coverageAttested },
      { key: "termsRecorded", passed: true },
      {
        key: "coverageCap",
        passed: outstandingTokens + reserved <= coverage.eligibleCoverageTonnes,
      },
      { key: "registrarMint", passed: true },
      { key: "token2022Mint", passed: mintDeployed },
    ],
  };
}

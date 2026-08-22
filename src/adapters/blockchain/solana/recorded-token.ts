import recordedTokenJson from "./recorded-token.json";

export interface RecordedTokenProof {
  mint: string;
  createSignature: string;
  decimals: number;
  tokenProgramId: string;
  supply: number;
}

const records = recordedTokenJson as Record<string, RecordedTokenProof>;

export function recordedTokenProof(
  tokenId: string,
): RecordedTokenProof | undefined {
  const entry = records[tokenId];
  if (!entry?.mint) {
    return undefined;
  }
  return entry;
}

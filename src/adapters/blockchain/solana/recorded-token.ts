import recordedTokenJson from "./recorded-token.json";

export interface RecordedTokenTranche {
  id: string;
  volumeTonnes: number;
  signature: string;
  destination: string;
}

export interface RecordedTokenProof {
  mint: string;
  createSignature: string;
  decimals: number;
  tokenProgramId: string;
  supply: number;
  holder?: string;
  holderOwner?: string;
  tranches?: RecordedTokenTranche[];
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

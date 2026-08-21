/**
 * Public, non-secret transaction signatures recorded after Devnet registration.
 * The live account remains the source of truth; these help Explorer links if
 * RPC signature history is truncated.
 */
export interface RecordedContractProof {
  createSignature?: string;
  verifySignature?: string;
}

export const recordedContractProof: Record<string, RecordedContractProof> = {
  "DAC-2027-0001": {
    createSignature:
      "3Nwom4nYQTNtwp8iSzPHEnHxK1F2L7phf6kRBUdGB2h7m1JJxsHuN8ygpQM3cmMZxeKMJQeCkuM3diyWmmigUFfo",
    verifySignature:
      "bMy4TH3uosXjBR2CpchADUQiiCpkkAzUSGVKNJhjwF88d5UHnFiAUDsc6ENJPaSypqAemWwxDk8nGCDpZVfvDy5",
  },
};

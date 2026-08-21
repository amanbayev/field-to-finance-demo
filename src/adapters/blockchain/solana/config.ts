export const REGISTRY_PROGRAM_ID =
  "E2jeQaTo7f5m78PkNfQ47srUK3EVexN2ApjEEoBaENjT";

export const CONTRACT_PDA_SEED = "digital_ag_contract";
export const REGISTRY_PDA_SEED = "registry_config";

export const ON_CHAIN_DEMO_CONTRACT_ID = "DAC-2027-0001";

export const PROGRAM_NAME = "agricultural_registry";

export function isOnChainDemoContract(contractId: string): boolean {
  return contractId === ON_CHAIN_DEMO_CONTRACT_ID;
}

export function explorerAddressUrl(
  address: string,
  cluster: string = "devnet",
): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

export function explorerTxUrl(
  signature: string,
  cluster: string = "devnet",
): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function shortenKey(value: string, visible = 4): string {
  if (value.length <= visible * 2 + 1) {
    return value;
  }
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
}

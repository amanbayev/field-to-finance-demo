export const REGISTRY_PROGRAM_ID =
  "E2jeQaTo7f5m78PkNfQ47srUK3EVexN2ApjEEoBaENjT";

export const CONTRACT_PDA_SEED = "digital_ag_contract";
export const REGISTRY_PDA_SEED = "registry_config";
export const POOL_PDA_SEED = "contract_pool";
export const ALLOCATION_PDA_SEED = "contract_allocation";
export const ALLOCATION_INDEX_PDA_SEED = "allocation_index";

export const ON_CHAIN_DEMO_CONTRACT_ID = "DAC-2027-0001";
export const ON_CHAIN_DEMO_CONTRACT_IDS = [
  "DAC-2027-0001",
  "DAC-2027-0002",
  "DAC-2027-0003",
  "DAC-2027-0004",
] as const;

export const ON_CHAIN_DEMO_POOL_ID = "POOL-WHEAT-2027-01";

export const TOKEN_2022_PROGRAM_ID =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export const ON_CHAIN_DEMO_TOKEN_ID = "tok-wheat-2027";

export const PROGRAM_NAME = "agricultural_registry";

export function isOnChainDemoContract(contractId: string): boolean {
  return (ON_CHAIN_DEMO_CONTRACT_IDS as readonly string[]).includes(contractId);
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

/**
 * Public runtime configuration for the Field to Finance demo.
 *
 * These values are safe to expose in the browser (`NEXT_PUBLIC_*`).
 * Missing variables must never crash the app — Phase 1 Solana settings are
 * optional until a real chain adapter is wired.
 */

export const PUBLIC_ENV_DEFAULTS = {
  appEnv: "demo",
  solanaNetwork: "devnet",
  solanaRpcUrl: "https://api.devnet.solana.com",
  blockchainProvider: "mock",
} as const;

export type PublicAppEnv = "demo" | "development" | "production" | (string & {});
export type PublicSolanaNetwork =
  | "devnet"
  | "testnet"
  | "mainnet-beta"
  | (string & {});
export type PublicBlockchainProvider = "mock" | "solana" | (string & {});

export interface PublicEnv {
  appEnv: PublicAppEnv;
  solanaNetwork: PublicSolanaNetwork;
  solanaRpcUrl: string;
  blockchainProvider: PublicBlockchainProvider;
}

function readPublic(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function getPublicEnv(): PublicEnv {
  return {
    appEnv: readPublic(
      process.env.NEXT_PUBLIC_APP_ENV,
      PUBLIC_ENV_DEFAULTS.appEnv,
    ),
    solanaNetwork: readPublic(
      process.env.NEXT_PUBLIC_SOLANA_NETWORK,
      PUBLIC_ENV_DEFAULTS.solanaNetwork,
    ),
    solanaRpcUrl: readPublic(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
      PUBLIC_ENV_DEFAULTS.solanaRpcUrl,
    ),
    blockchainProvider: readPublic(
      process.env.NEXT_PUBLIC_BLOCKCHAIN_PROVIDER,
      PUBLIC_ENV_DEFAULTS.blockchainProvider,
    ),
  };
}

export function solanaNetworkLabel(network: string): string {
  switch (network) {
    case "devnet":
      return "Solana Devnet";
    case "testnet":
      return "Solana Testnet";
    case "mainnet-beta":
      return "Solana Mainnet";
    default:
      return `Solana ${network}`;
  }
}

/**
 * Public runtime configuration for the Field to Finance demo.
 *
 * These values are safe to expose in the browser (`NEXT_PUBLIC_*`).
 * Missing variables must never crash the app. Private keys must never appear
 * in NEXT_PUBLIC_* values.
 *
 * Environment policy:
 * - Development (local default): mock provider. Set
 *   NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=solana in `.env.local` for live Devnet reads.
 * - Preview: solana / devnet (Vercel Preview env).
 * - Production: solana / devnet (Vercel Production env). Do not change
 *   Production RPC or Program ID from this default without an explicit release.
 */

export const PUBLIC_ENV_DEFAULTS = {
  appEnv: "demo",
  solanaNetwork: "devnet",
  solanaRpcUrl: "https://api.devnet.solana.com",
  blockchainProvider: "mock",
  registryProgramId: "E2jeQaTo7f5m78PkNfQ47srUK3EVexN2ApjEEoBaENjT",
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
  registryProgramId: string;
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
    registryProgramId: readPublic(
      process.env.NEXT_PUBLIC_SOLANA_REGISTRY_PROGRAM_ID,
      PUBLIC_ENV_DEFAULTS.registryProgramId,
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

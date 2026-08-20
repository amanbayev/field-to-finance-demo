declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_APP_ENV?: string;
    NEXT_PUBLIC_SOLANA_NETWORK?: string;
    NEXT_PUBLIC_SOLANA_RPC_URL?: string;
    NEXT_PUBLIC_BLOCKCHAIN_PROVIDER?: string;
  }
}

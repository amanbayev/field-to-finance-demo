declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_APP_ENV?: string;
    NEXT_PUBLIC_SOLANA_NETWORK?: string;
    NEXT_PUBLIC_SOLANA_RPC_URL?: string;
    NEXT_PUBLIC_BLOCKCHAIN_PROVIDER?: string;
    NEXT_PUBLIC_SOLANA_REGISTRY_PROGRAM_ID?: string;
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    NEXT_PUBLIC_SITE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
    ORIGINATION_STORE?: string;
    VERCEL?: string;
    VERCEL_ENV?: "production" | "preview" | "development" | string;
  }
}

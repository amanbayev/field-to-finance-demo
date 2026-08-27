export type OriginationBackend = "postgres" | "memory" | "fail";

export type OriginationBackendEnv = {
  nodeEnv?: string;
  vercel?: string;
  vercelEnv?: string;
  originationStore?: string;
  hasServiceRole: boolean;
};

/**
 * MemoryOriginationStore is allowed only for unit tests and local `next dev`.
 * Vercel Preview/Production and `next start` must never fall back to it.
 */
export function originationMemoryAllowed(env: OriginationBackendEnv): boolean {
  if ((env.nodeEnv ?? "development") === "test") {
    return true;
  }
  if (env.vercel) {
    return false;
  }
  if (env.vercelEnv === "preview" || env.vercelEnv === "production") {
    return false;
  }
  return (env.nodeEnv ?? "development") !== "production";
}

export function resolveOriginationBackend(env: OriginationBackendEnv): OriginationBackend {
  const deployed = !originationMemoryAllowed(env);
  if (deployed) {
    return env.hasServiceRole ? "postgres" : "fail";
  }
  if ((env.nodeEnv ?? "development") === "test") {
    return "memory";
  }
  if (env.originationStore === "memory") {
    return "memory";
  }
  if (env.hasServiceRole) {
    return "postgres";
  }
  return "memory";
}

export const ORIGINATION_STORAGE_MESSAGE =
  "Origination requires a server-only SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.";

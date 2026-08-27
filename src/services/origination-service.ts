import { join } from "node:path";
import { OriginationError, type OriginationStore } from "@/domain/origination";
import { MemoryOriginationStore } from "@/domain/origination/memory-store";
import { OriginationService } from "@/domain/origination/service";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";
import { PostgresOriginationStore } from "@/data/origination/postgres-store";
import {
  ORIGINATION_STORAGE_MESSAGE,
  resolveOriginationBackend,
} from "@/lib/origination/backend";

const globalForOrigination = globalThis as unknown as {
  originationService?: OriginationService;
};

function memoryStore() {
  const persistPath =
    process.env.NODE_ENV === "test"
      ? undefined
      : join(process.cwd(), ".origination-dev.json");
  return new MemoryOriginationStore(persistPath);
}

export function createOriginationStore(): OriginationStore {
  const backend = resolveOriginationBackend({
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    originationStore: process.env.ORIGINATION_STORE,
    hasServiceRole: Boolean(createServiceRoleClient()),
  });
  if (backend === "fail") {
    throw new OriginationError("storage", ORIGINATION_STORAGE_MESSAGE);
  }
  if (backend === "postgres") {
    const client = createServiceRoleClient();
    if (!client) {
      throw new OriginationError("storage", ORIGINATION_STORAGE_MESSAGE);
    }
    return new PostgresOriginationStore(client);
  }
  return memoryStore();
}

export function originationService() {
  const store = createOriginationStore();
  if (store instanceof PostgresOriginationStore) {
    globalForOrigination.originationService ??= new OriginationService(store);
    return globalForOrigination.originationService;
  }
  return new OriginationService(store);
}

export function originationUsesObjectStorage() {
  return (
    resolveOriginationBackend({
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
      originationStore: process.env.ORIGINATION_STORE,
      hasServiceRole: Boolean(createServiceRoleClient()),
    }) === "postgres"
  );
}

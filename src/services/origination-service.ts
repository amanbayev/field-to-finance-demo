import { join } from "node:path";
import { OriginationError, type OriginationStore } from "@/domain/origination";
import { MemoryOriginationStore } from "@/domain/origination/memory-store";
import { OriginationService } from "@/domain/origination/service";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";
import { PostgresOriginationStore } from "@/data/origination/postgres-store";

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
  if (process.env.ORIGINATION_STORE === "memory") {
    return memoryStore();
  }
  const client = createServiceRoleClient();
  if (client) {
    return new PostgresOriginationStore(client);
  }
  if (process.env.NODE_ENV === "production") {
    throw new OriginationError("storage", "Origination requires a server-only Supabase service role.");
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
  return Boolean(createServiceRoleClient()) && process.env.ORIGINATION_STORE !== "memory";
}

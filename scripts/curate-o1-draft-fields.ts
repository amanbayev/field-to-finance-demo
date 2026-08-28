import { existsSync, readFileSync } from "node:fs";
import {
  buildPrincipal,
  resolveActorContext,
  type ActorContext,
  type MembershipRecord,
  type OrganizationRecord,
} from "@/domain/identity";
import { OriginationService } from "@/domain/origination";
import { PostgresOriginationStore } from "@/data/origination/postgres-store";
import { DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";

const ARCHIVE_PUBLIC_IDS = ["FIELD-2027-0007", "FIELD-2027-0008", "FIELD-2027-0010"] as const;
const KEEP_FIELD = "FIELD-2027-0009";
const KEEP_CASE = "VCASE-2027-0001";

function loadLocalEnv() {
  for (const path of [".env.local", ".env.curation.local"]) {
    if (!existsSync(path)) {
      continue;
    }
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      if (index < 1) {
        continue;
      }
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
      if (
        (key === "SUPABASE_SECRET_KEY" ||
          key === "SUPABASE_SERVICE_ROLE_KEY" ||
          key === "NEXT_PUBLIC_SUPABASE_URL") &&
        !process.env[key]
      ) {
        process.env[key] = value;
      }
    }
  }
}

function membership(
  overrides: Partial<MembershipRecord> & Pick<MembershipRecord, "organizationId" | "roleIds">,
): MembershipRecord {
  return {
    id: overrides.id ?? `mem-${overrides.organizationId}`,
    userId: overrides.userId ?? "user-1",
    status: overrides.status ?? "ACTIVE",
    organizationId: overrides.organizationId,
    roleIds: overrides.roleIds,
  };
}

function producerActor(org: OrganizationRecord, userId: string): ActorContext {
  const principal = buildPrincipal({
    userId,
    email: `${userId}@example.com`,
    displayName: org.name,
    status: "ACTIVE",
    organizations: [org],
    memberships: [membership({ userId, organizationId: org.id, roleIds: ["PRODUCER_ADMIN"] })],
  });
  return resolveActorContext({
    principal,
    session: { principalUserId: userId, activeOrganizationId: org.id },
    persona: undefined,
    personaOrganization: undefined,
  });
}

async function main() {
  loadLocalEnv();
  const client = createServiceRoleClient();
  if (!client) {
    throw new Error("Missing Supabase service role. Cannot archive through OriginationService.");
  }
  const store = new PostgresOriginationStore(client);
  const service = new OriginationService(store);

  for (const publicId of ARCHIVE_PUBLIC_IDS) {
    const field = await store.getFieldByPublicId(publicId);
    if (!field) {
      throw new Error(`Missing ${publicId}`);
    }
    if (field.status === "ARCHIVED") {
      console.log(`${publicId} already ARCHIVED`);
      continue;
    }
    if (field.status !== "DRAFT") {
      throw new Error(`${publicId} is ${field.status}, not DRAFT. Domain archive refused.`);
    }
    const org = DEMO_ORGANIZATIONS.find((item) => item.id === field.organizationId);
    if (!org) {
      throw new Error(`Unknown organization for ${publicId}`);
    }
    const archived = await service.archiveField(producerActor(org, field.createdByUserId), field.id);
    console.log(`${archived.publicId} -> ${archived.status}`);
  }

  const submitted = await store.getFieldByPublicId(KEEP_FIELD);
  const verificationCase = await store.getCaseByPublicId(KEEP_CASE);
  if (!submitted || submitted.status !== "SUBMITTED") {
    throw new Error(`${KEEP_FIELD} must remain SUBMITTED`);
  }
  if (!verificationCase || verificationCase.status !== "NEW" || verificationCase.fieldId !== submitted.id) {
    throw new Error(`${KEEP_CASE} must remain NEW and bound to ${KEEP_FIELD}`);
  }
  console.log(`${KEEP_FIELD}=${submitted.status} ${KEEP_CASE}=${verificationCase.status}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

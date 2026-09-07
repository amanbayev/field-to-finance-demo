/**
 * Reviewable manifest of what a future Dataset V2 reset would preserve and
 * what it would clear.
 *
 * This is a declaration, not an executor. Nothing in this module reads or
 * mutates a database, Auth, Storage or the chain. Object names are transcribed
 * from `supabase/migrations/*.sql` and from the bucket constants in
 * `src/domain/origination/types.ts`.
 *
 * `scopeBasis` is the honest part. Several categories are `NOT_SCOPABLE`
 * because no run-ownership column exists on any business table at the audited
 * baseline, so a reset cannot yet prove it would touch only the current run.
 * The planner refuses to reach `READY_FOR_CONFIRMATION` while that holds.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.2 and §9.3.
 */

export type DemoResetSubsystem = "DATABASE" | "AUTH" | "STORAGE" | "CHAIN";

export type DemoResetDisposition = "PRESERVED" | "CLEARED";

/**
 * How precisely the category can be bounded today.
 * - `RUN_OWNED`: rows carry the run identity and can be isolated.
 * - `ENVIRONMENT_WIDE`: intentionally whole-environment, not run-specific.
 * - `NOT_SCOPABLE`: run isolation is required but not yet expressible.
 */
export type DemoResetScopeBasis =
  | "RUN_OWNED"
  | "ENVIRONMENT_WIDE"
  | "NOT_SCOPABLE";

export interface DemoResetCategory {
  id: string;
  subsystem: DemoResetSubsystem;
  disposition: DemoResetDisposition;
  scopeBasis: DemoResetScopeBasis;
  /** Table names, bucket ids, or an empty list when the objects are external. */
  objects: readonly string[];
  note: string;
}

export interface DemoResetManifest {
  datasetContract: string;
  categories: readonly DemoResetCategory[];
}

const CATEGORIES: readonly DemoResetCategory[] = [
  {
    id: "system-roles-and-permissions",
    subsystem: "DATABASE",
    disposition: "PRESERVED",
    scopeBasis: "ENVIRONMENT_WIDE",
    objects: [],
    note:
      "Roles and the platform permissions are TypeScript in src/domain/identity, " +
      "not rows. No migration defines a permissions table, so a data reset " +
      "cannot remove them.",
  },
  {
    id: "protocol-definitions-and-frozen-versions",
    subsystem: "DATABASE",
    disposition: "PRESERVED",
    scopeBasis: "ENVIRONMENT_WIDE",
    objects: [],
    note:
      "Recorded protocols and frozen protocol versions live in " +
      "src/data/market-core/catalog.ts, not in the database. F2F-V1.1 keeps " +
      "claiming no activation or freeze date.",
  },
  {
    id: "platform-operator-identity",
    subsystem: "DATABASE",
    disposition: "PRESERVED",
    scopeBasis: "NOT_SCOPABLE",
    objects: [
      "organizations",
      "profiles",
      "memberships",
      "membership_roles",
      "demo_personas",
    ],
    note:
      "Operator organisations and users required to run the platform must " +
      "survive. These tables also hold run-created participants, and no " +
      "column distinguishes the two yet.",
  },
  {
    id: "reset-audit",
    subsystem: "DATABASE",
    disposition: "PRESERVED",
    scopeBasis: "NOT_SCOPABLE",
    objects: [],
    note:
      "Reset audit must be stored outside the deleted scope. No reset audit " +
      "table exists; this is a prerequisite, not a preserved object.",
  },
  {
    id: "run-created-identity",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    objects: [
      "organizations",
      "profiles",
      "memberships",
      "membership_roles",
      "role_requests",
      "session_contexts",
    ],
    note:
      "Producer, Issuer and Investor organisations created through the UI for " +
      "a run. Overlaps platform-operator-identity on purpose: that overlap is " +
      "the recorded scope conflict blocking a provable reset.",
  },
  {
    id: "origination-business",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    objects: [
      "producer_fields",
      "field_submissions",
      "field_documents",
      "field_upload_intents",
      "field_verification_cases",
      "field_cadastre_verifications",
      "field_verification_evidence",
      "field_verification_messages",
      "verified_field_snapshots",
      "field_origination_events",
      "origination_dacs",
      "origination_dac_messages",
      "origination_dac_events",
    ],
    note:
      "Fields, evidence, verification cases, immutable snapshots and DACs. " +
      "Immutability triggers reject UPDATE and DELETE, so clearing requires " +
      "an explicit privileged path that does not exist yet.",
  },
  {
    id: "market-core-business",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    objects: [
      "market_core_markets",
      "market_core_orders",
      "market_core_trades",
      "market_core_settlements",
      "market_core_reservations",
      "market_core_holdings",
      "market_core_eligibility",
      "market_core_events",
      "market_core_counters",
      "market_core_idempotency",
      "market_core_participant_map",
      "market_core_chain_proof",
      "market_core_settlement_accounts",
      "market_core_settlement_identities",
    ],
    note:
      "Orders, trades, reservations, holdings projection, eligibility, " +
      "participant mapping and cached chain proof. Cached proof is an " +
      "observation, never chain truth.",
  },
  {
    id: "registrar-book-of-record",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    objects: ["registrar_registered_ownership"],
    note:
      "The legal book of record. Clearing it is a demo-environment action " +
      "only. Per 20260823200000_registrar_book_and_live_proof.sql the table " +
      "has RLS enabled, all privileges revoked from public, anon and " +
      "authenticated, and select/insert/update/delete granted to service_role " +
      "alone, so deletion needs that server credential. app.registrar_sync is " +
      "unrelated: it gates UPDATE OF owned on market_core_holdings. The sync " +
      "trigger fires only on insert or update of registered_quantity, so " +
      "deleting rows here leaves market_core_holdings.owned stale and both " +
      "must be cleared in one pass.",
  },
  {
    id: "application-audit",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    objects: ["app_audit_events"],
    note:
      "Business audit for cleared objects. The reset's own audit record must " +
      "be written outside this category.",
  },
  {
    id: "origination-storage-objects",
    subsystem: "STORAGE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    objects: ["field-documents", "scas-evidence"],
    note:
      "Private evidence buckets. Storage cleanup is not transactional with " +
      "the database and needs a separate resumable pass.",
  },
  {
    id: "run-auth-sessions",
    subsystem: "AUTH",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    objects: [],
    note:
      "Run-owned sessions and memberships are revoked. A shared external Auth " +
      "user is never deleted solely because they took part in a run.",
  },
  {
    id: "devnet-execution-history",
    subsystem: "CHAIN",
    disposition: "PRESERVED",
    scopeBasis: "ENVIRONMENT_WIDE",
    objects: [],
    note:
      "Solana Devnet history cannot be reset. A new run gets new identifiers " +
      "and a new mint; old signatures are never attached to new objects or " +
      "reused as proof of new execution.",
  },
];


export const DEMO_DATASET_V2_RESET_MANIFEST: DemoResetManifest = Object.freeze({
  datasetContract: "demo-dataset-v2",
  categories: Object.freeze(CATEGORIES.map((category) => Object.freeze(category))),
});

export function manifestCategoryIds(
  manifest: DemoResetManifest = DEMO_DATASET_V2_RESET_MANIFEST,
): readonly string[] {
  return manifest.categories.map((category) => category.id);
}

export function categoriesByDisposition(
  disposition: DemoResetDisposition,
  manifest: DemoResetManifest = DEMO_DATASET_V2_RESET_MANIFEST,
): readonly DemoResetCategory[] {
  return manifest.categories.filter(
    (category) => category.disposition === disposition,
  );
}

/**
 * Objects named by both a `PRESERVED` and a `CLEARED` category.
 *
 * A non-empty result means the manifest cannot be executed as written: the
 * same table would have to be both kept and emptied. Reporting it is the point
 * — it is the concrete consequence of missing run ownership.
 */
export function overlappingManifestObjects(
  manifest: DemoResetManifest = DEMO_DATASET_V2_RESET_MANIFEST,
): readonly string[] {
  const preserved = new Set<string>();
  for (const category of categoriesByDisposition("PRESERVED", manifest)) {
    for (const object of category.objects) {
      preserved.add(object);
    }
  }
  const overlap = new Set<string>();
  for (const category of categoriesByDisposition("CLEARED", manifest)) {
    for (const object of category.objects) {
      if (preserved.has(object)) {
        overlap.add(object);
      }
    }
  }
  return Object.freeze([...overlap].sort());
}

/** Cleared categories that cannot yet be bounded to a single run. */
export function unscopedClearedCategories(
  manifest: DemoResetManifest = DEMO_DATASET_V2_RESET_MANIFEST,
): readonly DemoResetCategory[] {
  return categoriesByDisposition("CLEARED", manifest).filter(
    (category) => category.scopeBasis !== "RUN_OWNED",
  );
}

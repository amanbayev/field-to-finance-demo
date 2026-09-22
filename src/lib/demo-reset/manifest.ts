/**
 * Reviewable manifest of what a future Dataset V2 reset would preserve and
 * what it would clear.
 *
 * This is a declaration, not an executor. Nothing in this module reads or
 * mutates a database, Auth, Storage or the chain. Object names are transcribed
 * from `supabase/migrations/*.sql` and from the bucket constants in
 * `src/domain/origination/types.ts`.
 *
 * `scopeBasis` is the honest part. Identity organisations and field-rooted
 * origination can now be bounded through `organizations.run_id`. Market Core,
 * Registrar, textual event tables, storage and Auth remain `NOT_SCOPABLE`.
 * The planner refuses to reach `READY_FOR_CONFIRMATION` while that holds.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.2 and §9.3.
 */

export type DemoResetSubsystem = "DATABASE" | "AUTH" | "STORAGE" | "CHAIN";

export type DemoResetDisposition = "PRESERVED" | "CLEARED";

/**
 * How precisely the category can be bounded today.
 * - `RUN_OWNED`: rows resolve to a run through the documented FK path.
 * - `NON_RUN`: rows owned by no run (the complement of `RUN_OWNED`).
 * - `ENVIRONMENT_WIDE`: intentionally whole-environment, not run-specific.
 * - `NOT_SCOPABLE`: run isolation is required but not yet expressible.
 */
export type DemoResetScopeBasis =
  | "RUN_OWNED"
  | "NON_RUN"
  | "ENVIRONMENT_WIDE"
  | "NOT_SCOPABLE";

/**
 * Which rows *inside* a named object the category covers.
 *
 * `scopeBasis` answers whether a category can be bounded to a run at all.
 * This answers the separate question that decides the preserved/cleared
 * conflict: two categories may name the same table and still be safe, but only
 * when one covers exactly the run's rows and the other covers exactly the rows
 * that belong to no run.
 *
 * - `RUN_OWNED_ROWS`: only rows owned by the target run.
 * - `NON_RUN_ROWS`: only rows owned by no run, such as operator identity.
 * - `NOT_EXPRESSIBLE`: the object is named but its rows cannot be separated,
 *   because no run-ownership column exists to separate them by.
 * - `NOT_APPLICABLE`: the category names no objects, so there are no rows to
 *   scope.
 */
export type DemoResetRowScope =
  | "RUN_OWNED_ROWS"
  | "NON_RUN_ROWS"
  | "NOT_EXPRESSIBLE"
  | "NOT_APPLICABLE";

export interface DemoResetCategory {
  id: string;
  subsystem: DemoResetSubsystem;
  disposition: DemoResetDisposition;
  scopeBasis: DemoResetScopeBasis;
  rowScope: DemoResetRowScope;
  /** Table names, bucket ids, or an empty list when the objects are external. */
  objects: readonly string[];
  note: string;
}

/**
 * True when two row scopes cannot contain the same row.
 *
 * Only one pairing proves it: the run's rows against the rows that belong to
 * no run. Everything else — including two categories that both declare
 * `RUN_OWNED_ROWS` — may intersect, and an unproven separation is treated as
 * an intersection rather than assumed away.
 */
export function provablyDisjointRowScopes(
  first: DemoResetRowScope,
  second: DemoResetRowScope,
): boolean {
  return (
    (first === "RUN_OWNED_ROWS" && second === "NON_RUN_ROWS") ||
    (first === "NON_RUN_ROWS" && second === "RUN_OWNED_ROWS")
  );
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
    rowScope: "NOT_APPLICABLE",
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
    rowScope: "NOT_APPLICABLE",
    objects: ["protocol_version_records"],
    note:
      "MC-03 preserves persisted frozen references whole-table, independent of runs. " +
      "The legacy catalog remains unchanged and is not imported automatically. " +
      "F2F-V1.1 claims no activation or freeze date. The closed count source cannot " +
      "count this table: inventory is UNAVAILABLE and the planner stays INCOMPLETE.",
  },
  {
    id: "run-registry",
    subsystem: "DATABASE",
    disposition: "PRESERVED",
    scopeBasis: "ENVIRONMENT_WIDE",
    rowScope: "NOT_APPLICABLE",
    objects: ["demo_reset_run_instances", "demo_run_participant_commands"],
    note:
      "The run registry preserves lifecycle history; " +
      "private.demo_run_participant_commands preserves immutable participant " +
      "command retry history across cleanup. Neither is deletable run " +
      "participation. A dry-run never writes either table. Command history " +
      "is currently uncountable, so this category's inventory is unavailable.",
  },
  {
    id: "platform-operator-identity",
    subsystem: "DATABASE",
    disposition: "PRESERVED",
    scopeBasis: "NON_RUN",
    rowScope: "NON_RUN_ROWS",
    objects: [
      "organizations",
      "profiles",
      "memberships",
      "membership_roles",
      "demo_personas",
      "session_contexts",
    ],
    note:
      "Operator and pre-existing identity: organisations with run_id IS NULL, " +
      "memberships and roles reached through those organisations, seeded " +
      "personas, and every profile and session_context. Profiles are never " +
      "run-owned: a shared Auth user is not deletable because they joined a run.",
  },
  {
    id: "reset-audit",
    subsystem: "DATABASE",
    disposition: "PRESERVED",
    scopeBasis: "NOT_SCOPABLE",
    rowScope: "NOT_APPLICABLE",
    objects: [],
    note:
      "Reset audit must be stored outside the deleted scope. No reset audit " +
      "table exists; this is a prerequisite, not a preserved object.",
  },
  {
    id: "run-created-identity",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "RUN_OWNED",
    rowScope: "RUN_OWNED_ROWS",
    objects: ["organizations", "memberships", "membership_roles"],
    note:
      "Organisations with run_id equal to the established run, plus " +
      "memberships and membership_roles reached through required FKs. " +
      "profiles are excluded: an Auth user is never owned by a run. " +
      "role_requests cannot be attributed (organization_name is text only).",
  },
  {
    id: "onboarding-role-requests",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    rowScope: "NOT_EXPRESSIBLE",
    objects: ["role_requests"],
    note:
      "Onboarding requests store organization_name as text and have no " +
      "organization_id or run_id. They cannot be attributed to a run " +
      "without inventing a link.",
  },
  {
    id: "origination-business",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "RUN_OWNED",
    rowScope: "RUN_OWNED_ROWS",
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
      "origination_dacs",
      "origination_dac_messages",
    ],
    note:
      "Field-rooted origination whose producer organisation carries the run. " +
      "Children derive through required field_id or dac_id FKs. The run root " +
      "is write-once; field organization and DAC source field are immutable. " +
      "Immutable children retain that ownership path without backfilling. " +
      "Event tables are excluded: they correlate by text only.",
  },
  {
    id: "origination-events",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    rowScope: "NOT_EXPRESSIBLE",
    objects: ["field_origination_events", "origination_dac_events"],
    note:
      "Origination event tables have no field_id or dac_id FK. Parentage is " +
      "textual object_type/object_id only, so run ownership is not expressible.",
  },
  {
    id: "market-core-business",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    rowScope: "NOT_EXPRESSIBLE",
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
    id: "market-core-participant-identity",
    subsystem: "DATABASE",
    disposition: "PRESERVED",
    scopeBasis: "ENVIRONMENT_WIDE",
    rowScope: "NOT_APPLICABLE",
    objects: ["market_core_participants"],
    note:
      "Permanent institutional identity roots are preserved whole-table. The " +
      "closed count RPC does not support this table, so inventory is unavailable. " +
      "Its restrictive FK prevents deleting a referenced organization, including " +
      "a run-created root. MC-13 must reconcile that retained-root dependency; " +
      "the existing organization disposition and 14 legacy Market Core tables " +
      "are unchanged. The planner remains INCOMPLETE; no reset executor exists.",
  },
  {
    id: "registrar-book-of-record",
    subsystem: "DATABASE",
    disposition: "CLEARED",
    scopeBasis: "NOT_SCOPABLE",
    rowScope: "NOT_EXPRESSIBLE",
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
    rowScope: "NOT_EXPRESSIBLE",
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
    rowScope: "NOT_EXPRESSIBLE",
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
    rowScope: "NOT_APPLICABLE",
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
    rowScope: "NOT_APPLICABLE",
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
 * Objects named by both a `PRESERVED` and a `CLEARED` category whose row
 * scopes are not proven disjoint.
 *
 * Sharing a table is not by itself a conflict. The conflict is that the same
 * *row* would have to be both kept and emptied. An object therefore drops out
 * of this list only when every preserved/cleared pairing that names it proves
 * the two sides cannot select the same row — the run's rows against the rows
 * owned by no run. Declaring a category `RUN_OWNED` does not retire the
 * conflict on its own, because a scope basis says nothing about which rows of
 * the shared table the other side keeps.
 */
export function overlappingManifestObjects(
  manifest: DemoResetManifest = DEMO_DATASET_V2_RESET_MANIFEST,
): readonly string[] {
  const preserved = categoriesByDisposition("PRESERVED", manifest);
  const overlap = new Set<string>();
  for (const cleared of categoriesByDisposition("CLEARED", manifest)) {
    for (const object of cleared.objects) {
      const unproven = preserved.some(
        (kept) =>
          kept.objects.includes(object) &&
          !provablyDisjointRowScopes(kept.rowScope, cleared.rowScope),
      );
      if (unproven) {
        overlap.add(object);
      }
    }
  }
  return Object.freeze([...overlap].sort());
}

/**
 * Cleared categories that cannot yet be bounded to a single run.
 *
 * A category counts as bounded only when it is both declared `RUN_OWNED` and
 * able to name the run's rows. Flipping the scope basis alone leaves the
 * category unscoped here, so no reset can claim run isolation it cannot
 * express at row level.
 */
export function unscopedClearedCategories(
  manifest: DemoResetManifest = DEMO_DATASET_V2_RESET_MANIFEST,
): readonly DemoResetCategory[] {
  return categoriesByDisposition("CLEARED", manifest).filter(
    (category) =>
      category.scopeBasis !== "RUN_OWNED" ||
      category.rowScope !== "RUN_OWNED_ROWS",
  );
}

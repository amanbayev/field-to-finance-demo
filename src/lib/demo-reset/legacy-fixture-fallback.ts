/**
 * Registry of legacy fixture fallback points.
 *
 * A SQL reset cannot remove a TypeScript fixture, so an emptied Dataset V2
 * environment would still render legacy catalogue rows through these entry
 * points. Each one is recorded here with the behaviour that would refill an
 * empty V2 view and the delivery stage that must switch it off.
 *
 * This PR only registers them. Nothing here disables a fallback, and current
 * runtime behaviour is unchanged. The accompanying test pins the paths and
 * symbols so a rename cannot silently orphan an entry.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.5.
 */

export interface LegacyFixtureFallbackPoint {
  /** Repository-relative source path. */
  modulePath: string;
  /** Exported identifiers that constitute the fallback surface. */
  symbols: readonly string[];
  /** What would refill an empty V2 view. */
  behaviour: string;
  /** Golden Path slice that must disable or replace it. */
  disableStage: string;
}

export const LEGACY_FIXTURE_FALLBACK_POINTS: readonly LegacyFixtureFallbackPoint[] =
  Object.freeze(
    [
      {
        modulePath: "src/data/market-core/catalog.ts",
        symbols: [
          "marketInstruments",
          "markets",
          "holdings",
          "eligibilityAssessments",
          "marketParticipants",
          "eligibilityMatrix",
          "settlements",
        ],
        behaviour:
          "Hardcoded catalogue constants with no database read and no " +
          "fallback branch. Every Market Core view resolves through them.",
        disableStage: "GP-03, GP-08, GP-10",
      },
      {
        modulePath: "src/services/secondary-market-repository.ts",
        symbols: ["engineStateFromSnapshot"],
        behaviour:
          "Substitutes catalogue holdings and markets when the database " +
          "snapshot returns zero rows, so an emptied environment shows " +
          "legacy holdings instead of an empty book.",
        disableStage: "GP-08",
      },
      {
        modulePath: "src/domain/market-core/participants.ts",
        symbols: ["participantIdForOrganizationSlug"],
        behaviour:
          "Hardcoded organisation-slug to participant-id map. A new " +
          "organisation has no participant identity until persistent " +
          "mapping exists; adding a slug here is not an acceptable " +
          "workaround.",
        disableStage: "GP-03",
      },
      {
        modulePath: "src/adapters/blockchain/solana/recorded-placement.ts",
        symbols: ["recordedPlacementProof", "placementManifest"],
        behaviour:
          "Recorded JSON proof and manifest for the historical placement. " +
          "Must never be attached to a new run or presented as new " +
          "execution evidence.",
        disableStage: "GP-09, GP-11",
      },
      {
        modulePath: "src/services/placement-service.ts",
        symbols: ["fallbackSupply"],
        behaviour:
          "Chains recorded proof, then the mock token, then literal " +
          "defaults, so a supply figure is always produced even with no " +
          "observation.",
        disableStage: "GP-09",
      },
      {
        modulePath: "src/services/admin-service.ts",
        symbols: ["loadDemoPersonasAdmin"],
        behaviour:
          "Returns catalogue personas when Supabase is unavailable or when " +
          "the persona query returns zero rows, guarded by design preview.",
        disableStage: "GP-03",
      },
      {
        modulePath: "src/lib/auth/design-preview.ts",
        symbols: ["getDesignPreviewActor", "isDesignPreviewEnabled"],
        behaviour:
          "Synthetic SYSTEM_ADMIN principal for local next dev. Never " +
          "evidence of real onboarding, database authorization or " +
          "execution, and never authority to reset.",
        disableStage: "GP-15 acceptance rule",
      },
      {
        modulePath: "src/data/market-core/seed-scenario.ts",
        symbols: ["seedFirstWheatSecondaryScenario", "wheatEngineBaseState"],
        behaviour:
          "Seeded secondary executions and DEMO-KZT balances that must not " +
          "populate a V2 run.",
        disableStage: "GP-08",
      },
      {
        modulePath: "src/domain/origination/memory-store.ts",
        symbols: ["MemoryOriginationStore"],
        behaviour:
          "File-backed origination store used locally when no service-role " +
          "key is present. Already refused on Vercel by " +
          "resolveOriginationBackend.",
        disableStage: "GP-01 documentation only",
      },
    ].map((point) =>
      Object.freeze({ ...point, symbols: Object.freeze(point.symbols) }),
    ),
  );

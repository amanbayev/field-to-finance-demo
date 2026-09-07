export type {
  DemoResetEnvironmentClass,
  DemoResetEnvironmentName,
  DemoResetEnvironmentRefusal,
  DemoResetEnvironmentResolution,
  DemoResetEnvironmentSignals,
  SupabaseEndpointRejection,
  SupabaseEndpointResolution,
} from "./environment";
export {
  DEMO_RESET_ENVIRONMENT_NAMES,
  DEMO_RESET_ENVIRONMENT_REFUSALS,
  SUPABASE_CLOUD_HOST_SUFFIX,
  SUPABASE_ENDPOINT_REJECTIONS,
  isSupabaseProjectRef,
  resolveDemoResetEnvironment,
  resolveSupabaseEndpoint,
  supabaseProjectRef,
} from "./environment";

export type {
  DemoResetActorFacts,
  DemoResetActorRefusal,
  DemoResetDryRunAuthorization,
  DemoResetRefusal,
} from "./policy";
export {
  DEMO_RESET_ACTOR_REFUSALS,
  DEMO_RESET_PERMISSION,
  evaluateDemoResetActor,
  evaluateDemoResetDryRunPolicy,
} from "./policy";

export type {
  DemoResetEstablishedRunScope,
  DemoResetRunContext,
  DemoResetRunInstance,
  DemoResetRunLookup,
  DemoResetRunPrecondition,
  DemoResetRunScope,
  DemoResetRunScopeGap,
  DemoResetRunScopeRefusal,
  DemoResetRunStore,
  DemoResetUnestablishedRunScope,
} from "./run-scope";
export {
  DEMO_RESET_RUN_SCOPE_GAPS,
  DEMO_RESET_RUN_SCOPE_REFUSALS,
  isDemoResetRunInstanceId,
  resolveDemoResetRunContext,
  resolveDemoResetRunScope,
} from "./run-scope";

export type {
  DemoResetCategory,
  DemoResetDisposition,
  DemoResetManifest,
  DemoResetRowScope,
  DemoResetScopeBasis,
  DemoResetSubsystem,
} from "./manifest";
export {
  DEMO_DATASET_V2_RESET_MANIFEST,
  categoriesByDisposition,
  manifestCategoryIds,
  overlappingManifestObjects,
  provablyDisjointRowScopes,
  unscopedClearedCategories,
} from "./manifest";

export type {
  CategoryObservation,
  DemoResetInventory,
  DemoResetInventoryGap,
  DemoResetInventorySource,
  DemoResetInvalidObservationGap,
  DemoResetObservationTime,
} from "./inventory";
export {
  DEMO_RESET_INVALID_OBSERVATION_GAPS,
  DEMO_RESET_INVENTORY_GAPS,
  countClaimedCategoryIds,
  countedCategoryIds,
  countedRows,
  inventoryGaps,
  inventoryObservationTime,
  invalidObservations,
  isInvalidObservationGap,
  isObservationInstant,
  isValidRowCount,
  unavailableDemoResetInventory,
} from "./inventory";

export type {
  DemoResetCountRequest,
  DemoResetCountScope,
  DemoResetInventoryRead,
  DemoResetReadableObject,
  DemoResetRowCount,
  DemoResetRowCountSource,
} from "./inventory-reader";
export {
  DEMO_RESET_READABLE_OBJECTS,
  readDemoResetInventory,
  readableObject,
} from "./inventory-reader";

export type {
  DemoResetDryRunPlan,
  DemoResetDryRunStatus,
  DemoResetInventoryGapEntry,
  DemoResetPlanBlocker,
  DemoResetPlanCategory,
  DemoResetPlanInput,
} from "./plan";
export {
  DEMO_RESET_PLAN_BLOCKERS,
  demoResetPlanHash,
  planDemoResetDryRun,
} from "./plan";

export type { LegacyFixtureFallbackPoint } from "./legacy-fixture-fallback";
export { LEGACY_FIXTURE_FALLBACK_POINTS } from "./legacy-fixture-fallback";

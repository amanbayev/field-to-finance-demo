/**
 * Demo environment / dataset / database identity contract for Dataset V2.
 *
 * This module decides whether an environment is *eligible* to plan a demo
 * reset dry-run. It never deletes, truncates or writes anything, and it holds
 * no database, Auth, Storage or chain client.
 *
 * The rule set is deliberately stricter than `resolveOriginationBackend`:
 * production is always denied, and a single `NEXT_PUBLIC_APP_ENV` or `NODE_ENV`
 * value is never sufficient. An operator must declare the environment, the
 * dataset and the database identity, and the declared database identity must
 * match the one the process would actually talk to. Anything unknown is a
 * refusal, not a default permission.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.
 */

/** Environment names an operator may declare. Anything else is unrecognised. */
export const DEMO_RESET_ENVIRONMENT_NAMES = [
  "approved-demo-qa",
  "local-development",
] as const;

export type DemoResetEnvironmentName =
  (typeof DEMO_RESET_ENVIRONMENT_NAMES)[number];

export type DemoResetEnvironmentClass =
  | "PRODUCTION"
  | "APPROVED_DEMO"
  | "UNKNOWN";

export const DEMO_RESET_ENVIRONMENT_REFUSALS = [
  "PRODUCTION_ENVIRONMENT_DENIED",
  "ENVIRONMENT_NOT_DECLARED",
  "ENVIRONMENT_NOT_RECOGNISED",
  "LOCAL_DECLARATION_REJECTED_ON_DEPLOYMENT",
  "DATASET_NOT_DECLARED",
  "DATABASE_IDENTITY_NOT_DECLARED",
  "DATABASE_IDENTITY_NOT_OBSERVABLE",
  "DATABASE_IDENTITY_MISMATCH",
] as const;

export type DemoResetEnvironmentRefusal =
  (typeof DEMO_RESET_ENVIRONMENT_REFUSALS)[number];

/**
 * Raw signals. Every field is optional so that a missing variable produces a
 * refusal rather than a crash, matching `src/lib/public-env.ts` policy.
 */
export type DemoResetEnvironmentSignals = {
  nodeEnv?: string;
  vercel?: string;
  vercelEnv?: string;
  publicAppEnv?: string;
  /** Operator-declared environment name. There is no default. */
  declaredEnvironment?: string;
  /** Operator-declared dataset the reset may touch. */
  declaredDatasetId?: string;
  /** Operator-declared Supabase project ref the reset may touch. */
  declaredDatabaseRef?: string;
  /** Supabase URL this process would actually use. */
  observedSupabaseUrl?: string;
};

export type DemoResetEnvironmentResolution =
  | {
      eligible: false;
      environmentClass: DemoResetEnvironmentClass;
      refusals: readonly DemoResetEnvironmentRefusal[];
      environmentName: null;
      datasetId: null;
      databaseRef: null;
    }
  | {
      eligible: true;
      environmentClass: "APPROVED_DEMO";
      refusals: readonly DemoResetEnvironmentRefusal[];
      environmentName: DemoResetEnvironmentName;
      datasetId: string;
      databaseRef: string;
    };

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function isRecognisedEnvironmentName(
  value: string,
): value is DemoResetEnvironmentName {
  return (DEMO_RESET_ENVIRONMENT_NAMES as readonly string[]).includes(value);
}

/**
 * Extracts the Supabase project ref from a project URL.
 * Returns null when the host carries no identifiable project ref, so an
 * unparseable URL becomes `DATABASE_IDENTITY_NOT_OBSERVABLE` rather than a
 * silently accepted empty identity.
 */
export function supabaseProjectRef(url: string | undefined): string | null {
  const value = trimmed(url);
  if (!value) {
    return null;
  }
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    return null;
  }
  const [ref, ...rest] = host.split(".");
  if (!ref || rest.length === 0) {
    return null;
  }
  return ref;
}

/**
 * `next start` outside Vercel reports `NODE_ENV=production` with no
 * `VERCEL_ENV`, so its provenance cannot be attributed to a non-production
 * deployment and it is classified as production.
 */
function environmentClassOf(
  signals: DemoResetEnvironmentSignals,
): DemoResetEnvironmentClass {
  const vercelEnv = trimmed(signals.vercelEnv);
  const nodeEnv = trimmed(signals.nodeEnv) ?? "development";
  const publicAppEnv = trimmed(signals.publicAppEnv);

  if (vercelEnv === "production" || publicAppEnv === "production") {
    return "PRODUCTION";
  }
  if (vercelEnv === "preview") {
    return "APPROVED_DEMO";
  }
  if (nodeEnv === "production") {
    return "PRODUCTION";
  }
  return "APPROVED_DEMO";
}

export function resolveDemoResetEnvironment(
  signals: DemoResetEnvironmentSignals,
): DemoResetEnvironmentResolution {
  const environmentClass = environmentClassOf(signals);
  const refusals: DemoResetEnvironmentRefusal[] = [];

  if (environmentClass === "PRODUCTION") {
    refusals.push("PRODUCTION_ENVIRONMENT_DENIED");
  }

  const declaredEnvironment = trimmed(signals.declaredEnvironment);
  let environmentName: DemoResetEnvironmentName | null = null;
  if (!declaredEnvironment) {
    refusals.push("ENVIRONMENT_NOT_DECLARED");
  } else if (!isRecognisedEnvironmentName(declaredEnvironment)) {
    refusals.push("ENVIRONMENT_NOT_RECOGNISED");
  } else {
    environmentName = declaredEnvironment;
    const deployed =
      Boolean(trimmed(signals.vercel)) ||
      trimmed(signals.vercelEnv) !== undefined ||
      (trimmed(signals.nodeEnv) ?? "development") === "production";
    if (environmentName === "local-development" && deployed) {
      refusals.push("LOCAL_DECLARATION_REJECTED_ON_DEPLOYMENT");
    }
  }

  const datasetId = trimmed(signals.declaredDatasetId);
  if (!datasetId) {
    refusals.push("DATASET_NOT_DECLARED");
  }

  const declaredDatabaseRef = trimmed(signals.declaredDatabaseRef);
  if (!declaredDatabaseRef) {
    refusals.push("DATABASE_IDENTITY_NOT_DECLARED");
  }

  const observedDatabaseRef = supabaseProjectRef(signals.observedSupabaseUrl);
  if (!observedDatabaseRef) {
    refusals.push("DATABASE_IDENTITY_NOT_OBSERVABLE");
  } else if (declaredDatabaseRef && observedDatabaseRef !== declaredDatabaseRef) {
    refusals.push("DATABASE_IDENTITY_MISMATCH");
  }

  if (
    refusals.length > 0 ||
    !environmentName ||
    !datasetId ||
    !declaredDatabaseRef
  ) {
    return {
      eligible: false,
      environmentClass,
      refusals: Object.freeze([...new Set(refusals)]),
      environmentName: null,
      datasetId: null,
      databaseRef: null,
    };
  }

  return {
    eligible: true,
    environmentClass: "APPROVED_DEMO",
    refusals: Object.freeze([]),
    environmentName,
    datasetId,
    databaseRef: declaredDatabaseRef,
  };
}

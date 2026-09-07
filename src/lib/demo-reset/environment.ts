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
 * match the one the process would actually talk to.
 *
 * Classification is a closed table. There is no permissive default: a missing,
 * unrecognised, contradictory or unclassifiable set of runtime signals is a
 * refusal, exactly like an undeclared dataset. Absence of evidence about the
 * environment is never read as evidence that the environment is safe.
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

/**
 * Runtime signal values this contract can classify. A value outside these
 * lists is not treated as "probably fine"; it is unrecognised.
 */
const NODE_ENV_VALUES = ["development", "production", "test"] as const;
const VERCEL_ENV_VALUES = ["production", "preview", "development"] as const;
/**
 * Vercel sets `VERCEL=1` on its build and runtime environments. That is the
 * only value this contract accepts as evidence of a Vercel deployment: `"0"`,
 * `"mystery"` or any other string is an environment this contract cannot
 * attribute, not a deployment flag to coerce into a boolean.
 */
const VERCEL_VALUES = ["1"] as const;
const PUBLIC_APP_ENV_VALUES = [
  "demo",
  "development",
  "preview",
  "production",
] as const;

export type DemoResetEnvironmentClass =
  | "PRODUCTION"
  | "APPROVED_DEMO"
  | "UNKNOWN";

export const DEMO_RESET_ENVIRONMENT_REFUSALS = [
  "PRODUCTION_ENVIRONMENT_DENIED",
  "RUNTIME_SIGNALS_NOT_DECLARED",
  "RUNTIME_SIGNALS_NOT_RECOGNISED",
  "RUNTIME_SIGNALS_CONTRADICTORY",
  "RUNTIME_ENVIRONMENT_CLASS_NOT_ESTABLISHED",
  "ENVIRONMENT_NOT_DECLARED",
  "ENVIRONMENT_NOT_RECOGNISED",
  "LOCAL_DECLARATION_REJECTED_ON_DEPLOYMENT",
  "DATASET_NOT_DECLARED",
  "DATABASE_IDENTITY_NOT_DECLARED",
  "DATABASE_IDENTITY_NOT_RECOGNISED",
  "DATABASE_IDENTITY_NOT_OBSERVABLE",
  "DATABASE_ENDPOINT_NOT_SUPPORTED",
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

function isOneOf<T extends string>(
  allowed: readonly T[],
  value: string,
): value is T {
  return (allowed as readonly string[]).includes(value);
}

function isRecognisedEnvironmentName(
  value: string,
): value is DemoResetEnvironmentName {
  return isOneOf(DEMO_RESET_ENVIRONMENT_NAMES, value);
}

/**
 * The only database endpoint shape this contract can attribute to a Supabase
 * cloud project: `https://<20-char project ref>.supabase.co`, with no port,
 * credentials, path, query or fragment.
 *
 * Local, self-hosted, proxied and custom-domain endpoints are refused rather
 * than parsed. Their identity is not a project ref, so a reset scoped by
 * project ref would be unprovable against them. Supporting them needs its own
 * explicit contract.
 */
export const SUPABASE_CLOUD_HOST_SUFFIX = ".supabase.co";
const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

export const SUPABASE_ENDPOINT_REJECTIONS = [
  "URL_NOT_PARSEABLE",
  "SCHEME_NOT_HTTPS",
  "CREDENTIALS_IN_URL",
  "PORT_NOT_ALLOWED",
  "PATH_NOT_ALLOWED",
  "QUERY_OR_FRAGMENT_NOT_ALLOWED",
  "HOST_NOT_SUPABASE_CLOUD",
  "PROJECT_REF_MALFORMED",
] as const;

export type SupabaseEndpointRejection =
  (typeof SUPABASE_ENDPOINT_REJECTIONS)[number];

export type SupabaseEndpointResolution =
  | { kind: "CLOUD_PROJECT"; projectRef: string }
  | { kind: "NOT_DECLARED" }
  | { kind: "UNSUPPORTED"; rejection: SupabaseEndpointRejection };

/** True when the value has the shape of a Supabase cloud project ref. */
export function isSupabaseProjectRef(value: string | undefined): boolean {
  const candidate = trimmed(value);
  return candidate !== undefined && SUPABASE_PROJECT_REF_PATTERN.test(candidate);
}

/**
 * Strictly resolves a Supabase cloud project endpoint.
 *
 * An arbitrary hostname or IP address is never presented as a cloud project
 * identity: `https://exampleqa.unrelated.invalid` and `http://127.0.0.1:54321`
 * are `UNSUPPORTED`, not project refs.
 */
export function resolveSupabaseEndpoint(
  url: string | undefined,
): SupabaseEndpointResolution {
  const value = trimmed(url);
  if (!value) {
    return Object.freeze({ kind: "NOT_DECLARED" as const });
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return unsupportedEndpoint("URL_NOT_PARSEABLE");
  }

  if (parsed.protocol !== "https:") {
    return unsupportedEndpoint("SCHEME_NOT_HTTPS");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return unsupportedEndpoint("CREDENTIALS_IN_URL");
  }
  if (parsed.port !== "") {
    return unsupportedEndpoint("PORT_NOT_ALLOWED");
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    return unsupportedEndpoint("PATH_NOT_ALLOWED");
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    return unsupportedEndpoint("QUERY_OR_FRAGMENT_NOT_ALLOWED");
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith(SUPABASE_CLOUD_HOST_SUFFIX)) {
    return unsupportedEndpoint("HOST_NOT_SUPABASE_CLOUD");
  }
  const ref = host.slice(0, -SUPABASE_CLOUD_HOST_SUFFIX.length);
  if (!SUPABASE_PROJECT_REF_PATTERN.test(ref)) {
    return unsupportedEndpoint("PROJECT_REF_MALFORMED");
  }
  return Object.freeze({ kind: "CLOUD_PROJECT" as const, projectRef: ref });
}

function unsupportedEndpoint(
  rejection: SupabaseEndpointRejection,
): SupabaseEndpointResolution {
  return Object.freeze({ kind: "UNSUPPORTED" as const, rejection });
}

/**
 * Project ref of a supported Supabase cloud endpoint, or null.
 *
 * Null covers both "nothing declared" and "endpoint not supported"; callers
 * that must distinguish the two use `resolveSupabaseEndpoint`.
 */
export function supabaseProjectRef(url: string | undefined): string | null {
  const endpoint = resolveSupabaseEndpoint(url);
  return endpoint.kind === "CLOUD_PROJECT" ? endpoint.projectRef : null;
}

type RuntimeResolution = {
  environmentClass: DemoResetEnvironmentClass;
  /** Conservative: an unclassifiable environment is treated as deployed. */
  deployed: boolean;
  refusal: DemoResetEnvironmentRefusal | null;
};

/**
 * Classifies the runtime from `NODE_ENV`, `VERCEL`, `VERCEL_ENV` and
 * `NEXT_PUBLIC_APP_ENV` against a closed table.
 *
 * Production is decided first so that no invalid or partial combination can
 * bypass the production denial. Everything the table does not cover resolves
 * to `UNKNOWN` with a stated reason.
 *
 * `next start` outside Vercel reports `NODE_ENV=production` with no
 * `VERCEL_ENV`, so its provenance cannot be attributed to a non-production
 * deployment and it is classified as production.
 */
function resolveRuntimeSignals(
  signals: DemoResetEnvironmentSignals,
): RuntimeResolution {
  const nodeEnv = trimmed(signals.nodeEnv);
  const vercel = trimmed(signals.vercel);
  const vercelEnv = trimmed(signals.vercelEnv);
  const publicAppEnv = trimmed(signals.publicAppEnv);

  const looksDeployed =
    vercel !== undefined || vercelEnv !== undefined || nodeEnv === "production";

  if (vercelEnv === "production" || publicAppEnv === "production") {
    return { environmentClass: "PRODUCTION", deployed: true, refusal: null };
  }

  if (!nodeEnv) {
    return unknownRuntime(looksDeployed, "RUNTIME_SIGNALS_NOT_DECLARED");
  }
  if (!isOneOf(NODE_ENV_VALUES, nodeEnv)) {
    return unknownRuntime(looksDeployed, "RUNTIME_SIGNALS_NOT_RECOGNISED");
  }
  if (vercel !== undefined && !isOneOf(VERCEL_VALUES, vercel)) {
    return unknownRuntime(looksDeployed, "RUNTIME_SIGNALS_NOT_RECOGNISED");
  }
  if (vercelEnv !== undefined && !isOneOf(VERCEL_ENV_VALUES, vercelEnv)) {
    return unknownRuntime(looksDeployed, "RUNTIME_SIGNALS_NOT_RECOGNISED");
  }
  if (publicAppEnv !== undefined && !isOneOf(PUBLIC_APP_ENV_VALUES, publicAppEnv)) {
    return unknownRuntime(looksDeployed, "RUNTIME_SIGNALS_NOT_RECOGNISED");
  }
  // On Vercel both variables are always present. One without the other is a
  // state this contract cannot attribute to a known deployment.
  if ((vercel !== undefined) !== (vercelEnv !== undefined)) {
    return unknownRuntime(looksDeployed, "RUNTIME_SIGNALS_CONTRADICTORY");
  }

  if (vercel !== undefined) {
    if (!publicAppEnv) {
      return unknownRuntime(true, "RUNTIME_SIGNALS_NOT_DECLARED");
    }
    if (vercelEnv === "preview") {
      return { environmentClass: "APPROVED_DEMO", deployed: true, refusal: null };
    }
    // `VERCEL_ENV=development` is `vercel dev`, which this contract cannot
    // separate from a deployed runtime.
    return unknownRuntime(true, "RUNTIME_ENVIRONMENT_CLASS_NOT_ESTABLISHED");
  }

  if (nodeEnv === "production") {
    return { environmentClass: "PRODUCTION", deployed: false, refusal: null };
  }
  return { environmentClass: "APPROVED_DEMO", deployed: false, refusal: null };
}

function unknownRuntime(
  deployed: boolean,
  refusal: DemoResetEnvironmentRefusal,
): RuntimeResolution {
  return { environmentClass: "UNKNOWN", deployed, refusal };
}

export function resolveDemoResetEnvironment(
  signals: DemoResetEnvironmentSignals,
): DemoResetEnvironmentResolution {
  const runtime = resolveRuntimeSignals(signals);
  const environmentClass = runtime.environmentClass;
  const refusals: DemoResetEnvironmentRefusal[] = [];

  if (environmentClass === "PRODUCTION") {
    refusals.push("PRODUCTION_ENVIRONMENT_DENIED");
  }
  if (runtime.refusal) {
    refusals.push(runtime.refusal);
  }

  const declaredEnvironment = trimmed(signals.declaredEnvironment);
  let environmentName: DemoResetEnvironmentName | null = null;
  if (!declaredEnvironment) {
    refusals.push("ENVIRONMENT_NOT_DECLARED");
  } else if (!isRecognisedEnvironmentName(declaredEnvironment)) {
    refusals.push("ENVIRONMENT_NOT_RECOGNISED");
  } else {
    environmentName = declaredEnvironment;
    if (environmentName === "local-development" && runtime.deployed) {
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
  } else if (!isSupabaseProjectRef(declaredDatabaseRef)) {
    refusals.push("DATABASE_IDENTITY_NOT_RECOGNISED");
  }

  const endpoint = resolveSupabaseEndpoint(signals.observedSupabaseUrl);
  if (endpoint.kind === "NOT_DECLARED") {
    refusals.push("DATABASE_IDENTITY_NOT_OBSERVABLE");
  } else if (endpoint.kind === "UNSUPPORTED") {
    refusals.push("DATABASE_ENDPOINT_NOT_SUPPORTED");
  } else if (
    declaredDatabaseRef &&
    endpoint.projectRef !== declaredDatabaseRef
  ) {
    refusals.push("DATABASE_IDENTITY_MISMATCH");
  }

  if (
    refusals.length > 0 ||
    environmentClass !== "APPROVED_DEMO" ||
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

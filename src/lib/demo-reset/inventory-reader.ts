/**
 * Read-only inventory reader for a demo reset dry-run.
 *
 * `inventory.ts` describes what an observation may look like. This module is
 * the reader that produces one, and it is the only asynchronous module in
 * `src/lib/demo-reset` because observing an environment is an I/O boundary.
 *
 * It reads through an injected `DemoResetRowCountSource` and builds no
 * database, Auth, Storage or chain client of its own. The port exposes exactly
 * one capability — count the rows of one approved object in one stated scope —
 * so there is no shape in which this module could modify anything, and a
 * caller can prove in a test that no read happened at all.
 *
 * ## The scope is part of the question, not of the implementation
 *
 * A count only means something once it says *which rows*. Asking a source to
 * "count `producer_fields`" and hoping it filters by the current run would put
 * the safety property in an undocumented closure, where nothing checks it and
 * a wrong answer looks exactly like a right one. It also fails silently in the
 * worst direction: an environment-wide number reported as a run's number
 * over-reports every other run's rows, and that number is what a future
 * confirmed reset would be reviewed against.
 *
 * So `DemoResetCountRequest` carries the scope explicitly. A `RUN` request can
 * only be constructed from a `DemoResetEstablishedRunScope`, which
 * `resolveDemoResetRunScope` alone produces, so a run-owned count cannot be
 * requested — or answered — without the proven run travelling with it.
 *
 * ## The reader cannot name an arbitrary table
 *
 * Manifests are injectable, and a future source will turn an object name into
 * a query. An allowlist compiled from the canonical manifest sits between the
 * two: `readableObject` is the only way to obtain a `DemoResetReadableObject`,
 * and it refuses any name the shipped manifest does not declare. An injected
 * manifest can therefore describe categories freely but can never widen what
 * the reader is physically able to touch, which keeps a future Supabase
 * implementation from becoming a general table-read primitive.
 *
 * ## What may honestly be counted
 *
 * - `ENVIRONMENT_WIDE` categories are counted environment-wide, because that
 *   *is* their declared scope, so the whole-environment number is the true one.
 * - `RUN_OWNED` categories are counted in the run's scope, and only with an
 *   established run.
 * - `NOT_SCOPABLE` categories are never queried. Run isolation is required for
 *   them and not yet expressible (`docs/DEMO_GOLDEN_PATH_V2.md` §9.3), so
 *   there is no filter that would make the number true. They are reported
 *   `UNAVAILABLE`, never as a count and never as zero.
 * - A category outside the `DATABASE` subsystem is not observable by a row
 *   count at all and is reported `UNAVAILABLE`.
 *
 * A scopable category that declares no database objects is counted as zero
 * rather than reported unavailable. That is a fact of the manifest and not an
 * unread source: the category enumerates its objects exhaustively, so
 * declaring none means it covers no database rows. `system-roles-and-
 * permissions` is the worked example — roles are TypeScript in
 * `src/domain/identity`, so the number of rows a reset would touch there is
 * exactly zero, and saying "unknown" would be less accurate rather than more
 * careful.
 *
 * Against the shipped manifest every database category is `NOT_SCOPABLE`, so
 * this reader issues **no query at all** today and the plan stays
 * `INCOMPLETE`. The remaining GP-01 row-isolation work is what earns those
 * categories a `RUN_OWNED` basis and a `RUN_OWNED_ROWS` row scope, and only
 * then does this reader have something it may truthfully count.
 *
 * See `docs/DEMO_GOLDEN_PATH_V2.md` §9.2 and §9.3.
 */

import {
  isObservationInstant,
  isValidRowCount,
  type CategoryObservation,
  type DemoResetInventory,
  type DemoResetInventoryGap,
} from "./inventory";
import {
  DEMO_DATASET_V2_RESET_MANIFEST,
  type DemoResetCategory,
  type DemoResetManifest,
} from "./manifest";
import type {
  DemoResetEstablishedRunScope,
  DemoResetRunScope,
  DemoResetUnestablishedRunScope,
} from "./run-scope";

/**
 * Objects the reader is permitted to count, compiled from the shipped
 * manifest.
 *
 * Derived rather than hand-listed so the two cannot drift, and read from the
 * canonical manifest rather than the injected one so that injecting a manifest
 * cannot widen it.
 */
export const DEMO_RESET_READABLE_OBJECTS: readonly string[] = Object.freeze(
  [
    ...new Set(
      DEMO_DATASET_V2_RESET_MANIFEST.categories
        .filter((category) => category.subsystem === "DATABASE")
        .flatMap((category) => [...category.objects]),
    ),
  ].sort(),
);

const READABLE_OBJECTS: ReadonlySet<string> = new Set(
  DEMO_RESET_READABLE_OBJECTS,
);

declare const READABLE_OBJECT: unique symbol;

/**
 * A name the reader may hand to a source.
 *
 * The brand has no runtime cost and cannot be produced by writing a string
 * literal, so the only supported way to obtain one is `readableObject`. A
 * source implementation can then treat its argument as already checked.
 */
export type DemoResetReadableObject = string & {
  readonly [READABLE_OBJECT]: true;
};

/** The allowlisted name, or null when the reader may not touch it. */
export function readableObject(name: string): DemoResetReadableObject | null {
  return READABLE_OBJECTS.has(name)
    ? (name as DemoResetReadableObject)
    : null;
}

/**
 * Which rows a count covers.
 *
 * `RUN` carries the proven scope rather than a bare identifier so that a
 * source is handed the environment, dataset and database the run was proven
 * against, and cannot be asked to count a run it was never shown.
 */
export type DemoResetCountScope =
  | { readonly kind: "ENVIRONMENT" }
  | { readonly kind: "RUN"; readonly run: DemoResetEstablishedRunScope };

export interface DemoResetCountRequest {
  readonly object: DemoResetReadableObject;
  readonly scope: DemoResetCountScope;
}

/**
 * One row count in the requested scope.
 *
 * `UNREADABLE` covers every reason a source could not establish the number —
 * absent privileges, a rejected statement, an unreachable database. The reason
 * is deliberately not carried through: it would reach an operator-facing plan,
 * and a database error message is not something this contract is willing to
 * surface. The category becomes a stated gap either way.
 */
export type DemoResetRowCount =
  | { kind: "COUNTED"; rows: number }
  | { kind: "UNREADABLE" };

/**
 * The single read capability this module is given.
 *
 * An implementation must count rows in the requested scope and do nothing
 * else. It is supplied by the caller so that the reader stays an explicit
 * dependency rather than reaching for ambient state, and so that a test can
 * assert it was never invoked.
 */
export interface DemoResetRowCountSource {
  countRows(request: DemoResetCountRequest): Promise<DemoResetRowCount>;
}

export type DemoResetInventoryRead =
  | {
      kind: "READ";
      inventory: DemoResetInventory;
      /** Requests actually issued, in the order they were issued. */
      objectsRead: readonly string[];
    }
  | { kind: "NOT_READ"; scope: DemoResetUnestablishedRunScope };

function unavailable(reason: DemoResetInventoryGap): CategoryObservation {
  return Object.freeze({ kind: "UNAVAILABLE" as const, reason });
}

/**
 * The scope a category must be counted in, or null when it may not be counted.
 *
 * `NOT_SCOPABLE` returns null because no filter would make its number true.
 * Declaring a basis is not the same as being able to honour it, so this is the
 * one place that decides, and there is no fallback to an environment-wide
 * number for a category that asked to be run-scoped.
 */
function countScopeFor(
  category: DemoResetCategory,
  run: DemoResetEstablishedRunScope,
): DemoResetCountScope | null {
  if (category.scopeBasis === "ENVIRONMENT_WIDE") {
    return Object.freeze({ kind: "ENVIRONMENT" as const });
  }
  if (category.scopeBasis === "RUN_OWNED") {
    return Object.freeze({ kind: "RUN" as const, run });
  }
  return null;
}

/**
 * Counts one category by summing its declared objects in one scope.
 *
 * Objects are read one at a time in declared order so that the sequence of
 * reads is deterministic and reviewable.
 *
 * Every returned value is re-checked structurally rather than trusted for its
 * declared type, following `inventory.ts`: a real source can hand back a null,
 * a string or a failed aggregate where a number is expected. A total that
 * would leave the safe-integer range is a defect too, because a number that
 * cannot be represented exactly is not a count.
 */
async function countCategory(
  category: DemoResetCategory,
  scope: DemoResetCountScope,
  source: DemoResetRowCountSource,
  objectsRead: string[],
): Promise<CategoryObservation> {
  let total = 0;
  for (const name of category.objects) {
    const object = readableObject(name);
    if (!object) {
      // An object the shipped manifest never declared. Refusing the whole
      // category rather than skipping the object keeps the sum from silently
      // under-reporting.
      return unavailable("SUBSYSTEM_NOT_READABLE");
    }
    objectsRead.push(object);

    let observation: DemoResetRowCount;
    try {
      observation = await source.countRows({ object, scope });
    } catch {
      // An unreachable or refusing source is an unavailable category, never a
      // zero. The thrown value is not propagated and not recorded: it can
      // carry database detail that must not reach an operator-facing plan.
      return unavailable("SUBSYSTEM_NOT_READABLE");
    }

    const kind: unknown = (observation as { kind?: unknown } | undefined)?.kind;
    if (kind === "UNREADABLE") {
      return unavailable("SUBSYSTEM_NOT_READABLE");
    }
    if (kind !== "COUNTED") {
      return unavailable("OBSERVATION_NOT_INTERPRETABLE");
    }

    const rows: unknown = (observation as { rows?: unknown }).rows;
    if (!isValidRowCount(rows) || !isValidRowCount(total + rows)) {
      return unavailable("OBSERVATION_COUNT_INVALID");
    }
    total += rows;
  }
  return Object.freeze({ kind: "COUNTED" as const, rows: total });
}

function defaultNow(): string {
  return new Date().toISOString();
}

/**
 * Observes the inventory for a run whose scope has already been established.
 *
 * The scope argument is the whole trust boundary. This module performs no
 * environment classification, no authority check and no run resolution of its
 * own; it accepts only an already-`ESTABLISHED` scope, which
 * `resolveDemoResetRunScope` produces solely from server-held state. A scope
 * that was refused for any reason — production runtime, unknown environment,
 * unapproved database or dataset, missing authority, a run belonging to
 * somebody else — and equally a scope that was never established returns
 * `NOT_READ` with the source untouched. There is no path in which a denied or
 * runless request reaches the database.
 *
 * `now` is injected so that an observation instant is reproducible in a test.
 * An instant that is not a real one is recorded as absent rather than
 * substituted, which makes the planner refuse a claimed count instead of
 * accepting an invented observation time.
 */
export async function readDemoResetInventory(input: {
  scope: DemoResetRunScope;
  source?: DemoResetRowCountSource | null;
  manifest?: DemoResetManifest;
  now?: () => string;
}): Promise<DemoResetInventoryRead> {
  const scope = input.scope;
  if (scope.kind !== "ESTABLISHED") {
    return Object.freeze({ kind: "NOT_READ" as const, scope });
  }

  const manifest = input.manifest ?? DEMO_DATASET_V2_RESET_MANIFEST;
  const source = input.source ?? null;
  const objectsRead: string[] = [];
  const categories: Record<string, CategoryObservation> = {};

  for (const category of manifest.categories) {
    if (category.subsystem !== "DATABASE") {
      categories[category.id] = unavailable("SUBSYSTEM_NOT_READABLE");
      continue;
    }

    const countScope = countScopeFor(category, scope);
    if (!countScope) {
      categories[category.id] = unavailable(
        "RUN_SCOPED_INVENTORY_SOURCE_ABSENT",
      );
      continue;
    }
    if (category.objects.length === 0) {
      categories[category.id] = Object.freeze({
        kind: "COUNTED" as const,
        rows: 0,
      });
      continue;
    }
    // A category that needs a query but has no source is unavailable. Missing
    // access to a source is never read as an absence of rows.
    categories[category.id] = source
      ? await countCategory(category, countScope, source, objectsRead)
      : unavailable("SUBSYSTEM_NOT_READABLE");
  }

  const instant = (input.now ?? defaultNow)();

  return Object.freeze({
    kind: "READ" as const,
    inventory: Object.freeze({
      source: "OBSERVED" as const,
      observedAt: isObservationInstant(instant) ? instant : null,
      categories: Object.freeze(categories),
    }),
    objectsRead: Object.freeze([...objectsRead]),
  });
}

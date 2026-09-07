/**
 * Read-only inventory reader for a demo reset dry-run.
 *
 * `inventory.ts` describes what an observation may look like. This module is
 * the reader that produces one, and it is the only asynchronous module in
 * `src/lib/demo-reset` because observing an environment is an I/O boundary.
 *
 * It reads through an injected `DemoResetRowCountSource` and builds no
 * database, Auth, Storage or chain client of its own. The port exposes exactly
 * one capability — count the rows of one declared object — so there is no
 * shape in which this module could modify anything, and a caller can prove in
 * a test that no read happened at all.
 *
 * ## What may honestly be counted
 *
 * A count is reported only where it answers the question the planner asks,
 * which is how many rows a reset would touch **for this run**:
 *
 * - `NOT_SCOPABLE` and `RUN_OWNED` categories are never queried. No business
 *   table carries run ownership (`docs/DEMO_GOLDEN_PATH_V2.md` §9.3), so an
 *   environment-wide count of those tables would over-report the run by
 *   including every other run's rows. Over-reporting here is not cosmetic: it
 *   is the number a future confirmed reset would be reviewed against. They are
 *   reported `UNAVAILABLE`, never as a count and never as zero.
 * - `ENVIRONMENT_WIDE` categories are counted, because whole-environment *is*
 *   their declared scope, so the environment-wide number is the true one.
 * - A category outside the `DATABASE` subsystem is not observable by a row
 *   count at all and is reported `UNAVAILABLE`.
 *
 * An `ENVIRONMENT_WIDE` category that declares no database objects is counted
 * as zero rather than reported unavailable. That is a fact of the manifest and
 * not an unread source: the category enumerates its objects exhaustively, so
 * declaring none means it covers no database rows. `system-roles-and-
 * permissions` is the worked example — roles are TypeScript in
 * `src/domain/identity`, so the number of rows a reset would touch there is
 * exactly zero, and saying "unknown" would be less accurate rather than more
 * careful.
 *
 * Against the shipped manifest every database category is `NOT_SCOPABLE`, so
 * this reader issues **no query at all** today and the plan stays
 * `INCOMPLETE`. That is the correct result rather than a missing feature: the
 * remaining GP-01 run-isolation schema is what turns those categories into
 * `RUN_OWNED` and gives this reader something it may truthfully count.
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
  DemoResetRunScope,
  DemoResetRunScopeRefusal,
} from "./run-ownership";

/**
 * One environment-wide row count.
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
 * An implementation must count rows and do nothing else. It is supplied by the
 * caller so that the reader stays an explicit dependency rather than reaching
 * for ambient state, and so that a test can assert it was never invoked.
 */
export interface DemoResetRowCountSource {
  countRows(object: string): Promise<DemoResetRowCount>;
}

export type DemoResetInventoryRead =
  | {
      kind: "READ";
      inventory: DemoResetInventory;
      /** Declared objects actually queried, in the order they were queried. */
      objectsRead: readonly string[];
    }
  | { kind: "NOT_READ"; refusal: DemoResetRunScopeRefusal };

function unavailable(reason: DemoResetInventoryGap): CategoryObservation {
  return Object.freeze({ kind: "UNAVAILABLE" as const, reason });
}

/** Observation for a category that needs no query to be settled, else null. */
function settledWithoutQuery(
  category: DemoResetCategory,
): CategoryObservation | null {
  if (category.subsystem !== "DATABASE") {
    return unavailable("SUBSYSTEM_NOT_READABLE");
  }
  // `RUN_OWNED` joins `NOT_SCOPABLE` here: a manifest may claim run ownership
  // before a run-scoped source exists, and claiming it is not the same as
  // being able to count it. Both fail closed rather than fall back to an
  // environment-wide number.
  if (category.scopeBasis !== "ENVIRONMENT_WIDE") {
    return unavailable("RUN_SCOPED_INVENTORY_SOURCE_ABSENT");
  }
  if (category.objects.length === 0) {
    return Object.freeze({ kind: "COUNTED" as const, rows: 0 });
  }
  return null;
}

/**
 * Counts one category by summing its declared objects.
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
  source: DemoResetRowCountSource,
  objectsRead: string[],
): Promise<CategoryObservation> {
  let total = 0;
  for (const object of category.objects) {
    objectsRead.push(object);

    let observation: DemoResetRowCount;
    try {
      observation = await source.countRows(object);
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
 * Observes the inventory for a run whose ownership has already been proven.
 *
 * The scope argument is the whole trust boundary. This module performs no
 * environment classification, no authority check and no ownership check of its
 * own; it accepts only an already-`ESTABLISHED` scope, which
 * `resolveDemoResetRunScope` produces solely from server-held context. A scope
 * that was refused for any reason — production runtime, unknown environment,
 * unapproved database or dataset, missing authority, a run belonging to
 * somebody else — returns `NOT_READ`, and the source is never invoked. There
 * is no path in which a denied request reaches the database.
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
  if (input.scope.kind !== "ESTABLISHED") {
    return Object.freeze({
      kind: "NOT_READ" as const,
      refusal: input.scope.refusal,
    });
  }

  const manifest = input.manifest ?? DEMO_DATASET_V2_RESET_MANIFEST;
  const source = input.source ?? null;
  const objectsRead: string[] = [];
  const categories: Record<string, CategoryObservation> = {};

  for (const category of manifest.categories) {
    const settled = settledWithoutQuery(category);
    if (settled) {
      categories[category.id] = settled;
      continue;
    }
    // A category that needs a query but has no source is unavailable. Missing
    // access to a source is never read as an absence of objects.
    categories[category.id] = source
      ? await countCategory(category, source, objectsRead)
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

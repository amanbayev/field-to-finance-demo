# MC-04 — Concrete Instrument and Closed Market Roots

Status: **source implemented / local native SQL verified / shared schema not
applied / real Supabase/PostgREST transport not tested**. This is an identity
foundation, not issuance, admission, an open market or the Protocol Engine.

Base: `develop = origin/develop = 1eadd6ab7615614f8bbfc1b6d16103116810d6f8`
(PR #19). A fetch without prune confirmed the supplied base. The working tree was
clean, with no unfinished Git operation or local-only commits. Work is on
`feature/mc-04-concrete-instrument-closed-market-roots`. Only this working copy was
used; the second project copy was not touched.

One additive migration, generated with installed Supabase CLI **2.116.0**, after
reading `migration new --help`:
`supabase/migrations/20260922043414_mc04_concrete_instrument_closed_market_roots.sql`.
CLI state was confined with `SUPABASE_HOME=/private/tmp/mc04-tools/cli` and telemetry
was disabled. No merged migration, dependency, lockfile, environment file or
deployment configuration changed. The migration inserts no business roots and
imports no protocol version.

## Identity and authority

```text
market_core_markets.instrument_ref
  → market_core_instruments.id
      → protocol_version_records.id        exact immutable MC-03 reference
      → organizations.id                   explicit issuer; not Protocol Owner
      → demo_reset_run_instances.id | NULL  canonical Run | NON_RUN
```

`market_core_instruments` is a small permanent table in `public`:

| Column | Meaning |
| --- | --- |
| `id` | `INS-` plus full database-generated UUID; primary key |
| `issuer_organization_id` | Required organization FK |
| `protocol_version_id` | Required exact persisted MC-03 version FK |
| `run_id` | Nullable run FK; NULL explicitly means NON_RUN |
| `symbol`, `name` | Nonempty display metadata, not identity or deduplication keys |
| `instrument_type` | Existing `ASSET_TOKEN` / `PROTOCOL_INVESTMENT` domain values |
| `status` | Restricted to existing domain state `STRUCTURING`, hence not issued |
| `created_at`, `created_by` | Initial finite recording time and effective database role |

Identity, issuer, exact version, Run/NON_RUN (including NULL), instrument type and
creation provenance cannot be updated. Privileged label edits do not change identity.
There is no symbol uniqueness. Repeated internal creation with the same metadata
creates independent instruments. The primitive takes no client-selected root ID.
No supply, mint, issuance/admission record, legal date, wallet, owned balance or
Protocol Owner inference is added. A snapshot's `ACTIVE` flag confers no admission.

The version FK must resolve as supplied. There is no catalog, current/latest or
import fallback. Test fixtures import the known MC-03 reference explicitly in
one-off local clusters only, after testing its absence.

All new root FKs use `ON UPDATE RESTRICT ON DELETE RESTRICT`. Retained instruments
also retain their issuer, version and run; retained markets retain their instrument.
Deletion/reinsertion and TRUNCATE are not lifecycle operations for these roots.
Disabling/dropping guards through administrative DDL is outside this guarantee.

## Permanent issuer seal and final row validation

The existing MC-02 `private.market_core_seal_organization(uuid)` is the only sealing
mechanism. An instrument's BEFORE INSERT trigger invokes it, even without a Market
Core participant. It locks the organization `FOR UPDATE` and performs the existing
same-value seal UPDATE. No participant or trading permission is created.

Locking happens **before** INSERT's FK checks take `KEY SHARE`. An AFTER-only seal
was shown by a competing-connection regression to cause a lock-upgrade deadlock.
The final implementation serializes issuer creators before those FK checks.

The whole-row AFTER INSERT/UPDATE guard examines final values after all BEFORE
triggers. It requires a permanently sealed final issuer with
`organization.run_id IS NOT DISTINCT FROM instrument.run_id`. The monotonic seal
makes that ownership stable. It never locks a second redirected issuer. A redirect
to an unsealed or differently scoped issuer fails the table invariant. Even a
redirect to an already sealed issuer in the same context fails the primitive's
additional comparison against the explicit request. Suppression and changes to
ID, version, metadata or original provenance also fail that comparison. These
failures roll back every root and any seal written by the attempted operation.

There is no duplicate seal column or seal history table. The existing organization
AFTER guard continues to prevent unsealing, reparenting and BEFORE-trigger
smuggling. Run A/Run A and NULL/NULL work; Run A/Run B and either NULL/Run direction
fail. Sealing does not mean the issuer is approved or admitted.

## Closed markets and compatibility bridge

The existing `market_core_markets` gains nullable `instrument_ref` and `book_key`.
Historical rows retain NULL for both; no synthetic instrument is assigned to them.
Every new inserted market requires an instrument reference. For modern rows the
legacy text `instrument_id` must equal that exact reference. Symbol is read from
the instrument's separate column; it is never substituted for identity.

There is **no market.run_id**. A partial unique index enforces
`(instrument_ref, settlement_asset_id, book_key)` for modern rows. Different books
and different quote/settlement assets can share one instrument and one run.

The AFTER guard freezes market ID, both instrument references, book key, settlement
asset ID/label/monetary-value flag, market type, allowed order types, whole-quantity
configuration and original creation time. The bridge's value **and presence** are
immutable for historical and modern rows: no legacy adoption, no modern downgrade.

Modern rows have a full `MKT-UUID` ID and must stay `CLOSED`, `DEMO_CLOSED`, with
transacting, matching and settlement disabled. This is a CHECK constraint on final
values, not merely defaults. No opening workflow is provided. Quote IDs are
explicit configuration, not proof of an implemented settlement rail or cash asset.
The primitive creates demonstrator configuration and makes no monetary-value claim.

The market AFTER INSERT guard creates its mandatory zeroed counter row and checks
the returned row against its market and all zero counters. Suppressed, redirected,
nonzero or failed counter insertion rolls back market/instrument/seal creation.
Modern counter deletion/reparenting is refused. Market and counter TRUNCATE are
rejected at statement level, including on a currently empty table: TRUNCATE is not
MVCC-safe, so a stale snapshot cannot establish the absence of retained roots.
This restriction does not remove existing legacy row-level trading operations.

## Internal primitives and concurrency

Only these private SECURITY INVOKER primitives create roots:

```sql
select * from private.mc04_create_instrument(
  issuer_uuid, exact_version_id, run_uuid_or_null, symbol, name, instrument_type);
select * from private.mc04_create_closed_market(
  instrument_id, settlement_asset_id, settlement_asset_label, book_key);
select * from private.mc04_create_instrument_and_market(
  issuer_uuid, exact_version_id, run_uuid_or_null, symbol, name, instrument_type,
  settlement_asset_id, settlement_asset_label, book_key);
```

These are signatures illustrated with symbolic arguments, not commands against a
shared database. Each function runs inside the caller's transaction, validates its
actual INSERT RETURNING row and propagates errors. Composite creation commits or
rolls back instrument, market, mandatory counters and sealing together. Additional
books use the existing instrument ID and never create an instrument.

| Competing operations | READ COMMITTED | REPEATABLE READ |
| --- | --- | --- |
| Assignment commits before creation with matching run | Sees assignment and seals that run | Stale creator raises `40001` |
| Assignment commits before NON_RUN creation | Context rejection | Stale creator raises `40001` |
| NON_RUN seal commits before assignment | Assignment rejects (`P0001`) | Stale assignment raises `40001` |
| Creator rolls back while assignment waits | Assignment succeeds; no roots/seal retained | Same |
| Concurrent creations for one issuer, sealed or unsealed | Distinct instrument IDs; creators serialize | Stale creator raises `40001` |
| Identical book configuration; first creator commits | One row/counter; loser raises `23505` | Same in the native test |
| Identical book configuration; first creator rolls back | Waiting creator inserts its own row/counter | Same |

Plain INSERT and the unique index decide book conflicts. There is no updating
upsert, hidden retry, exception swallowing or intermediate commit. Serialization
failures are returned as failures. Internal book uniqueness is not a client
exactly-once promise. Command receipts/idempotency, external creation APIs and GP
root-slot orchestration remain later work.

## Rights and the legacy execution boundary

The new instrument table has RLS enabled and no runtime policies or grants. All
table privileges and all ten new private function EXECUTEs are explicitly revoked
from PUBLIC, anon, authenticated and service_role, including hostile inherited
default privileges. No role or global default privilege is changed. BYPASSRLS does
not restore revoked table/function permissions.

Existing grants on markets/counters and other legacy tables remain unchanged.
An additional modern-market guard requires the effective role to be that table's
owner, including an intentionally privileged definer context. Existing service-role
market DML therefore cannot provision/update modern roots. No such runtime definer
creation API is added.

The write-path audit found:

- Existing submit accepts arbitrary market IDs and checks operational flags, but
  previously replayed `market_core_idempotency` **before** reading the market. A
  native red test demonstrated `ok: true` for a modern market with a legacy cache
  key. MC-04 adds one pre-cache veto: the supplied target must exist and be legacy
  (`instrument_ref IS NULL`); otherwise submit returns `MARKET_CLOSED`. The rest of
  the current MC-01 submit body and its ACL are preserved exactly. Existing legacy
  retries retain their behavior. This is not a new receipt contract.
- No existing public open/matching-toggle workflow was found. Direct UPDATE cannot
  activate a modern market because the CHECK constraint enforces closure.
- AFTER order/trade guards reject either a modern market ID **or** a modern
  instrument ID, including a modern instrument smuggled through a legacy market.
  They also cover owner/definer DML and the old private apply-fill path. This veto
  helper is SECURITY DEFINER solely to read hidden roots during existing runtime
  writes; it writes nothing, has an empty search_path and no runtime EXECUTE grants.
- Old isolated-test RPCs that create unassigned markets cannot provision a new
  market anymore. Their revoked grants are not broadened. Historical migration-
  boundary suites continue to exercise them at the original schema boundary.
- Matching, cancellation, settlement and Registrar function bodies are unchanged.
  Native full-chain coverage submits, matches and cancels on the existing legacy
  market, keeps settlement pending and compares Registrar ownership before/after.

No new root enters a working trading path, and no fake eligibility, funds,
settlement finality or registered ownership is created by these primitives.

## Manifest and deferred work

`market-core-instrument-identity` is PRESERVED / ENVIRONMENT_WIDE / whole-table,
following MC-02/03. The closed count RPC/source does not count it: the real reader
reports UNAVAILABLE with null count, never zero. Tests assert this and the planner's
INCOMPLETE result. No reset executor exists.

The existing 14-table `market-core-business` category stays explicitly unresolved.
It now mixes retained modern market roots and unassigned legacy rows; this slice
does not reclassify it. Restrictive issuer/run dependencies also require MC-13
resolution. The canonical modern market path alone does not complete inventory.

No MC-05/06/07/08/09/10/11/12/13 implementation, GP CURRENT bootstrap, GP-02,
public command API, Server Action, HTTP route, UI, read-service integration,
issuance/admission workflow or Protocol Engine is included.

## Historical local verification and reproduction (bd2d19f)

Host discovery: `uname -m` and Node both reported **darwin arm64**, Node **22.23.2**.
Historical tooling was incomplete. Optional `embedded-postgres@18.4.0-beta.17` and
`@embedded-postgres/darwin-arm64@18.4.0-beta.17` were installed only under
`/private/tmp/mc04-tools` with `--ignore-scripts --save-exact --no-audit --no-fund`.
The package's `scripts/hydrate-symlinks.js` and its relative native symlink manifest
were read before executing that local hydration script. The installed subprocess
code was inspected: createPostgresUser is false, clusters use unique directories,
passwords/fixtures are synthetic and every client specifies the private socket.
No global package/service or repository dependency was installed or changed.

All native runs used PostgreSQL **18.4**, UTF-8, private temporary Unix sockets,
`listen_addresses=''`, `umask 077` and a cleared environment without database URLs
or shared credentials. MC-04 asserts server version, encoding, socket path, empty
TCP listen addresses and private directory permissions. Each owned cluster was
stopped and removed, including failed runs; logs remain outside its data directory.
The ordinary sandbox denied `shmget`; the successful runs used scoped execution
permission for the same inspected commands.

Reproduce after separately establishing the documented optional tooling:

```sh
umask 077
env -i PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=/private/tmp \
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 \
  GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/mc04-tools/node_modules/embedded-postgres/dist/index.js \
  node --test supabase/tests/market-core-roots.test.mjs

env -i PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=/private/tmp \
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 MC04_FULL_SCHEMA=1 \
  GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/mc04-tools/node_modules/embedded-postgres/dist/index.js \
  node --test supabase/tests/market-core-participants.test.mjs \
    supabase/tests/protocol-version-records.test.mjs \
    supabase/tests/demo-run-issuance.test.mjs \
    supabase/tests/demo-run-participant-bindings.test.mjs

env -i PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=/private/tmp \
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 \
  GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/mc04-tools/node_modules/embedded-postgres/dist/index.js \
  node --test supabase/tests/market-core-submit-result.test.mjs \
    supabase/tests/market-core-global-ids.test.mjs \
    supabase/tests/protocol-version-records.test.mjs

npm run check
npm run build
git diff --check
```

The full-chain mode explicitly selects all **22 ordered migrations**. Historical
default boundaries remain pinned; MC-00/01 files are byte-identical. Compatibility
assertions allow only the exact nullable market columns/empty instrument table and
exact submit veto. Removing that veto from `pg_get_functiondef` must recover the
entire prior definition; all old ACLs and unrelated definitions remain asserted.
No previous business assertion was removed or relaxed.

| Check | Result |
| --- | --- |
| MC-04 native acceptance, complete chain | **31/31 PASS**, including real connection races and rollback |
| MC-02 + MC-03 + GP issuance/bindings, complete MC-04 chain | **127/127 PASS** |
| Historical MC-00/MC-01/MC-03 boundaries | **64/64 PASS** (42 + 22) |
| Historical MC-02 boundary | **28/28 PASS** |
| `npm run check` | **1016 tests / 67 files PASS**, lint/typecheck PASS |
| Standard Turbopack `npm run build` | **PASS**, Next.js 16.3.1, 69 pages |
| `git diff --check` | PASS |

During development two new tests were red before corrective changes: legacy
idempotency replay on a modern market and the issuer FK/seal lock-upgrade race.
Both pass with the final migration. An earlier test setup used an invalid synthetic
organization enum and the wrong SQLSTATE for PG18 RESTRICT; the fixture/expected
specific error were corrected without changing production behavior.

Logs for this pass: `/private/tmp/mc04-tools/mc04-native.log`, `mc04-compat.log`,
`historical-boundaries.log`, `mc02-boundary.log`, `check.log`, `build-clean.log`.
The failed build evidence remains in `build.log`. Red
reproductions remain in `mc04-native-red.log` and `mc04-lock-red.log`. These are
local ephemeral evidence, not committed business data or shared-schema evidence.

The first build and its immediate retry failed with Turbopack's local IPC port
permission error. A scoped loopback probe succeeded. Moving generated `.next` to
`/private/tmp/mc04-tools/next-failed-ipc` and rerunning the same standard command
with scoped local IPC permission succeeded. No bundler/configuration workaround
was used. The successful build ran with `env -i`, disabled Next telemetry and
distinct empty temporary npm user/global configuration files; no runtime credential
file was present. The earlier cache was retained only as disposable diagnostics.

## Changed files

| Area | Files |
| --- | --- |
| New migration | `supabase/migrations/20260922043414_mc04_concrete_instrument_closed_market_roots.sql` |
| New native acceptance and precise compatibility assertion | `supabase/tests/market-core-roots.test.mjs`, `supabase/tests/mc04-compatibility.mjs` |
| Explicit full-chain modes, original assertions retained | `supabase/tests/market-core-participants.test.mjs`, `supabase/tests/protocol-version-records.test.mjs`, `supabase/tests/demo-run-issuance.test.mjs`, `supabase/tests/demo-run-participant-bindings.test.mjs` |
| Manifest and inventory regressions | `src/lib/demo-reset/manifest.ts`, `src/lib/demo-reset/manifest.test.ts`, `src/lib/demo-reset/inventory-reader.test.ts`, `src/lib/demo-reset/plan.test.ts`, `src/data/demo-reset/postgres-row-count-source.test.ts` |
| Design and evidence | `docs/MC04_CONCRETE_INSTRUMENT_AND_CLOSED_MARKET_ROOTS.md` |

NOT_RUN: shared schema application, real Supabase/PostgREST transport, shared
Auth/Storage, Solana/Devnet, mint/settlement, remote CI/deployment. No push, PR
creation/update, merge or Vercel operation was performed. Before any separately
authorized Draft PR publication, review the final diff/commit and verification
record, recheck develop drift, and account for the repository's automatic preview
on push. Applying the shared schema or opening markets needs separate authorization
and later implementation; this local result grants neither.

References consulted: [Supabase API security and grants](https://supabase.com/docs/guides/api/securing-your-api),
[PostgreSQL trigger behavior](https://www.postgresql.org/docs/18/trigger-definition.html).
The Supabase changelog markdown request was unavailable in this environment; the
installed CLI help and official API security guide supplied the relevant guidance.


## Review corrections — P2-READ and P2-CONFIG (2026-09-22)

The independent review of `bd2d19f573022bbefa510652855403b8ad5bbb1f`
returned **CHANGES_REQUIRED**. The results above are historical implementation
checks, not approval of this correction. This bounded pass stays on
`feature/mc-04-concrete-instrument-closed-market-roots`, based on
`1eadd6ab7615614f8bbfc1b6d16103116810d6f8`, and adds one ordinary local commit
with `bd2d19f` as parent. No amend, rebase, base synchronization or remote fetch
was performed. Initial root, origin, branch, HEAD, clean tree, absence of unfinished
Git operations and one local-only commit were verified. The preserved reviewer
probe and log in `/private/tmp/mc04-review-BVEQaZ` were read.

No evidence contradicting the recorded unapplied/shared status was found in the
local materials. Shared infrastructure was not queried. Only the existing,
unpublished MC-04 migration source is corrected; every migration in the base,
including MC-02 and MC-03, remains byte-identical.

### P2-READ: explicit legacy boundary in the production adapter

The final `public.market_core_snapshot()` definition is the one in
`20260823200000_registrar_book_and_live_proof.sql`. Its markets collection uses
`to_jsonb(m)` and **already returns `instrument_ref` and `book_key` after MC-04**.
Native authenticated SQL verifies this. The snapshot SQL body, grants, definer
context and exposed schemas are unchanged; no new JSON classification flag is
needed. The authority is the stored `market_core_markets.instrument_ref` FK and
its immutable NULL/non-NULL bridge, not a symbol, quote asset, ID prefix, run ID,
client flag or missing property. Modern NON_RUN therefore remains modern.

`engineStateFromSnapshot()` now requires a markets array, an own `instrument_ref`
property on every row, nonblank string market/instrument IDs, and either explicit
NULL or a nonblank exact concrete reference equal to `instrument_id`. Missing or
corrupt classification throws `MARKET_CORE_SNAPSHOT_INVALID`, including when
mixed with otherwise valid legacy data. It never treats `undefined` as legacy.

Only explicit NULL rows can enter the legacy adapter. Within that class, the
existing catalog adapter supports its exact catalog market/instrument pair;
unknown resources are omitted, never mapped onto WHEAT. Orders, reservations,
trades and events must match an accepted market/instrument pair. Holdings and
Registrar overlays use accepted instrument IDs; secondary settlements must refer
to a retained trade. Modern roots receive no synthetic `MarketInstrument`,
issuance/admission metadata, holdings or primary placement proof.

Settlement accounts have participant/asset identity, not instrument or market
identity in the existing schema. They remain in the legacy result only for the
accepted legacy book's asset. A shared quote does **not** classify a market or
create a modern account/ownership relation; no new account model was introduced.

An empty or modern-only snapshot returns empty engine collections. Catalog
holdings, instruments, eligibility and the existing primary proof overlay remain
only in the observed, supported legacy demo context. The mapper no longer falls
back to `catalogMarkets`. The existing secondary consumer requires its exact
WHEAT demo target and instrument or reports `MARKET_CORE_UNAVAILABLE`; its submit
precheck likewise no longer selects `state.markets[0]`. This adds no selector,
modern persistent reader, UI or later-stage functionality.

The wire shape did not change, but the adapter's minimum accepted fixture contract
did: previous abbreviated mapper fixtures now include an explicit legacy market
and its NULL bridge, and execution fixtures include their real market/instrument
references. Their original legal ownership, UUID, admission and cancellation
assertions are retained unchanged. The legacy fallback inventory remains historical
GP planning material; its former empty-market behavior is superseded here.

### P2-CONFIG: final-row validation with definite NULL rejection

The existing owner-only `private.mc04_market_guard()` AFTER INSERT/UPDATE trigger
now uses the unchanged `private.protocol_version_text_valid(text)` for book key,
quote ID/label and instrument references. The helper rejects NULL, empty text and
all 25 ECMAScript trim characters (including tab, LF, CR, NBSP, Unicode spaces and
BOM). It only tests content: substantive strings retain their exact case and
leading/trailing whitespace. Existing format/FK/bridge constraints continue to
validate root identity; CLOSED/DEMO_CLOSED and NOT NULL constraints validate the
remaining required operational text. No helper definition, grant or MC-03 byte
changed, and no normalization was added.

`market_type` must be exactly `REGULATED_INSTITUTIONAL_DEMONSTRATOR`.
`allowed_order_types` must be exactly the one-dimensional, one-based, single-element
`ARRAY['LIMIT']::text[]`. Duplicate LIMIT entries, other dimensions/lower bounds,
NULL/empty arrays, NULL elements, valid-plus-NULL, blank elements and unsupported
types are refused. `IS DISTINCT FROM` gives definite rejection for NULL and uses
PostgreSQL array equality including dimensions/bounds; neither containment nor
`ALL` is used. PostgreSQL documents the dimensional array comparisons in its
[array operators reference](https://www.postgresql.org/docs/18/functions-array.html).
ID format uses `IS NOT TRUE`; the text helper returns a definite
boolean. No SQL UNKNOWN can bypass this validation.

The guard checks the row after every BEFORE trigger and before creating the
mandatory counter. It covers internal primitives, direct owner DML and effective
owner SECURITY DEFINER writes. Existing immutable UPDATE guards run unchanged
before configuration validation, including fields altered outside an UPDATE's
target list. No deletion/repair bypass was added. Failed single or compound
creation retains no new market/counter/instrument or new seal; an earlier seal
survives. A substantive `REVIEW-QUOTE` remains valid.

### Regression evidence and validation for this correction

Correct-behavior native regressions were added and run against the original
production implementation **before production edits**. Both defects were red:

| Probe | Original bd2d19f | Corrected source |
| --- | --- | --- |
| Authenticated native snapshot → production mapper | SQL `CLOSED / REVIEW-QUOTE`; mapped `SECONDARY_OPEN / DEMO-KZT`, concrete instrument absent | SQL unchanged; modern market excluded, no substitute instrument/holdings; legacy retained |
| Primitive quote=`tab`, label=`LF`, book=`CR+LF+tab` | Accepted | Rejected atomically |
| Owner INSERT, empty market_type (otherwise valid) | Accepted | Rejected atomically |
| Owner INSERT, ARRAY[NULL] (otherwise valid) | Accepted | Rejected atomically |

Each malformed variant is isolated. The native suite exercises all 25 trim
characters independently and in mixtures for primitive/owner/definer/BEFORE INSERT
and final UPDATE paths, closed enum/array shape variants, full-row rollback,
new/existing seals and preservation of substantive text. Test-only definer wrappers
exist exclusively inside the disposable database, are dropped, and add no runtime
API or repository migration grants.

The reader regression loads the actual production TypeScript mapper and services
with the repository's installed TypeScript compiler. Only the transport factory is
replaced with the native authenticated SQL call. It covers native legacy-only,
empty, mixed Run A/Run B/NON_RUN, identical symbol/quote, modern-only and related
holdings/eligibility/reservation/event/settlement rows. Unit regressions cover
malformed/missing JSON classification and related execution filtering, plus exact
consumer target failure. This is **native SQL context coverage, not real HTTP or
PostgREST transport verification**.

| Check on corrected source | Result |
| --- | --- |
| Native MC-04 full chain | **745/745 PASS**, 42 top-level tests plus 703 isolated subtests |
| MC-02 + MC-03 + GP issuance/bindings, full corrected chain | **127/127 PASS** |
| Historical MC-00/01/02/03 boundaries | **92/92 PASS** |
| Targeted mapper/consumer/admission unit tests | **61/61 PASS** |
| `npm run check` | **1034 tests / 68 files PASS**, lint and TypeScript PASS |
| Standard `npm run build` | **PASS**, Next.js 16.3.1 / Turbopack, 69 pages |
| `git diff --check` | PASS |

All native runs use the prepared PostgreSQL **18.4**, fresh UTF-8 clusters,
private Unix sockets, disabled TCP, mode-0700 directories and `env -i` without
shared credentials. For historical suites, a temporary external wrapper fixes
UTF-8 and verifies server version, encoding, socket and directory permissions at
startup. It does not change repository tests or dependencies. All clusters owned
by this pass are stopped and their data removed by teardown.

Evidence directory: `/private/tmp/mc04-corrections/`. Relevant logs:
`native-red-confirmed.log`, `native-final.log`, `full-chain-compat.log`,
`historical-boundaries.log`, `reader-green-final.log`, `check-final.log`, and
`build-final.log`. Earlier diagnostic logs are retained separately. The initial
native attempt failed because the sandbox denied `shmget`; scoped execution
resolved it. A test-only definer schema-usage error, Vitest array-parameter fixture
shape, a synthetic reservation unique-index collision and a loader lint variable
name were corrected without weakening assertions. The original native red probes
were reconfirmed after fixing the definer harness and before production edits.
The first standard build hit Turbopack's sandbox IPC port restriction; its generated
cache was moved outside the repository before retrying the identical command with
local IPC permission. No bundler or deployment configuration changed.

Correction files:

- `supabase/migrations/20260922043414_mc04_concrete_instrument_closed_market_roots.sql`
- `src/services/secondary-market-repository.ts`
- `src/services/secondary-market-service.ts`
- `supabase/tests/market-core-roots.test.mjs`
- `supabase/tests/mc04-reader-harness.mjs`
- `src/services/secondary-market-boundary.test.ts`
- `src/services/secondary-market-repository.test.ts`
- `src/services/secondary-market-service.test.ts`
- `src/domain/market-core/trade-admission.test.ts`
- this document.

NOT_RUN (outside authorization): shared Supabase/schema/migrations, real HTTP
PostgREST, Auth/Storage services, Solana/Devnet or settlement, remote CI and
Vercel/deployment. No push, PR, Ready or merge. Dependencies, lockfile, environment
and deployment settings, main/develop and the second working copy are unchanged.
Exact version/seal/context/concurrency guards, CLOSED modern roots, legacy
submit/matching/cancellation, Registrar, UNAVAILABLE/null inventory and INCOMPLETE
planner remain covered. MC-05/06 and later stages remain deferred. The corrective
HEAD requires a **separate independent review**; no independent approval is claimed.

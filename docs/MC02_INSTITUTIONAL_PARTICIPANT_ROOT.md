# MC-02 — Institutional participant identity foundation

Base: `develop @ 8f3ea13e5c114cc301aca4fd652f8a7e5e3d6d9e` (MC-01 / PR #17).
Branch: `feature/mc-02-institutional-participant-root`.
This document describes source changes and their actual verification status below.
It does not claim a shared migration, deployed capability or trading admission.

## Identity and schema

```text
public.market_core_participants.organization_id
  → public.organizations.id (UUID)
    → public.organizations.run_id (historical run, or permanent NON_RUN/NULL)
```

A profile remains reusable human identity; a participant is one institution's
permanent business identity. No participant points to a profile, alias or CURRENT
run. The new `public.market_core_participants` table has exactly four columns:

| Column | Definition |
| --- | --- |
| `id` | `text PRIMARY KEY`, default `PAR-` plus `gen_random_uuid()::text`; full lowercase UUID format constraint |
| `organization_id` | `uuid NOT NULL UNIQUE`, FK to `organizations(id)`, `ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `status` | `text NOT NULL DEFAULT 'ACTIVE'`, closed set `ACTIVE`, `SUSPENDED`, `RETIRED` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

An AFTER INSERT/UPDATE guard validates final values after BEFORE triggers. UPDATE
cannot change ID, organization or creation provenance. Same-value writes and
explicit status changes preserve the identity. Create/get returns the stored
status, including SUSPENDED or RETIRED, without reactivation. There is no external
status-change API in this slice. The organization uniqueness is unconditional
across all lifecycle states.

A BEFORE STATEMENT DELETE/TRUNCATE trigger rejects removal, including owner and
SECURITY DEFINER DML. Runtime roles also lack those privileges. These safeguards
prevent ordinary deletion followed by identity reuse; an administrator disabling
or dropping protections with DDL remains outside the application threat model.

## Organization write-path audit

The final definitions before MC-02 were reviewed through all 19 merged migrations:

| Path | Effective behavior and compatibility |
| --- | --- |
| Organization schema / grants | `20260822120000_identity.sql` defines UUID roots and authenticated member/admin SELECT. `20260907090000_demo_reset_run_registry.sql` adds nullable run ownership. Repository PostgreSQL fixtures document Supabase service-role public-table defaults. MC-02 does not broaden or narrow organization grants. |
| `private.demo_reset_guard_organization_run` / `organizations_run_id_write_once` | `20260908055133_demo_reset_ownership_guards.sql`: AFTER UPDATE of the whole row already rejects non-NULL run changes. MC-02 replaces only that function's definition and retains its trigger. |
| `public.create_organization`, `review_role_request`, admin bootstrap | Final generic creation definitions in `20260822233000_identity_admin_capabilities.sql` insert named business columns, no run/seal assignment. New rows default to unsealed NON_RUN. No generic function is rewritten. |
| `public.set_organization_status` | Final definition in the original identity migration updates status only. It preserves run/seal, including on a sealed organization. |
| `public.demo_reset_issue_run` | `20260908070350_demo_run_issuance.sql` inserts three fresh UUID organization roots with run ownership at INSERT. It never reparents an existing root. |
| `public.demo_reset_bind_run_participants` | `20260908081019_demo_run_participant_bindings.sql` locks/verifies receipt roots, then inserts or reuses memberships and roles. It does not assign organization ownership or create Market Core participants. |
| Direct TypeScript organization writes | No production direct insert/update/upsert was found. `src/data/origination/postgres-store.ts`, `src/lib/auth/load-actor.ts` and `src/services/admin-service.ts` select explicit organization fields. The store maps those reads; it does not serialize an entire organization row back on an ordinary update. |

The only supported run assignment found is fresh GP root INSERT. The existing
unsealed NULL-to-run DML rule remains available. No supported non-NULL reparenting
or multi-participant-per-organization requirement was found. No historical
organization is sealed, assigned a run or identified by alias during migration.

## Permanent seal and concurrency protocol

The migration adds `organizations.market_identity_sealed boolean NOT NULL DEFAULT
false`. Existing business values stay unchanged; all existing markers start false.

| Before | After | Allowed |
| --- | --- | --- |
| unsealed NULL | unsealed Run A | Yes, existing one-time assignment rule |
| unsealed NULL | sealed NULL | Yes |
| unsealed Run A | sealed Run A | Yes |
| unsealed NULL | sealed Run A in one UPDATE | No |
| Run A | Run B or NULL | No, whether sealed or unsealed |
| sealed NULL | Run A | No, including after suspension/retirement |
| sealed any | unsealed any | No |
| same run/seal | name/status change | Yes |

The existing whole-row AFTER UPDATE guard examines both OLD and NEW seals. It
rejects same-statement sealing plus reparenting and BEFORE-trigger smuggling.

`private.market_core_get_or_create_participant(uuid)` performs:

1. Lock the exact organization UUID `FOR UPDATE`.
2. Set its seal in that transaction; compare the returned ID/run with the locked
   row and verify that the seal actually became true. Suppression or redirection
   of the UPDATE fails closed.
3. Return the participant for that organization, or insert one with a generated ID.
4. Verify that the returned participant still belongs to the explicit input UUID.

The insert trigger independently locks/seals its referenced organization for
privileged direct INSERT. The AFTER trigger checks the final referenced root is
sealed. A late redirect to an unsealed root fails; it does not acquire a second
root lock. The callable primitive rejects *any* organization redirection, even to
an already sealed root. This separates the table invariant from the request check.

Lock order is one organization, then its participant. Calls for different roots
do not share a global lock. Even an already sealed root receives a same-value
UPDATE inside creation; an overlapping REPEATABLE READ transaction cannot silently
reuse a stale snapshot after a competing creation commit. The function has no
exception swallowing, retry loop, ON CONFLICT adoption or intermediate commit.
Participant-ID collisions fail through the primary key.

All seal/insert effects roll back together. READ COMMITTED callers waiting behind
an assignment must observe its committed ownership; waiting assignments after a
seal must fail. REPEATABLE READ may raise SQLSTATE `40001`; the caller must not
represent that as success. The native test suite exercises both interleavings,
already-sealed and unsealed contention, separate institutions, and rollback.
These outcomes were executed during the original implementation stage and are
recorded below; they were not rerun during the later work-Mac independent review.

## Internal mutation boundary and read authorization

All new private functions are SECURITY INVOKER with an empty `search_path` and
qualified application relations. PUBLIC, anon, authenticated and service_role
EXECUTE are explicitly revoked, including the seal and trigger helpers. Creation
requires the trusted database owner or an internal definer context. No public RPC,
route, Server Action, service-role provisioning adapter or request receipt is added.
Unique-organization repeatability is not the future command-idempotency contract.
MC-05 owns that external command/receipt boundary.

The new public table has RLS enabled. All runtime table privileges are revoked,
then SELECT alone is granted to authenticated. This removes default service-role
privileges too, including TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. There is one
SELECT policy: active profile, active organization, active real membership and the
exact persisted selected organization, with no effective demo persona. There is
no blanket admin read exception; an admin needs this same membership context.

`src/services/market-core-participant-lookup.ts` is marked `server-only`. It accepts
an organization UUID, uses the established authenticated Supabase server client
and `auth.getClaims`, and performs one embedded SELECT of session, profile,
organization, membership and nullable identity. Authorization and participant
absence are evaluated in the same statement snapshot. The FK from participant to
organization is unique, so the reverse embedded relation is a single nullable
object ([PostgREST resource embedding](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html#one-to-one-relationships)).

The lookup validates the returned context and identity shape and returns internal
`FOUND` (with actual status), `ABSENT` (authorized empty relation), or `UNAVAILABLE`
(with internal UNAUTHORIZED/NOT_CONFIGURED/ERROR reason). Raw error details never
escape. There is no user-facing route with differing existence errors. A stale,
missing, suspended, inconsistent or impersonated selection fails closed; the new
lookup does not call the global actor resolver, select another membership, change
a session or fall back to a static catalog. It cannot write or call creation.
A real PostgREST transport test has not been run; the native SQL suite contains the
relational equivalent of the embedded read and separate RLS assertions.

## Legacy separation and retention

`market_core_participant_map`, external investor references, `private.market_core_current_actor`
and `participantIdForActor` are unchanged. No alias is imported and no legacy
holding, account, assessment or execution record is adopted. A legacy organization
can receive a modern identity only by explicit internal invocation. ACTIVE means
identity lifecycle only: no eligibility, funding, market, order or settlement
capacity is created. The lookup is not wired into trading, GP orchestration, login
or dry-run. Solana V1 remains incompatible with the new 40-byte trade IDs;
settlement stays disabled and V2 is outside this slice.

The manifest adds only `market-core-participant-identity`, PRESERVED whole-table.
The closed count RPC remains unchanged and does not support the table. Its real
source reports UNREADABLE and the inventory reports UNAVAILABLE, never zero.
The 14 legacy Market Core tables and existing organization disposition remain
unchanged. The planner remains INCOMPLETE and there is no reset executor.

A retained participant's restrictive FK blocks deletion/rekeying of its organization,
including a run-owned root. This is an unresolved retained-root dependency for
MC-13, not permission to cascade away identity. The SQL suite asserts the actual
FK rejection. Existing unreferenced roots retain their prior deletion behavior.

## Verification record and limits

One new CLI-generated additive migration:
`supabase/migrations/20260908133317_mc02_institutional_participant_root.sql`.
Supabase CLI 2.117.0 `migration new --help` was checked before generation. CLI
telemetry/state was confined to a task-local temporary directory; no database
command or project link was used. No merged migration was edited.

### Original implementation verification (historical)

The following results and execution notes belong to the original implementation
stage at `06d611f860b8a6a2e228fa12bbcfcb22a1c92cd7`. They are not new native or
PGlite runs on the work Mac during synchronization, independent review or correction.

- `npm run check`: lint, typecheck, and **889 tests across 63 files passed**.
- Final targeted lookup, manifest, inventory, generic identity, GP issuance service
  and participant-binding service tests: **215/215 passed across 6 files**.
- Native PostgreSQL **18.4**, complete 20-migration MC-02 chain: **28/28 passed**.
  Both READ COMMITTED and REPEATABLE READ use actual competing backend connections.
- Existing GP issuance/binding assertions against the complete MC-02 chain:
  **77/77 passed** on native PostgreSQL 18.4.
- Existing ownership semantic suite: **10/10 passed** at its historical boundary
  and **10/10 passed** in full-schema PGlite mode. The latter explicitly creates
  modern identities for the Run A/B roots before exercising the unchanged field,
  DAC, owner/service-role/definer, immutable-descendant and inventory assertions.
  NON_RUN remains unsealed in that fixture to preserve its original mixed-row
  rollback test. Native MC-02 separately proves sealed NON_RUN permanence.
- Native historical MC-00/MC-01 economic and allocation regressions: **42/42 passed**.
- Supplemental in-memory PGlite smoke: all **20 ordered migrations** loaded; schema,
  create/get, actual RETIRED status, DELETE/TRUNCATE guards, retained FK, selected-member
  RLS and runtime denial passed. This is not a competing-connection test.
- Standard **`npm run build` passed**, using configured Next.js 16.3.1 Turbopack,
  including TypeScript and production page generation. No build configuration,
  dependency, import-boundary or bundler change was made.
- `git diff --check`: passed after the final code/test changes.
- Native test files passed JavaScript syntax checks and their final ESLint check.

The ordinary sandbox denied native PostgreSQL at `shmget` and the Turbopack CSS
worker at local port binding. The operator then authorized exact, one-time command
exceptions after inspection of each script and the installed subprocess tooling.
Native runs used sanitized environments, no database URL, TCP disabled and private
Unix sockets. Server version, socket directory and empty listen addresses were
asserted. Every cluster was stopped and its own directory removed, including the
initial failing test run; logs were retained outside cluster data directories.
No broad approval rule or global security/configuration change was made.

The successful standard build used a sanitized environment, disabled Next telemetry,
distinct empty task-local npm configuration files and a task-local npm cache. No
environment files containing runtime credentials were present. Inspection of the
installed Turbopack worker implementation confirmed loopback-only `127.0.0.1` IPC.
The first exceptional build invocation stopped before Next.js because npm rejected
using the same `/dev/null` path for both user and global config; distinct empty files
resolved that invocation issue. Normal `.next` build output was retained.

An earlier diagnostic `--webpack` experiment failed at
`node:crypto → src/domain/origination/terms.ts → document-panel.tsx`. This was not
the acceptance build and was not proven to be a baseline defect. The standard
Turbopack build passed, so no Webpack fix or separate baseline checkout was needed.

The first native MC-02 run passed 27/28: a test attempted a membership/role move
into an already occupied unique pair, so uniqueness rejected it before the AFTER
identity guard under test. The fixture now targets unused foreign pairs, preserving
the intended immutability assertions; the final run passed 28/28. No production
code correction was necessary during native/build verification.

Observed concurrency outcomes:

| Competing operations | READ COMMITTED | REPEATABLE READ |
| --- | --- | --- |
| Same organization create/get, sealed or unsealed | Same identity returned; exactly one row | Waiting stale transaction raises `40001`; exactly one row |
| Different organizations | Distinct identities both commit | Distinct identities both commit |
| Run assignment commits before creation | Creation seals committed run ownership | Stale creation raises `40001`; assignment retained, no seal/participant committed |
| Seal commits before NULL-to-run assignment | Assignment rejected by guard (`P0001`) | Stale assignment raises `40001` |
| Creator rolls back while assignment waits | Assignment commits; no participant/seal remains | Same result |

Explicit transaction rollback, failed ID collision and late-trigger failure also
leave no partial identity/seal effects. Serialization failures are asserted as
failures and rolled back, never converted into successful responses.

The native suite is `supabase/tests/market-core-participants.test.mjs`. It covers
schema/default grants, pre-migration preservation, owner/definer/trigger attempts,
immutability, run seals, actual competing transactions under both isolation levels,
rollback, exact read authorization, GP Run A/B reuse, no market activation and FK
retention. The existing GP issuance, binding and ownership suites accept `MC02_FULL_SCHEMA=1`
to apply all migrations in order and rerun their original assertions. MC-00 and
MC-01 allocator suites remain explicitly pinned to their historical boundaries.

Reproduction commands from that stage (the module paths identify its optional
local tooling; check availability before using them in another environment):

```sh
GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/gp01-issuance-tools/node_modules/embedded-postgres/dist/index.js node --test supabase/tests/market-core-participants.test.mjs
MC02_FULL_SCHEMA=1 GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/gp01-issuance-tools/node_modules/embedded-postgres/dist/index.js node --test supabase/tests/demo-run-issuance.test.mjs supabase/tests/demo-run-participant-bindings.test.mjs
GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/gp01-issuance-tools/node_modules/embedded-postgres/dist/index.js node --test supabase/tests/market-core-submit-result.test.mjs supabase/tests/market-core-global-ids.test.mjs
MC02_FULL_SCHEMA=1 GP01_PGLITE_MODULE=/private/tmp/gp01-ownership-sql-tools/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/demo-reset-ownership.test.mjs
npm run check
npm run build
git diff --check
```

Native clusters use `listen_addresses=''`, private temporary Unix sockets and
synthetic Auth/Storage stand-ins. No shared database, credential, migration apply,
Auth operation, chain call, deployment or business operation is part of these tests.
Publication is a Draft PR into develop only. Exact-HEAD CI/Vercel status must be
read from the PR checks; this local verification record does not assert remote
success. There is no ready/merge or manual deployment operation. MC-03 has not begun.

### Work-Mac synchronization and independent review

For the same original HEAD, the operator reported synchronization checks:
`npm ci` with the unchanged lockfile, `npm run check` (889 tests / 63 files),
standard Turbopack `npm run build` (69 pages), and `git diff --check` passed.
Native PostgreSQL/PGlite suites were not run at that synchronization stage.

Independent review passed 101 targeted lookup/manifest/inventory/planner tests and
23 intercepted-fetch probes; two additional observations reproduced ID coercion.
It reported NO_BLOCKING_FINDINGS and two P3 findings: scalar ID validation and stale
evidence wording. Native/PGlite tooling was not found, so those suites were not rerun.
Real PostgREST transport and deployed schema were not tested.

### Corrective verification after independent review

Both ID checks now require strings without normalization. Three new mocked-response
regressions first failed: array-wrapped participant ID returned FOUND; array-wrapped
membership ID returned FOUND or ABSENT depending on participant presence. The guards
now reject them with the existing ERROR/UNAUTHORIZED classifications.

- `npm test -- src/services/market-core-participant-lookup.test.ts`: **33/33 passed**
  after correction; the red run had exactly the three new failures and 30 passes.
- `npm run check`: lint, TypeScript and **892 tests / 63 files passed**.
- Standard Turbopack `npm run build`: **passed**, including 69-page generation.
- `git diff --check`: **passed**.

Checks used mock blockchain and disabled live tests in a sanitized environment
without Supabase credentials. Two build attempts failed on worker port binding;
the same build passed with permitted local IPC after moving only the ignored
Turbopack cache aside. Build configuration and dependencies are unchanged.
`npm ci`, native PostgreSQL and PGlite suites were not rerun. Mocked responses are
not PostgREST transport evidence; deployed schema remains unverified. The planner
remains INCOMPLETE and settlement stays disabled.

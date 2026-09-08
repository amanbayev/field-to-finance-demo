# GP-01 run issuance and fresh organization roots

Base: `develop @ d172631232ac073d52322d1b96136beb7ebd1766` (PR #13).
This slice implements server-side run issuance and three business organization roots only.
It does not implement onboarding, a route, Server Action, UI, reset, or a deployed migration.

## Server and database boundaries

`issueDemoDatasetV2Run(request)` in `src/services/demo-run-issuance-service.ts` loads the actor
with `requireActor()`. Callers cannot supply the actor, run ID, environment, dataset, database,
or issuer implementation. The internal composition is a test/wiring seam, not a request handler.
Both service and privileged data adapter import `server-only`.

The service reuses `authorizeDemoResetDryRun` and `resolveDemoResetRunContext` without changing
their interpretation of runtime signals. Both real principal and effective actor need
`admin.demo_reset`; impersonation and design-preview actors are refused. Production denial
retains priority. The server derives the declared environment/dataset/database and matches the
observed Supabase endpoint before constructing any privileged client. Denied requests cause
zero issuance RPC calls or writes. The operator remains platform identity, not run-owned data.

`createPostgresDemoRunIssuer` calls exactly one `demo_reset_issue_run` RPC. SQL execution is
revoked from PUBLIC, anon and authenticated, including authenticated system administrators.
Only `service_role` is granted execution. The definer function has an empty search path and
qualified application objects; it rechecks `private.is_system_admin` before writes. SQL also
validates its context and names. The trusted server establishes runtime provenance and database
endpoint identity: the database cannot infer Vercel environment signals from RPC arguments.

No alternate runtime flags or client-facing privileged endpoint are introduced. Installing the
migration later requires separate operator authorization. The service role remains a trusted
server credential; its compromise is not prevented by a run identifier or retry key.

## Transaction and lifecycle

`20260908070350_demo_run_issuance.sql` adds three nullable columns to the existing preserved
registry: `issuance_request_id`, `issuance_request` (normalized names), and `issuance_result`
(historical receipt). A constraint keeps the receipt fields together; legacy rows remain NULL.
A partial unique index scopes request identity by operator + environment + dataset + database.
An AFTER UPDATE trigger freezes issued identity/context/receipt and prevents resurrection of a
superseded issued run. Previous migrations, the existing one-CURRENT index, and ownership guards
are unchanged. There is no new inventory category or audit table to misrepresent as scoped.

The RPC takes a transaction advisory lock on the complete operator/context lifecycle, then checks
for an existing request before any DML. A new request generates random UUIDs inside PostgreSQL
for the run and three distinct organizations. It supersedes the previous CURRENT, inserts the
new CURRENT with its receipt, and inserts organizations with `run_id` already present:

| Root | Existing organization type |
| --- | --- |
| Producer | `PRODUCER` |
| Issuer / SPV | `ISSUER` |
| Institutional investor | `INVESTMENT_FUND` |

Names are trimmed, ASCII spaces/tabs/newlines collapsed, bounded to 120 characters and checked
for controls. Slugs use a fixed role prefix and each database-generated organization UUID;
neither names nor slugs are used to find/reuse organizations. The single INSERT includes run
ownership. An error rolls back the entire RPC, including supersession. No committed partial run
or organization set is possible through this operation. Run A's organizations remain in A when
Run B becomes CURRENT; historical ownership guards continue rejecting reassignment or clearing.

Lock scope includes the context, not the request ID: competing new requests must serialize even
when no CURRENT row exists. Under READ COMMITTED, the second request sees the first commit and
supersedes it; each successful request gets fresh roots, and the last serialized run is CURRENT.
Concurrent same-key retries return one receipt. Advisory hash collisions only serialize unrelated
contexts. The existing unique index remains the final constraint. A stale REPEATABLE READ
snapshot can fail with a constraint error, but cannot commit a second CURRENT or corrupt the
winner. Transaction-scoped locks release on transaction completion, including rollback.

## Retry contract and unknown outcomes

Input is exactly `{ issuanceRequestId, organizationNames: { producer, issuer, investor } }`.
The request UUID is a command identity and grants no authority. It is never used to derive the
run UUID. Same authorized context + same request UUID + same normalized names returns the
identical stored receipt. Changing names with the same key yields `REQUEST_CONFLICT` before
writes. A genuinely new request UUID creates a new run.

Receipts contain request, run, Producer, Issuer and Investor identifiers. They are immutable
historical results, not a declaration that a run is still CURRENT or an organization currently
exists. Retrying Run A after Run B returns A's original receipt, makes no lifecycle transition,
and never claims A's rows for B. `organizations.run_id` remains ownership authority.

The adapter returns `UNCONFIRMED` for transport errors, missing configuration or malformed
responses. A response may be lost after commit: callers must retry the same request UUID and
payload, never generate a new key merely because a response was lost. There is no automatic retry
or false rollback claim in application code. Actual SQL statement failures roll back in PostgreSQL.

## Generic identity and inspection

`public.create_organization` still inserts a normal non-run organization. `review_role_request`
still uses its general admin rules, including possible organization reuse by name. Neither RPC,
its routes, nor identity services were changed. Issuance calls neither and grants no memberships,
roles or persona authority. Profiles and existing platform organizations are untouched.

The dependency goes from issuance to existing policy, never from inspection to issuance.
Dry-run remains read-only; `RUN_INSTANCE_NOT_ISSUED` is still legitimate, and a claimed run ID is
only compared with trusted current state, never used for lookup or issuance.

## Reproducible offline database proof

Optional tooling is pinned and installed outside the repository; no application dependencies
change. On macOS, run:

```sh
npm install --prefix /private/tmp/gp01-issuance-tools --no-save --package-lock=false --no-audit --no-fund embedded-postgres@18.4.0-beta.17
GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/gp01-issuance-tools/node_modules/embedded-postgres/dist/index.js node --test supabase/tests/demo-run-issuance.test.mjs
```

The test creates its own PostgreSQL 18.4 cluster under `/private/tmp`, with TCP disabled and a
unique Unix socket. It accepts no database URL. Actual identity, origination, registry and
ownership migrations are loaded before the new migration. Only Supabase-owned Auth/Storage
schema surfaces are minimal stand-ins. All principals, organizations and failures are synthetic.
The server stops at completion; synthetic files remain locally for inspection. This optional
suite is separate from `npm test` and current GitHub CI, matching the earlier ownership suite.

Coverage includes legacy rows, fresh UUIDs/roots, INSERT-time stamping, no historical claiming,
A → B, repeated and historical retries, changed-payload rejection, SQL permissions, generic admin
regressions, failure after earlier organization inserts, rollback visibility, and real concurrent
connections. Race tests observe PostgreSQL's `advisory` wait before releasing the first transaction;
they do not emulate races with application mocks. The existing PGlite ownership suite is also
retained. This proves local PostgreSQL semantics, not deployed Supabase/PostgREST integration.

Validation on this slice: 48 new unit/service tests plus 14 existing dry-run service tests
(62 targeted); 19 real PostgreSQL semantic tests; 10 existing PGlite ownership tests; and
777 tests across 61 files in both `npm test` and `npm run check`. Standalone lint and typecheck
passed. `npm run build` passed after moving aside generated Turbopack cache containing a local
sandbox worker-port failure; no source or build configuration workaround was made.

## Remaining GP-01 blockers

`READY_FOR_CONFIRMATION` is still unavailable: role requests, origination textual events, Market
Core, Registrar, application audit, Storage and Auth/session cleanup lack complete run scope.
Reset audit preservation is unresolved. An issuance receipt does not fix `app_audit_events`.
No new audit architecture is added. The inventory fingerprint/revision and confirmation-time
scope recheck required before GP-02 also remain absent. Users, memberships, participant mappings,
wallets and business execution belong to later reviewed slices.

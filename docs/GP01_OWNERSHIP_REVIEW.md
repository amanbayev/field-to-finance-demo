# GP-01 ownership correction

Run ownership is historical identity. This correction protects the mutable upstream
edges used to count immutable origination evidence. It does not implement run issuance,
organization stamping or reset execution. The planner remains `INCOMPLETE`.

## Database enforcement

`20260908055133_demo_reset_ownership_guards.sql` adds three private, invoker-rights
trigger functions with an empty `search_path` and no application execute grants.
Each runs `AFTER UPDATE FOR EACH ROW`, examining the final values even when an earlier
trigger changed a column not named in the original UPDATE. Exceptions roll back the
statement; RLS bypass and `SECURITY DEFINER` do not bypass these guards.

| Edge | Allowed | Rejected |
| --- | --- | --- |
| `organizations.run_id` | NULL stays NULL; NULL → A; A → A | A → B; A → NULL |
| `producer_fields.organization_id` | INSERT under A; A → A, including data/lifecycle updates | A → B; NULL also rejected by existing NOT NULL |
| `origination_dacs.field_id` | INSERT under field A; A → A, including draft/lifecycle updates | A → B; NULL also rejected by existing NOT NULL |

The DAC guard is necessary because an immutable `origination_dac_messages` row follows
its parent DAC's source field. Guarding only organizations and producer fields would
leave that message relabellable through `origination_dacs.field_id`.

Existing migrations are unchanged. Existing NULL organizations remain valid and are
not backfilled. Initial NULL → run assignment remains allowed as specified; it is not
proof that previously unassigned evidence was created during that run. Issuance and
stamping policy remain deferred. These DML invariants assume guards/constraints remain
enabled; changing database DDL is outside the application write-path guarantee.

## Producer field write-path audit

- `20260828010000_origination_o1.sql` defines a required organization FK. Its field
  trigger prevents hard deletion of VERIFIED fields, not organization reassignment.
  The immutable submission, verification-message and snapshot triggers protect the
  child rows themselves; they previously did not protect their mutable field parent.
- `20260828030000_origination_o12_hardening.sql` and
  `20260828040000_origination_o121_state_guards.sql` implement transactional document,
  submission, change-request, approval and rejection RPCs. They lock/check field and
  case state and write specific lifecycle/submission/snapshot columns. None updates
  `producer_fields.organization_id`, and none previously guarded direct reassignment.
- `20260828050000_origination_create_idempotency.sql` implements
  `origination_create_field`: INSERT under the supplied organization, idempotent by
  organization plus request UUID. It does not move an existing field.
- `PostgresOriginationStore.insertField` and `createFieldIdempotent` serialize the
  organization at creation. `updateField` also serializes the whole record through
  `fieldToRow`, including `organization_id`, and filters only by field id. The runtime
  store uses `createServiceRoleClient` in `src/services/origination-service.ts`.
  Direct store/service-role writes therefore could previously reassign an existing field.
- `OriginationService.createDraft` takes the organization from the effective actor.
  `updateDraft`, draft archive and reviewer lifecycle updates preserve the fetched
  organization. No transfer/re-parenting command or supported product workflow was
  found in the service, routes, domain types, migrations or documentation.
- DAC creation checks the verified snapshot belongs to its source field. DAC draft
  and transition RPCs update terms, issuer selection, confirmations and lifecycle
  columns; they do not update `field_id`. No DAC source-field transfer workflow was
  found. The new guard leaves issuer selection and those normal updates available.

## Inventory and FK proof

`R` below means `organizations.run_id → demo_reset_run_instances.id`, the nullable
FK introduced in `20260907090000_demo_reset_run_registry.sql`. Every other edge in
this table is a required, validated FK. None uses ON UPDATE CASCADE.

| Counted table | Actual count path to R | Defining migration |
| --- | --- | --- |
| `organizations` | `run_id` | run registry |
| `memberships` | `organization_id → organizations → R` | `20260822120000_identity.sql` |
| `membership_roles` | `membership_id → memberships → organizations → R` | identity |
| `demo_personas` | `organization_id → organizations → R` | identity; used for NON_RUN preservation, not declared run-created identity |
| `producer_fields` | `organization_id → organizations → R` | `20260828010000_origination_o1.sql` |
| `field_submissions` | `field_id → producer_fields → organizations → R` | O1 |
| `field_documents` | `field_id → producer_fields → organizations → R` | O1 |
| `field_upload_intents` | `field_id → producer_fields → organizations → R` | `20260828030000_origination_o12_hardening.sql` |
| `field_verification_cases` | `field_id → producer_fields → organizations → R` | O1 |
| `field_cadastre_verifications` | `field_id → producer_fields → organizations → R` | O1 |
| `field_verification_evidence` | `field_id → producer_fields → organizations → R` | O1 |
| `field_verification_messages` | `field_id → producer_fields → organizations → R` | O1 |
| `verified_field_snapshots` | `field_id → producer_fields → organizations → R` | O1 |
| `origination_dacs` | `field_id → producer_fields → organizations → R` | `20260828120000_origination_dac_foundation.sql` |
| `origination_dac_messages` | `dac_id → origination_dacs → producer_fields → organizations → R` | DAC foundation |

Immutable submissions, verification messages and snapshots already reject UPDATE/DELETE.
Their direct `field_id` cannot change; the field's organization and its non-NULL run
cannot change either. Immutable DAC messages also retain `dac_id`, and the additional
DAC field guard closes their intervening parent edge. Foreign keys prevent replacement
of a referenced parent with a different primary key.

No count SQL or scope classification was changed: all existing RUN_OWNED paths are
real. The manifest note now states the upstream guards explicitly. Counting follows
the field FK, not duplicated organization columns, the case's current submission,
JSON snapshot payloads, issuer organizations or textual event ids. This does not claim
that every mutable child is append-only, or that all duplicated relationships are
cross-validated. At this correction's baseline, membership/role links and mutable field-child
links retained their existing update rules; they are not intervening parents in these immutable
rows' count paths. The subsequent `GP01_RUN_PARTICIPANT_BINDINGS.md` slice now freezes complete
membership `(user_id, organization_id)` and assignment `(membership_id, role_id)` identity.
Profiles/session contexts remain non-run; event islands, Market Core,
Registrar, Storage and Auth remain unresolved.

## Reproducible offline verification

The regular Vitest suite includes `src/data/demo-reset/ownership-paths.test.ts`, which
binds every RUN_OWNED manifest object to its actual migration FK and count-RPC join.
The existing demo-reset tests retain the run-store, current-run, allowlist and planner
boundaries. The additional SQL suite is explicitly invoked and is not part of
`npm test` or current CI.

No local Supabase/Postgres server or Docker executable was available on the review
workstation. PostgreSQL semantic verification used PGlite **0.5.8** in memory. Install
that optional test tool outside the repository, then run:

```sh
npm install --prefix /private/tmp/gp01-ownership-sql-tools --no-save --package-lock=false --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.8
GP01_PGLITE_MODULE=/private/tmp/gp01-ownership-sql-tools/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/demo-reset-ownership.test.mjs
```

The suite loads the actual identity/hardening/admin and O1/storage-policy/O1.2/state
guard/create-idempotency/DAC/run-registry migrations unchanged, inserts synthetic
Run A, Run B and non-run fixtures, then applies the new guard migration. Only
Supabase-owned Auth/Storage schema surfaces are minimal stand-ins. No database URL,
network client, shared credentials, stored files or chain adapter is used. Fixture
INSERT/UPDATE and synthetic privileged test functions exist only in memory.

Coverage includes pre-migration NULL rows and evidence, first assignment, same-value
updates, forbidden reassignment/clearing, field creation and idempotent create RPC,
normal field/DAC updates, owner/service-role/definer enforcement, unchanged immutable
child UPDATE rejection, mixed-row statement rollback, a malicious BEFORE trigger,
15 actual PostgreSQL FK catalog checks, and RUN/NON_RUN/ENVIRONMENT count partitions.
The pre-fix run reproduced missing rejections; the completed suite passes 10 tests.

This is PostgreSQL SQL/trigger execution, not live Supabase API, RLS-session, Storage,
multi-connection concurrency or deployed-migration verification. No shared environment
received either GP-01 migration during this correction.

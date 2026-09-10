# MC-03 — Immutable Protocol Version Reference

MC-03 adds a persistent shared frozen-version reference, an explicit internal import,
and a separate exact server-only lookup. It is an independent foundation, not a
Protocol Engine, governance workflow, admission decision or trading capability.

Base: `develop = origin/develop = 1d9e16b363336756032824bcb1946fd1b57f7e53`
(ordinary merge PR #18, parents `8f3ea13e5c114cc301aca4fd652f8a7e5e3d6d9e`
and `9c942a64bec5cb4ca8b6f3fd2f39ac2811039a46`). Origin and the clean tree were
checked, then `git fetch origin` without prune confirmed the same base. Branch:
`feature/mc-03-immutable-protocol-version-reference`.

The MC-03 scope was supplied directly by the operator from sections 7 and 21 of
`GP01_MARKET_CORE_IDENTITY_DECISION.md`; that document was not assumed to exist in
Git. The merged MC-02 implementation was not reopened as a separate review.

## Exact source and complete snapshot contract

The source is `protocolVersions` in `src/data/market-core/catalog.ts` at the base
commit, interpreted against `ProtocolVersion` / `ProtocolRuleSnapshot` in
`src/domain/market-core/types.ts` and the existing copy/freeze helpers. The source
file remains byte-identical to the base (SHA-256
`6ab5b8d08b49164072f707c32c90b18b32d0cb8845e5fa496bb0b86d1d4d1ab5`).
The new migration contains a literal copy of the entire F2F-V1.1 object; a unit
regression compares it structurally with the actual frozen catalog object.

All 11 top-level fields are mandatory, with no additional keys in this contract:

| Field | Contract / established F2F value |
| --- | --- |
| `id` | Exact permanent string identity: `F2F-V1.1`, never a generated UUID or digest |
| `protocolId` | Exact protocol string identity: `F2F` |
| `displayVersion` | Nonempty string: `1.1` |
| `state` | DRAFT / ACTIVE / SUPERSEDED / RETIRED; recorded F2F value is ACTIVE |
| `frozen` | JSON boolean `true`; immutability does not require a date |
| `activatedAt` | Explicit null, or valid RFC3339 timestamp string; F2F is null |
| `frozenAt` | Explicit null, or valid RFC3339 timestamp string; F2F is null |
| `supersedesVersionId` | Explicit null or exact version ID; F2F is null |
| `supersededByVersionId` | Explicit null or exact version ID; F2F is null |
| `governanceNote` | Complete nonempty original English record, including unclaimed dates |
| `rules` | Complete nested object described below |

All seven `rules` fields are mandatory: `verificationModel`, `riskModel`,
`coverageModel`, `issuanceModel`, `redemptionModel` are nonempty strings;
`lifecycle` and `modules` are arrays of nonempty strings. Array order and values
are preserved. No rule is reduced to a description, URL or hash. Empty arrays
remain valid for the general contract; F2F retains all 10 lifecycle steps and all
6 modules. JSON object key order/whitespace are not identity; JSONB structural
content, including nulls and array order, is. No digest is needed in this slice.
IDs allow 1–128 ASCII letters/digits/dot/underscore/hyphen, starting alphanumeric;
ID spelling/case is never normalized. This format does not derive identity from
the display version or protocol name.

This source is complete as an established *demonstrator reference*, not as an
approved legal rulebook. ACTIVE does not claim regulatory approval or market
admission. Water, Music Rights and Gaming have no established version and none
is imported or invented.

## Schema, authority and immutability

The additive migration
`20260910045213_mc03_immutable_protocol_version_reference.sql` was created using
installed Supabase CLI **2.116.0**, after checking `migration new --help`.
Telemetry was disabled. No linked/shared database command was run and no merged
migration was edited. The migration itself imports **zero rows**.

`public.protocol_version_records` has:

- `id text PRIMARY KEY`, `protocol_id text NOT NULL`, `snapshot jsonb NOT NULL`;
- separately stored nullable `activated_at text` / `frozen_at text`, constrained
  to exactly match the snapshot values (text preserves the original representation);
- `provenance jsonb NOT NULL`: exact keys `kind`, `repository`, `commit`, `path`,
  `exportName`; kind is `GIT_CATALOG_REFERENCE`, commit is a full 40-character SHA;
- `recorded_at timestamptz NOT NULL`, a finite database recording instant;
- `recorded_by text NOT NULL`, the database role performing the first recording.

The source provenance pins the repository URL, base commit, source path and export
above. It is a source attribution, not an assertion of legal approval. PostgreSQL
does not access GitHub to authenticate that attribution: the shipped known-source
wrapper pins the audited content and provenance. The private lower-level primitive
expects the privileged caller to establish any future source separately. No new
sources are shipped. `recorded_by` identifies a database role, never an invented
Auth user or selected organization. A definer context records its effective
`current_user`; no public definer wrapper is added.

Snapshot validation rejects missing/extra fields, wrong JSON types, invalid dates,
unfrozen versions and inconsistent protocol/version/column values. These are
constraints, so final INSERT values after BEFORE triggers are checked. A whole-row
AFTER UPDATE trigger rejects any final change, including changes smuggled into
columns absent from the UPDATE target list. Exact no-op owner updates are harmless.
A statement-level BEFORE DELETE OR TRUNCATE trigger rejects even no-row deletion,
including owner/definer DML. Runtime roles cannot delete and reinsert an identity.
Disabling guards via administrative DDL is outside the threat model.

RLS is enabled. All table privileges inherited from defaults are explicitly revoked
from PUBLIC, anon, authenticated and service_role; only authenticated SELECT is
regranted with an unconditional shared-reference SELECT policy. No INSERT policy
or runtime write grants exist. All seven private functions (including the review
correction's text predicate) are SECURITY INVOKER,
use an empty search_path, and revoke EXECUTE from those same roles. service_role
BYPASSRLS does not restore revoked privileges. Existing defaults, functions,
organization grants and MC-02 organization seals are unchanged.

Read authority is deliberately independent of institutional participation. A
persisted shared reference is non-personal content readable by authenticated
sessions; selected organization, session_contexts and participant membership are
not prerequisites. Existing UI `market.read` / `regulator.read` checks remain
unchanged and separate. Reading a reference grants no eligibility or admission.

There is no run_id, owner organization or participant binding. The primary key is
ready for a future exact instrument FK; such an FK must use RESTRICT/NO ACTION,
not ON DELETE CASCADE. No production instrument FK or MC-04 table is added.

## Explicit import and concurrency

The actual shipped internal import is a direct privileged SQL operation:

```sql
select * from private.import_known_protocol_version('F2F-V1.1');
```

Only the migration owner / an explicitly authorized owner context can execute it.
No extra application role, credential, public RPC, HTTP endpoint, Server Action,
UI, or command/receipt framework is introduced. This invocation was executed
**only inside disposable local SQL tests**. It is never run by the migration,
seed/reset, lookup, login, application startup, build or GP CURRENT lookup.

The known-source wrapper rejects every other ID and passes its pinned full source
to `private.record_protocol_version(text,text,jsonb,jsonb)`. The private primitive
validates the whole payload and uses the primary key with INSERT ... ON CONFLICT
DO NOTHING. It compares the full resulting snapshot and protocol identity; an
existing different payload raises `protocol_version_import_conflict`. Same-ID,
same-content retries return the original record, including original provenance,
recorded_at and recorded_by. A later attempt's provenance cannot replace the first.
After INSERT, final returned identity/content/provenance/recording values must still
match the request; BEFORE-trigger redirection or suppression cannot return a false
success or leave a partial inserted record.

Competing identical imports at READ COMMITTED return the same row. Competing
conflicting imports raise an explicit conflict after the first commits. The
post-conflict SELECT is a separate statement, so it sees the committed winner.
Under REPEATABLE READ, a stale competing transaction raises `40001`, which is not
caught or treated as success. If the first creator rolls back, the waiting creator
records its own content. These are version-identity import retries, not MC-05
external command semantics.

## Exact server-only read and reset compatibility

`lookupProtocolVersionRecord(versionId)` uses the existing authenticated server
Supabase client and verified claims, then performs only a SELECT filtered by the
exact ID. It returns FOUND with a validated, independently deep-frozen record,
ABSENT only for an accessible HTTP-200 empty array, or UNAVAILABLE for unconfigured,
invalid, unauthorized, failed or malformed reads. The permissive shared SELECT
policy does not conceal rows as organization-filtered absence; roles without
SELECT get a privilege error. JSON types are checked before regex use; no coercion,
empty snapshot, fixture, current/latest, symbol resolution or write fallback exists.

The existing catalog, UI, instrument shell and trading services do not use this
lookup yet. That integration belongs to MC-06. The lookup's own dependency graph
contains no catalog fallback or import primitive.

The existing `protocol-definitions-and-frozen-versions` manifest category now names
`protocol_version_records` as PRESERVED / ENVIRONMENT_WIDE / NOT_APPLICABLE, following
the whole-table shared-reference convention. The closed count source deliberately
remains unchanged: its result is UNREADABLE, inventory is UNAVAILABLE with a null
count, and the planner remains INCOMPLETE. The other Market Core dispositions,
14 legacy business tables, participant identity and organization seal are unchanged.
No MC-13 inventory expansion or reset executor is included.

## Verification and source/deployed distinction

Initial implementation evidence, before the Review corrections below (also
separate from historical MC-02 evidence):

| Check | Actual result |
| --- | --- |
| MC-03 native PostgreSQL **18.4**, full **21 ordered migrations** | **18/18 PASS** |
| Existing MC-02 + GP issuance/binding SQL on that full chain | **105/105 PASS** |
| `npm run check` | **943 tests / 64 files, lint and TypeScript PASS** |
| Standard `npm run build` (Turbopack), clean local build cache | **PASS** |
| `git diff --check` | PASS |
| Real Supabase/PostgREST transport | **NOT_RUN** |
| Shared migration/import; deployed schema/capability; Solana | **NOT_RUN**, no mutation authorized or performed |

Native tooling is optional and installed outside the repository:
`embedded-postgres@18.4.0-beta.17`, including the matching darwin-arm64 package,
under `/private/tmp/mc03-tools`; no project dependencies were reinstalled or changed.
The package's local symlink hydration script was inspected before use. Each suite
initializes a private disposable PostgreSQL cluster, asserts TCP is disabled and
its Unix socket is private, uses synthetic Auth/Storage stand-ins and synthetic
business rows, and stops/removes only its own cluster. MC-03 explicitly uses UTF8.
Tests run with a sanitized environment, without database URLs or real credentials.
Logs stay outside the repository; MC-03 server logs are retained in
`/private/tmp/mc03-sql-logs-wfYWMx`, with suite output in
`/private/tmp/mc03-sql-native-final.log` and `/private/tmp/mc03-compat-native.log`.

The SQL suites verify defaults/grants/RLS, exact F2F content and null dates,
first provenance, conflicting fields/rules, simultaneous same-ID calls, both
isolation levels, rollback, owner/definer changes and BEFORE-trigger attacks.
The future FK check creates a synthetic table inside a rolled-back transaction.
No production table is added by that test. The malformed-snapshot regression
asserts the validator result directly and supplies matching request identities
where available, so an unrelated ID mismatch cannot conceal a validation defect. The MC-02/GP suites expose a bounded
`MC03_FULL_SCHEMA=1` mode; historical MC-00/MC-01 tests and all their assertions
are untouched.

Initial local attempts identified missing optional-tool symlinks and a sandbox
shmget denial before SQL execution; these were resolved using inspected local
hydration and exact scoped execution approval. The first native migration attempt
caught a dollar-quote generation error, which was fixed. Subsequent test failures
were harness representation issues (name[] decoding, explicit JSON parameter
encoding, temporary-to-permanent FK restriction), fixed without weakening domain
assertions. The existing inventory order assertion was extended to include the
new preserved object. GP full-chain assertions were explicitly extended to MC-03
without changing historical modes.

The initial standard build hit sandbox denial while binding Turbopack worker IPC.
An approved retry reused the cached failure. After moving only generated `.next`
output to `/private/tmp/mc03-build/failed-next`, the same standard Turbopack build
passed with a clean cache under scoped approval. No bundler/dependency change was
made. Its environment was sanitized; only `.env.example` existed, telemetry was
disabled, and the worker IPC used loopback. The successful output is retained in
`/private/tmp/mc03-build-clean.log`.

Reproduction after inspecting/locating optional tooling:

```sh
GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/mc03-tools/node_modules/embedded-postgres/dist/index.js node --test supabase/tests/protocol-version-records.test.mjs
LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 MC03_FULL_SCHEMA=1 GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/mc03-tools/node_modules/embedded-postgres/dist/index.js node --test supabase/tests/market-core-participants.test.mjs supabase/tests/demo-run-issuance.test.mjs supabase/tests/demo-run-participant-bindings.test.mjs
npm run check
npm run build
git diff --check
```

Installed application APIs checked: Supabase JS **2.112.3**, SSR **0.12.4**,
Next.js **16.3.1**, TypeScript **5.9.3**, Node **22.23.2**. Relevant local Next.js
server/client boundary documentation was read. The Supabase changelog and official
[explicit Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically),
[Data API security](https://supabase.com/docs/guides/api/securing-your-api),
[PostgreSQL 18 INSERT](https://www.postgresql.org/docs/18/sql-insert.html),
[trigger behavior](https://www.postgresql.org/docs/18/trigger-definition.html) and
[transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html)
were consulted. Native SQL and mocked HTTP shapes are not real PostgREST transport
proof; the shared Supabase was not contacted for verification or advisors.

This is source implementation plus local evidence, not deployed protocol governance.
Publication is an ordinary feature push and Draft PR into develop only. The operator
identified main as production; main remains unchanged. Automatic preview is allowed.
Vercel connector project access was unavailable (empty teams / 403); GitHub reports
the checked base's Vercel deployment as Preview with production_environment=false.
Exact new-SHA CI/Vercel status belongs in the final handoff, not a claim that MC-03
has reached the shared database.

MC-04 (concrete instrument and CLOSED market roots) is next and remains unstarted.
MC-05, MC-06, MC-13, GP-02, governance, admission, matching, Registrar, custody,
settlement and Solana are outside this change.

## Review corrections

This bounded correction addresses the independent review of PR #19 at
`2cec9b0b2060a4c696b0dda0afaa3a31210d081e`, against the same base
`1d9e16b363336756032824bcb1946fd1b57f7e53`. That review reported P2 SQL/TypeScript
text-validation disagreement (blocking) and P3 false absence after SDK HTTP-status
normalization. Its historical results were 156 targeted tests / 6 files and native
MC-03 18/18, with 152 additional snapshot/provenance cases and intercepted-fetch
probes. Those results and the initial implementation counts above are not tests of
the corrected code.

### P2: one nonempty-text contract, without changing stored text

PostgreSQL `btrim(value)` removed only ordinary spaces, whereas the production
TypeScript predicate uses `typeof value === "string" && value.trim().length > 0`.
A whitespace-only rule or provenance field could therefore occupy an immutable
identity while the parser rejected its persisted record.

`private.protocol_version_text_valid(text)` now checks the explicit 25-code-point
ECMAScript WhiteSpace + LineTerminator set, verified against Node 22.23.2:
`U+0009–000D`, `U+0020`, `U+00A0`, `U+1680`, `U+2000–200A`, `U+2028–2029`,
`U+202F`, `U+205F`, `U+3000`, `U+FEFF`. See the
[ECMAScript lexical grammar](https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-white-space).
It returns false for SQL NULL. JSON type checks and specialized ID/state/date
checks remain in place. The helper is IMMUTABLE, SECURITY INVOKER, has an empty
search_path, and explicitly revokes EXECUTE from PUBLIC, anon, authenticated and
service_role. Privilege tests enumerate and check all seven functions.

The predicate applies to displayVersion, governanceNote, all five models, each
lifecycle/modules element, repository/path/exportName and recorded_by. Neither
SQL nor TypeScript trims, replaces or defaults the stored text. Text containing
non-whitespace content retains both edges exactly; empty arrays remain valid.
The F2F SQL snapshot/provenance literals remain byte-identical. No data-repair
migration, UPDATE/DELETE or change to import identity/retry semantics was added.

Before correction, fresh native repros again saved `rules.riskModel="\t"` and
`provenance.path="\t"`, then the production parser rejected both actual SQL rows.
Both new rejection tests were red on the original migration. They now prove direct
validator rejection, failed privileged import and owner INSERT, no partial row,
and successful valid import/read under the previously rejected ID. Repository
tests share a dependency-free JSON fixture: 35 SQL/TS cases cover all 25 trim
characters, seven non-trim controls, empty/mixed strings and text with whitespace
edges. Another matrix exercises all 13 free-text field locations. A unit test
enumerates every runtime Unicode code point to verify the complete trim set.
Positive native cases pass actual `to_jsonb` rows, including timestamp strings
with microseconds, to the production TypeScript parser/freeze code transpiled by
the already-installed TypeScript compiler; the snapshot is never substituted.

### P3: reject the original HTTP failure before SDK normalization

Installed Supabase/PostgREST JS 2.112.3 changes a `404` JSON-array response into
`status:200, error:null, data:[]`. The new fetch-level test was red with
`404 + [] -> ABSENT` on the original lookup.

`createServerSupabaseClient` now accepts only an optional internal fetch decorator.
Without opt-in its options and SSR behavior are unchanged. The factory still owns
the configured URL/key and cookie callbacks. The lookup supplies a decorator per
invocation that inspects the original Response only for GET
`/rest/v1/protocol_version_records`; a non-200 response is cancelled and rejected
before the SDK processes it. It never returns a rewritten response. There is no
shared status variable, global fetch override, second request or service-role path.
This lookup alone uses `.retry(false)` because the SDK otherwise retries a thrown
transport error as a network failure, including a deterministic rejected 404.
Auth/JWKS/refresh and other table responses pass through unchanged.

26 intercepted-fetch tests run the production lookup and factory with the installed
SSR/Supabase clients, replacing only the base transport through the opt-in seam.
They cover success/absence, non-200 responses and arrays, malformed JSON/rows,
foreign/duplicate IDs, network failure/abort, single-request behavior, concurrent
lookups, cookies, Authorization headers, refresh and real synthetic ES256/JWKS
verification. Six factory tests additionally preserve default options, cookie
writes/read-only fallback and unconfigured behavior. These are SDK transport
handling tests, not a deployed PostgREST integration.

### Fresh correction evidence and retained limits

| Check | Actual new result |
| --- | --- |
| Targeted validation/lookup/transport/factory suites | **116 tests / 4 files PASS** |
| Native PostgreSQL 18.4, complete corrected 21-migration chain | **MC-03 22/22 PASS**, including SQL/TS parity |
| MC-02 + GP compatibility, complete corrected chain | **105/105 PASS** |
| `npm run check` | **1012 tests / 67 files; lint/typecheck PASS** |
| Standard Turbopack `npm run build` | **PASS** |
| `git diff --check`; pinned literals; 20 earlier migrations | **PASS / unchanged** |

Optional embedded-postgres 18.4.0-beta.17 tooling was rechecked outside the
repository. Runs used sanitized environments, synthetic data, TCP disabled and
private Unix sockets; every own cluster was stopped and removed. Compatibility's
first attempt initialized SQL_ASCII clusters and could not load the Unicode
literal. Rerunning with the UTF-8 locale shown above passed without changing the
compatibility suites or weakening assertions. MC-03 itself explicitly initializes
UTF8. Logs are retained in `/private/tmp/mc03-corrections-4sH3fh`; native MC-03
server logs are in `/private/tmp/mc03-sql-logs-icqlqf`. The standard build used
scoped permission for local worker IPC and disabled telemetry. No dependencies,
lockfile, environment files or deployment configuration were changed.

Invalid timezone offsets can still raise SQL `22009` instead of returning false;
this is a separate nonblocking, fail-closed limitation. Date validation was not
rewritten or wrapped in a broad catch. Real Supabase/PostgREST transport, shared
schema/migration/import, Auth/Storage changes, manual deployment and Devnet/Solana
remain NOT_RUN. The planner remains INCOMPLETE. MC-04/05/06/13, GP-02 and Protocol
Engine remain outside scope. Publication is two ordinary corrective commits to
the existing feature branch and an updated Draft PR only, with no merge.

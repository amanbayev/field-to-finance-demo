# GP-01 reusable participant bindings

Base: `develop = origin/develop = 2c4bfbcdb7b80b60d4d2b891b99257ebf1c0fe0c`.
The tree was clean and zero ahead/behind after `git fetch --prune`. Branch:
`feature/gp-01-run-participant-bindings`. This audit was recorded before implementation.

## Identity audit and implementation decision

A user may survive multiple runs; their participation must not. Participation derives
through a membership's organization, never through Auth or profile run ownership.

| Question | Repository evidence and answer before this change |
| --- | --- |
| 1. Can one profile belong to multiple organizations? | Yes. `memberships.user_id` is a required FK to `profiles.user_id`; it is not individually unique. |
| 2. Can one user hold Producer, Issuer and Investor participation? | Yes, in separate memberships. Permissions are resolved for the selected organization, not unioned across organizations. |
| 3. Are memberships unique per user/organization? | Yes: `unique (user_id, organization_id)` in `20260822120000_identity.sql`. |
| 4. Can roles be revoked without deleting a profile? | Yes: `revoke_membership_role` sets `revoked_at`; `remove_membership` revokes roles and sets membership `INACTIVE`. Neither deletes identity. |
| 5. Does organization deletion cascade participation? | Yes: organization → memberships → membership_roles both use `ON DELETE CASCADE`. Other references can still block organization deletion. |
| 6–9. What happens to an active organization on deletion? | `session_contexts.active_organization_id` is nullable but its FK has default `ON DELETE NO ACTION`, not SET NULL. A surviving reference blocks deletion; no automatic session repair occurs. Future GP-02 must explicitly clear/reselect affected session context before deletion. |
| 10. Do personas block deletion? | Yes: required `demo_personas.organization_id` uses default NO ACTION. Inactivation does not release the FK. Sessions also reference personas via a default NO ACTION FK. |
| 11–14. Are membership/role parent edges historical? | No existing trigger freezes `memberships.organization_id` or `membership_roles.membership_id`. Valid privileged UPDATE can move either between existing parents, including A → B. Required FKs validate existence only. |
| 15. Is reparenting required? | No supported command, service, migration workflow or product requirement was found. Generic administration creates/upserts under the same user/organization, revokes roles, and changes lifecycle status. Narrow parent-edge guards can coexist with those flows. |

Implementation may proceed. Binding requires neither Auth provisioning nor a session
change. The deletion dependencies are explicit future prerequisites, not an impossible
state created by this command. No session/persona architecture change is needed here.

### Tables, RLS, grants and definers

The identity migration and its security-hardening/admin-capabilities successors define
the audited tables. No later migration changes their identity FKs or adds parent guards.

- `profiles.user_id → auth.users.id ON DELETE CASCADE`; one profile per Auth user.
  Profiles have ACTIVE/SUSPENDED lifecycle, with no run column. Auth's existing
  `handle_new_user` trigger creates a profile during signup; binding never invokes signup.
- `organizations.run_id → demo_reset_run_instances.id` is nullable, default NO ACTION.
  PR #13 protects non-NULL run ownership. PR #14 freezes registry context and issuance
  receipts, including legacy NULL receipts, and prevents superseded-run resurrection.
- `membership_roles` permits one active `(membership_id, role_id)` via a partial unique
  index; revoked history remains. `assigned_by → profiles` uses NO ACTION and does not
  transfer ownership to the assigning operator.
- `role_requests.user_id → profiles ON DELETE CASCADE`, `reviewed_by → profiles NO ACTION`.
  Requests have organization name text, no organization FK or run scope. They remain an
  unresolved reset category. The command does not create or review role requests.
- Identity tables have RLS. Authenticated SELECT is own-or-system-admin for profiles,
  memberships, roles and requests; organizations require active membership or admin;
  personas require admin; sessions are own-principal only. Profiles permit constrained
  own UPDATE. Membership, role, persona and session tables have no direct client write
  policies. PUBLIC/anon execution is revoked from the exposed identity RPCs by hardening.
- `private.is_system_admin` checks active profile, membership, organization and an
  unrevoked SYSTEM_ADMIN role. Generic SECURITY DEFINER admin RPCs use `auth.uid()` and
  this check. `private.write_audit` records their application audit events. Existing
  bootstrap and Auth-trigger functions retain their current privilege boundaries.
- `src/app/admin/actions.ts` authorizes admin permissions and calls session-client RPCs.
  `src/services/admin-service.ts` performs RLS-bound reads, including existing profile
  IDs. An authorized operator can therefore identify reusable profiles without adding
  a new directory/selection authority. SQL will verify each selected profile exists and
  is ACTIVE. Suspended identities will not be reactivated by binding.
- Repository-wide searches of `createServiceRoleClient`, table reads/writes, migrations,
  services, routes and live-test fixtures found no runtime direct service-role writes to
  memberships or membership_roles. Origination direct service writes concern other tables.
  Admin identity changes use definers. No generic RPC needs CURRENT Golden Path state.

PR #14's recorded read-only catalog audit (`GP01_RUN_ISSUANCE.md`) observed all eight
public-table default privileges for service_role under postgres/supabase_admin creators,
and a non-superuser BYPASSRLS service_role without inherited parent roles. This slice
uses that documented deployment model and reproduces it locally; it performs **no new
remote catalog inspection** and makes no claim about newly observed deployed grants.
Direct service DML would bypass the dedicated command's atomicity and retry contract.
The implementation will remove unused service table mutation/DDL-related privileges on
these two tables, retain SELECT, and leave generic definer RPCs and all other table grants
unchanged. Parent guards will also constrain owner/definer DML; schema owners remain
trusted administrators capable of changing DDL.

### Actor and session behavior

`load-actor.ts` verifies claims with the session Supabase client, loads the profile,
all that user's memberships, unrevoked roles, visible organizations and session context.
`buildPrincipal`/`selectActiveMembership` prefer the stored organization, otherwise the
first ACTIVE membership returned (no guaranteed ordering). A stored suspended/inactive
membership or suspended organization refuses authorization. If the stored organization
has no matching membership, selection falls back; `resolveActorContext` can still carry
the stale stored ID in `activeOrganizationId` while effective organization comes from the
selected membership. Actor loading does not repair the stored session row. The preferred
membership path also currently accepts INVITED; the switching RPC requires ACTIVE. This
pre-existing discrepancy is outside this slice; binding produces ACTIVE memberships.

Permissions union roles only on the selected membership. Effective display role takes
the first role; without roles the display fallback is INVESTOR with no granted permissions.
Persona impersonation replaces effective organization/role only for an authorized admin
and an active persona/organization. Design-preview principals and impersonation are refused
by the existing Golden Path operator policy.

`account-menu.tsx` offers existing memberships when there are multiple. Its form calls
`switchOrganizationAction` → `switch_active_organization`, which verifies an ACTIVE
membership and ACTIVE organization, upserts the session context and writes an audit event.
On conflict it does not clear an existing effective persona. `assume_demo_persona` and
`exit_demo_persona` also write session context. No binding flow will call these functions,
choose the active organization, create a persona, or imply automatic switching to Run B.

The switch audit also introduces `app_audit_events.organization_id → organizations` with
NO ACTION. Future reset must resolve audit preservation as well as session/persona FKs.

## Chosen command contract

The following decisions were recorded before implementation and are implemented below.

The dedicated server capability accepts exactly `{ requestId, producerUserId, issuerUserId,
investorUserId }`: four UUIDs, with three distinct participant profiles and a separate
command identity. Distinct participants are a Golden Path rule only; generic multi-org
participation stays valid. Existing roles are fixed: PRODUCER_ADMIN, ISSUER_OPERATOR,
INVESTOR under receipt-resolved PRODUCER, ISSUER, INVESTMENT_FUND organizations respectively.

The server derives principal and approved environment/dataset/database using the existing
issuance policy. One transactional RPC will derive CURRENT under the same context advisory
lock used by issuance, read its immutable receipt, validate its identifiers and each live
organization's run/type/status, then create/activate three memberships and fixed roles.
No organization name, slug or type-only search is authority. Mismatches fail without repair.

Commands will retain immutable historical request/result receipts under the preserved run
registry. They are retry infrastructure, not a claim of current membership status or a
solution for application audit/reset isolation. A retry has no second effect, including
after later revocation. A changed payload conflicts. A key previously used in a superseded
run will be refused as RUN_CHANGED so a lost response cannot silently bind the next run.
A new Run B uses a new command key with the same reusable profiles. A genuinely new key
may add/activate participation but never replaces or revokes previous assignments.

No new receipt FK will point back to an organization, membership, role or participant
profile: historical identifiers must not obstruct future participation cleanup. GP-02
must explicitly preserve this retry metadata alongside registry history and still design
session cleanup, persona dependencies, application audit, role requests, Storage/Auth
handling, row fingerprints and confirmation-time scope checks. The planner stays INCOMPLETE.

## Implemented service and database boundary

`src/services/demo-run-participant-service.ts` exports the explicit server capability
`bindDemoDatasetV2RunParticipants(request)`. It obtains its own `requireActor()` result;
the internal composition is a wiring/test seam, not a request handler. Service and adapter
import `server-only`. There is no route, Server Action, CLI, participant selector or UI.
The existing `authorizeDemoResetDryRun` / `resolveDemoResetRunContext` checks both principal
and effective `admin.demo_reset`, refuses impersonation and design preview, prioritizes
production denial, and matches the declared database reference against the observed endpoint
before any privileged client is constructed.

`src/data/demo-reset/postgres-participant-binder.ts` makes exactly one
`demo_reset_bind_run_participants` RPC. Its SQL arguments include trusted server context
and the four validated request fields; there is no run/org/role argument. The DB cannot
infer process/Vercel provenance: the trusted server owns that boundary, as for issuance.
The SQL function validates context and rechecks `private.is_system_admin` before and after
the issuance context lock. It selects stored CURRENT with a row lock inside the transaction.
No service-layer lookup can become stale between selecting and binding organizations.

The RPC validates the exact immutable issuance JSON shape, all UUIDs, receipt request/run
identity, three distinct organization IDs and each organization's expected type, ACTIVE
status and `run_id`. Shared locks protect organization and profile lifecycle/existence until
commit. All three profiles must already exist and be ACTIVE. It upserts each membership at
the fixed user/organization pair, changing only status to ACTIVE on conflict. It inserts a
new generated role row if no active fixed role exists; otherwise it locks and returns the
existing active role without changing assignment history. Revoked role rows stay revoked;
a new command can create a new active assignment. No existing participation is moved.

The RPC returns request/run IDs and each participant's user, organization, membership,
membership-role row and fixed role identifiers. The adapter validates receipt structure,
request/user correspondence, fixed roles and distinct generated identities. Unknown errors,
missing client configuration, malformed responses and transport errors are UNCONFIRMED:
retry the **same request and payload**. No automatic retry, fresh-key retry or rollback claim
is made from a network error. Explicit SQL refusals distinguish missing CURRENT, mismatched
run roots, unavailable profiles, changed payload and a key belonging to a superseded run.

### Additive migration and privileges

CLI-created file: `supabase/migrations/20260908081019_demo_run_participant_bindings.sql`.
Earlier merged migrations are unchanged. This migration is source plus disposable local
verification only; it has not been applied to shared QA/demo/production.

- Two private invoker trigger functions, with empty search paths, freeze
  `memberships.organization_id` and `membership_roles.membership_id` in AFTER UPDATE
  checks. Same-parent updates and normal status/revocation remain allowed. AFTER checks
  inspect the final row, including any changes made by BEFORE triggers.
- Only service_role's membership/membership-role table grants change: all eight
  creation-default table privileges are removed, then SELECT is restored. Direct INSERT,
  UPDATE, DELETE, TRUNCATE and TRIGGER authority is unavailable on those tables. Generic
  session-admin definers retain their original bodies, permissions and semantics. The GP
  function is the dedicated atomic binding path; it does not monopolize generic admin
  membership/role lifecycle operations. Other tables' grants are unchanged.
- `private.demo_run_participant_commands` has `(run_id, request_id)` primary key,
  request/result JSON, creation time, a request lookup index, RLS with no policies, no
  application table grants, and an AFTER UPDATE guard freezing its complete row. Its only
  FK is `run_id → demo_reset_run_instances ON DELETE RESTRICT`. It is preserved retry
  metadata, with no reverse FK to profiles or business participation. It is not exposed
  by the public Data API and is not a completed reset audit architecture.
- One SECURITY DEFINER RPC with empty search path, qualified application relations and
  explicit EXECUTE revocation from PUBLIC/anon/authenticated; only service_role receives
  EXECUTE. Trigger helpers have no runtime EXECUTE grants. Database schema owners remain
  trusted administrators; these guarantees assume constraints/triggers remain enabled.

### Lifecycle and rollback proof

Actual PostgreSQL tests issue A, bind P/I/F, issue genuinely new B and bind the same P/I/F
with a fresh command. Each profile still exists exactly once; A's full membership/role
rows remain byte-for-byte unchanged; B has different organizations, memberships and role
rows. Owner and SECURITY DEFINER reparent attempts fail, including legacy/revoked rows and
changes injected by BEFORE triggers. Status changes and generic admin revocation/reactivation
continue to work.

Same-key retries return the identical receipt with an unchanged complete database snapshot;
changed assignment conflicts. Retrying a revoked membership returns its historical result
without reactivation. Concurrent retries wait on PostgreSQL's observed advisory lock and
commit one effect. Binding-versus-issuance races are tested in both orders: the lock determines
the CURRENT run, and a committed old command can never silently bind the new run.

A test-only trigger raises during the final Investor role insert, after earlier participation
writes and activation; the complete snapshot is unchanged afterward. Another raises during
command receipt insertion and rolls back all six participation rows. Existing unrelated rows
and issuance history remain unchanged. Failure probes and synthetic deletion/FK assertions
exist only in the disposable test cluster; no reset/deletion implementation is shipped.

### Verification and remaining work

Reproduce the SQL suite with PR #14's optional tool, installed outside the repository:

```sh
GP01_EMBEDDED_POSTGRES_MODULE=/private/tmp/gp01-issuance-tools/node_modules/embedded-postgres/dist/index.js node --test supabase/tests/demo-run-participant-bindings.test.mjs
```

The suite initializes its own PostgreSQL 18.4 cluster under `/private/tmp`, accepts no
database URL and disables TCP. It loads the real identity, origination, registry, ownership
and issuance migrations before the new migration. Supabase-owned Auth/Storage surfaces are
minimal synthetic stand-ins. It reproduces PR #14's observed public-table default grants
and uses actual authenticated/service-role/owner/definer semantics. It stops the server at
completion and leaves synthetic files for inspection. This proves local PostgreSQL behavior,
not deployed Supabase/PostgREST integration. Optional SQL/PGlite suites remain outside CI's
normal `npm test`, matching PR #14; no application dependency was added.

Validation: 72 new unit/service/identity tests, 134 targeted including issuance/dry-run;
37 new PostgreSQL semantic tests; 22 existing issuance PostgreSQL tests; 10 existing PGlite
ownership tests. The complete Vitest suite has 849 tests across 62 files.
Standalone `npm test`, lint and typecheck, `npm run check`, `npm run build`, and staged/
unstaged `git diff --check` passed. The build required local worker-port permission and
moving a generated Turbopack cache that retained an earlier sandbox-denial error to
`/private/tmp`; no source, dependencies or build configuration changed to obtain a pass.
PostgreSQL also required local shared-memory permission; it still used only a Unix socket.

The complete diff audit found no runtime Auth/profile/persona provisioning, Storage writes,
DELETE/TRUNCATE, reset execution, chain transactions, generic admin semantic changes, or
UI/route additions. Synthetic Auth fixtures, FK deletion probes and denied DELETE statements
are confined to the disposable PostgreSQL tests. No shared service was queried or mutated
for database verification. Only public Supabase documentation/changelog was fetched.

GP-01 remains incomplete. Market Core and Registrar participant mappings, textual events,
application audit preservation, role-request scope, Storage/Auth/session handling,
inventory fingerprints/revisions and confirmation-time scope checks remain outstanding.
GP-02 must explicitly clear/reselect run-referencing sessions, handle any persona dependencies
(including session → persona), resolve organization-referencing audit history, and preserve
registry/command retry history. Binding creates no session/persona references and needs no
session FK change now. Reusable Auth identities/profiles must survive participation cleanup.
No UI, reset execution, business origination, wallet, token account, mint, settlement or
manual deployment is included.

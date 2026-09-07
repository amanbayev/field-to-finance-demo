# Demo Golden Path V2

**Status:** Agreed product scope, GP-00 source audit, and implementation contract. **No Golden
Path capability is delivered by this document.** Where this document describes an object,
permission, state or provider that does not exist in the repository today, it is a *proposed
contract*, not a description of shipped behaviour.
**Baseline audited:** `develop`, `57442ad0924bb2b3a9926a91d230ad83110eef4b` (PR #10), 46 non-live
test files / 500 tests.
**Legal operator:** CommoChain Ltd.
**Reads with:** `PRODUCT.md`, `DESIGN.md`, `docs/PROTOCOL_PLATFORM_ARCHITECTURE.md`,
`docs/MARKET_CORE_ARCHITECTURE.md`, `docs/PHASE_5C_PLAN.md`, `docs/DEVELOPMENT.md`.

This document claims no regulatory permission, no admitted instrument, no client money, no custody
arrangement and no settlement finality.

**Agreed product decision (2026-09-07).** Legacy business data is disposable. V2 starts from a
clean business state. There is no legacy-data compatibility or migration obligation: old
SCAS-authored DAC records must not be migrated into the new Issuer-led authorship, and the old
workflow must not be kept alive solely to serve existing rows. Existing code, guards and tests are
reused wherever they already match the new model.

---

## 1. Outcome and boundary

A fresh Producer organisation, a **separate** Issuer/SPV organisation and a fresh institutional
Investor organisation complete one new Field to Finance issuance and one primary purchase
**entirely through the UI**. No presentation-time SQL, no source edits, no pre-created business
objects, and no reuse of historical execution proof.

Final acceptance requires **new** Solana Devnet mint and transfer evidence. First-stage signature
and payment are explicitly `DEMO_SIGNATURE` and `DEMO_PAYMENT`: they are not real money, not a
verified Kazakhstan EDS, and not production settlement finality.

Golden Path V2 is a workstream **after** Phase 5C.4, not an expansion of completed 5C.4. It
introduces primary-workflow persistence and demo execution. It does not introduce the Phase 6
client-money ledger, the Phase 7 real-money DvP path, or the Phase 8 protocol engine.

Secondary matching must never update legal ownership. The Registrar remains the book of record;
a technical chain confirmation does not register ownership by itself. The five holdings buckets
(owned / available / reserved / pledged / blocked) and actor isolation remain intact.

---

## 2. Source audit at the baseline

This is a **targeted source audit of the repository tree**, not a deployed-environment acceptance
test. Historical README and architecture statements are records, not new live RPC observations.

Status vocabulary used below: **implemented** (shipped and exercised), **partial**
(shipped for a narrower case than V2 needs), **fixture/demo-only** (TypeScript or JSON constants,
not database rows), **absent** (verified not to exist in the tree), **not verified** (not
established by this audit), **legally unresolved** (no legal conclusion available).

### 2.1 Origination and DAC authority

| Area | Evidence | Audited status | V2 gap |
| --- | --- | --- | --- |
| Producer field lifecycle | `src/domain/origination/service.ts`, `src/data/origination/postgres-store.ts`, `supabase/migrations/20260828010000_origination_o1.sql` | **Implemented** and persisted: `producer_fields`, `field_submissions`, `field_documents`, `field_verification_cases`, `field_cadastre_verifications`, `field_verification_evidence`, `field_verification_messages`, `field_origination_events`, `field_upload_intents` | Re-verify with newly registered actors rather than seeded personas. |
| Verified snapshot immutability | `verified_field_snapshots` with `field_id … unique`; trigger `verified_field_snapshots_immutable` raising `origination record is immutable` (`20260828010000_origination_o1.sql`); store exposes only `insertSnapshot` / `getSnapshotByField` | **Implemented**, enforced in the database and by store API shape | None. Reuse as-is. |
| DAC structuring authority | `createDacFromVerifiedCase`, `updateDacDraft`, `sendDacToProducer`, `submitDacToRegistrar` all call `requireVerifier` (`isScasVerifier`: organisation type `SCAS` + `scas.verify`); UI is `/scas/verification/[caseId]` and `/scas/dacs/[dacId]` under `requireScasVerifier()` | **Implemented, but SCAS-authored** | **Diverges from the agreed V2 target.** Structuring must move to the Issuer organisation, with server-side guards and regression coverage. SCAS keeps verification only. |
| Producer / Issuer confirmation | `confirmDacAsProducer` (`requireProducer` + `dac.producerOrganizationId` match), `confirmDacAsIssuer` (`requireIssuer` + `dac.issuerOrganizationId` match), executed terms hash | **Implemented** party/terms foundation | Extend, do not duplicate. Existing confirmation is **not** a verified Kazakhstan EDS. |
| Registrar intake | `startRegistrarReview`, `acceptDacIntake`, `returnDacIntake` under `requireRegistrar` (`REGISTRAR` + `issuance.manage` + `audit.read`); UI `/registrar/intake/[dacId]` | **Implemented** | Keep intake acceptance distinguishable from full legal registration. |
| What `REGISTRAR_ACCEPTED` does | `service.ts` emits `dac_accepted` with literal `createdPool: false, createdToken: false, createdIssuance: false, createdPlacement: false, chainWrite: false`; RPC `origination_accept_dac` calls `origination_dac_write_effects`, which writes only `origination_dac_events`, `field_origination_events` and optional `origination_dac_messages` | **Verified: creates nothing downstream** | Pool, instrument, issuance, placement and mint remain separate explicit steps. Do not relabel intake acceptance as registration of rights. |
| Issuer directory | `src/domain/origination/issuers.ts` contains exactly one predicate, `isActiveIssuerOrganization` (type `ISSUER` + status `ACTIVE`); `PostgresOriginationStore.listActiveIssuerOrganizations()` queries the persisted `organizations` table | **Implemented and persisted — not a fixture list.** An earlier reading of this file as a party/terms fixture was incorrect. | A new Issuer organisation registered through the UI is already selectable, provided it is `ISSUER` + `ACTIVE`. |
| Cadastre verification source | `ManualScasCadastreProvider`; the national provider stub throws | **Fixture/demo-only** (manual SCAS entry) | Acceptable for V2; must stay labelled as manual. |
| Origination business rows in seed | `supabase/seed.sql` (65 lines) contains only 13 demo `organizations` and 13 `demo_personas` | **Absent** — no fields, cases, snapshots or DACs are seeded | Good: origination already starts empty. |

### 2.2 Market Core, participants and placement

| Area | Evidence | Audited status | V2 gap |
| --- | --- | --- | --- |
| Instrument / market / order / trade / holding / eligibility types | `docs/MARKET_CORE_ARCHITECTURE.md`; `src/domain/market-core/**` | **Implemented** | Reuse. Market Core stays asset-agnostic. |
| Instrument and protocol-version catalogue | `src/data/market-core/catalog.ts` — hardcoded TypeScript constants (`protocolVersions`, `assetProtocols`, `marketInstruments`, `markets`, `holdings`, `eligibilityAssessments`, `marketParticipants`, `eligibilityMatrix`, `settlements`), no database read and no fallback | **Fixture/demo-only** | Instruments, issuances and eligibility decisions must become persisted records created through the UI. This file is the single largest V2 blocker. |
| Participant mapping | `src/domain/market-core/participants.ts` maps four hardcoded organisation slugs: `steppe-capital → INVESTOR-0001`, `grain-desk → GRAIN-DESK`, `agricultural-registrar → REGISTRAR`, `commodity-desk → COMMODITY-DESK` | **Fixture/demo-only** hardcoded map | New organisations need persistent mapping (`market_core_participant_map` exists as a table). Adding a slug to this map is **not** an acceptable V2 workaround. |
| Eligibility assessments | `src/data/market-core/catalog.ts`; `docs/PHASE_5C_PLAN.md` 5C.3 | **Fixture/demo-only**; presentation is implemented, lifecycle is absent | Persisted screening and participant × instrument decisions with reassessment and stop history. |
| F2F economic-basis adapter | `src/lib/protocols/f2f/f2f-instrument-basis-adapter.ts` returns `UNAVAILABLE` unless `input.instrument.id === WHEAT_INSTRUMENT_ID` (`"WHEAT-2027"`), the protocol is F2F, the family is `ASSET_TOKEN` and the status is `ISSUED`/`ADMITTED` | **Partial by design** — historical basis is restricted to one instrument id | A new instrument needs its own persisted basis relationships and evidence, selected by data rather than by instrument id. |
| Primary placement | `src/services/placement-service.ts` reads `src/adapters/blockchain/solana/recorded-placement.json` and `placement-manifest.json` (`PL-ISS001-0001`, `WHEAT-2027`, quantity `10`, `DEMO-KZT`), with `fallbackSupply()` chaining recorded proof → mock token → literal defaults | **Fixture/demo-only recorded proof**, not a subscription-execution service | A new-subscription primary execution service is new work. Recorded proof must never be attached to a new run. |
| Secondary market | `src/data/market-core/seed-scenario.ts`; `src/services/secondary-market-repository.ts` `engineStateFromSnapshot()` falls back to catalogue holdings and markets when database rows are empty | **Implemented engine, fixture-backed fallback** | The empty-database fallback must be switched off for V2 reads, or empty V2 views will silently show legacy holdings. |
| Registrar book of record | `registrar_registered_ownership` in `20260823200000_registrar_book_and_live_proof.sql`: RLS enabled, all privileges revoked from `public`, `anon` and `authenticated`, and `select, insert, update, delete` granted to `service_role` alone. `app.registrar_sync` is a **different** guard: `market_core_holdings_owned_guard` raises `OWNED_IS_REGISTRAR_PROJECTION` on `UPDATE OF owned` on `market_core_holdings` unless that setting is `on`, and `private.registrar_sync_holdings_owned` sets it while projecting `registered_quantity` | **Implemented** | Reuse unchanged. `app.registrar_sync` is not a universal permission or delete guard for the registrar book: deleting registrar rows needs the `service_role` credential, and because the sync trigger fires only `after insert or update of registered_quantity`, a delete would leave `market_core_holdings.owned` stale. |
| Devnet settlement, source | `settle_secondary_dvp` exists in `solana/programs/agricultural_market/src/lib.rs` and `src/instructions/settle_secondary_dvp.rs`, and the checked-in IDL `src/adapters/blockchain/solana/agricultural_market.json` lists all three instructions | **Implemented in source** | Not absent. An earlier reading of this row as "absent" repeated the 5B.1-era record in `docs/MARKET_CORE_ARCHITECTURE.md` and was wrong. |
| Devnet settlement, deployed programme | Whether the programme deployed at `9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst` exposes `settle_secondary_dvp` was **not** established: this audit read the tree and made no RPC call, and a checked-in IDL is not proof of deployed bytecode | **Not verified** | GP-14 must verify the deployed programme before relying on the instruction, and redeploy is an operator-authorized action. |
| Devnet settlement, execution proof | `README.md` records `settle_secondary_dvp` as prepared and never executed as real settlement | **Absent** | GP-09 and GP-14 need an agreed signer and inventory account before any transaction. A prepared instruction is not an execution. |

### 2.3 Identity, admin and environment

| Area | Evidence | Audited status | V2 gap |
| --- | --- | --- | --- |
| Onboarding mutation | `src/app/auth/actions.ts` `onboardingAction` → `submit_role_request`; `role_requests` table | **Implemented** | End-to-end new-organisation creation, approval, membership and mapping need verification with fresh actors. |
| Permissions | 28 permission strings in `src/domain/identity/types.ts`; role mapping in `src/domain/identity/permissions.ts`; **no permissions table exists in `supabase/migrations/`** — permissions are derived in TypeScript from roles | **Implemented in TypeScript** | Adding a permission needs no migration. Roles and permissions survive any reset because they are code, not data. |
| Admin surface | `src/app/admin/**`, `src/services/admin-service.ts` (`loadAdminOverview`, `loadAdminUsers`, `loadAdminOrganizations`, `loadRoleRequests`, `loadDemoPersonasAdmin`, `loadAuditEvents`) | **Implemented, identity administration only** | Protocol, version, instrument, run and provider overview is additional scope (GP-15). |
| Demo-persona fixture fallback | `loadDemoPersonasAdmin()` returns `catalogPersonasForSwitcher()` when Supabase is unavailable **or when the persona query returns zero rows**, guarded by `isDesignPreviewEnabled()` (`NODE_ENV === "development"`) | **Fixture fallback on an empty result** | Exactly the "old fixtures repopulate empty V2 state" hazard. Must be disabled for V2 acceptance reads. |
| Design-preview actor | `src/lib/auth/design-preview.ts` builds a synthetic `SYSTEM_ADMIN` principal with `userId === "design-preview-user"`, local `next dev` only | **Fixture/demo-only** | A design-preview persona is never evidence of real onboarding, real database authorization or real execution, and must never authorize a reset. |
| Environment handling | Three modules, no central config: `src/lib/public-env.ts` (`getPublicEnv`, default `appEnv: "demo"`), `src/lib/auth/env.ts` (`getSupabaseUrl`, `getSupabasePublishableKey`, `getSupabaseServiceRoleKey`, `isAuthConfigured`), `src/lib/origination/backend.ts` (`resolveOriginationBackend`) | **Partial** | `resolveOriginationBackend` is the correct precedent for a fail-closed environment contract and is reused as the pattern for demo-reset policy. |
| Service-role client | `src/lib/auth/supabase/admin.ts` `createServiceRoleClient()`; used only by origination store selection and two origination API routes | **Implemented, narrowly used** | Market Core and admin reads use the RLS-bound session client, so an inventory reader cannot assume service-role visibility. |
| Demo reset / dry-run | No reset module, endpoint, command, permission or table exists | **Absent** before this PR | Delivered here as contract, policy and planner only; see §9. |
| Run ownership | No `run_id`, run table or run-correlation column exists on any business table | **Absent** | Hard prerequisite for a provably scoped reset. See §9.3. |
| CI in the repository | `.github/workflows/ci.yml` is the only workflow: `pull_request` and `push` on `develop`/`main`, running `npm ci`, `npm run check`, `npm run build`, with `permissions: contents: read`. There is no deploy step, no `vercel.json` and no `supabase/config.toml` | **Implemented** | No repository workflow applies a migration, deletes data or submits a Devnet transaction. |
| Automatic preview deployment | Deployment is configured outside the tree, in the Vercel Git integration, so the absence of `vercel.json` proves nothing about it. PR #11 received a successful Vercel check, which is direct evidence that pushing a branch **does** trigger an automatic preview build and deployment | **Implemented outside the repository** | Treat every push as publishing a preview. A preview build runs `next build` against the branch: it applies no migration, deletes no data and submits no Devnet transaction, but "no manual deploy" must never be reported as "no deployment". Preview environment variables decide which Supabase project that build reads. |

### 2.4 Signing and payment

Target signing and payment workflows are **not demonstrated by any inspected path**. Provider
contracts, persistent signature evidence and payment-receipt verification are new work. Provider
choice and the legal properties of Kazakhstan EDS remain **legally unresolved**.

---

## 3. Golden Path and responsible actor

1. Administrator confirms an allowed demo environment and completes a dry-run, then a confirmed reset.
2. Producer user registers, creates an organisation and submits onboarding; an operator approves membership and role.
3. A **separate** Issuer representative creates an Issuer organisation and obtains approved authority.
4. Producer creates a field, uploads evidence and submits it to SCAS.
5. SCAS reviews, requests changes if required, and verifies; an immutable Verified Snapshot is created.
6. Producer explicitly grants the selected Issuer access to the required verified basis.
7. Issuer structures the DAC from the Snapshot; Producer and Issuer sign the exact agreement version.
8. Issuer submits the DAC to the Registrar. Registrar reviews and records registration or a reasoned return.
9. Issuer creates a pool and locks eligible registered rights; a coverage snapshot fixes methodology and capacity.
10. Issuer creates an instrument and issuance bound to an exact immutable frozen protocol version.
11. Issuer signs issuance documents; Registrar records the issuance registration.
12. An authorised market operator records a **separate** primary admission decision.
13. An authorised execution actor initiates the mint through the UI; provider evidence is verified.
14. Issuer creates and opens a fixed-price placement after all required gates pass.
15. A new Investor user and organisation complete onboarding, membership and participant mapping.
16. Compliance records screening, then participant-by-instrument eligibility.
17. Investor requests a quantity; the system creates a subscription and versioned documents.
18. Required parties sign; the system accepts the subscription and holds the quantity until a stated deadline.
19. A payment instruction identifies the subscription, amount, settlement unit, reference and deadline.
20. A **separate** operator simulates receipt through `DEMO_PAYMENT`; the receipt is independently validated and reconciled.
21. Clearing earmarks the receipt amount and checks quantity reservation, signatures, eligibility and coverage.
22. Clearing approves allocation. `ALLOCATED` means approved allocation — not delivery and not ownership.
23. An authorised execution actor initiates the transfer; the chain result is verified.
24. Registrar records ownership from the execution evidence; projections update idempotently.
25. Investor sees the registered holding in `/portfolio`, with chain and reconciliation states shown separately.

The Issuer-led workflow starts from empty business data. Do not build a parallel legacy workflow
and do not migrate SCAS-authored DAC records into Issuer authorship. Historical rows may be
deleted or archived; if retained, they stay outside V2 reads.

---

## 4. Organisation and permission contract

Permission names in this table are **conceptual**, not shipped role IDs. Map each one onto the
existing 28 permissions and the four organisation-type guards
(`requireScasVerifier`, `requireIssuerOperator`, `requireRegistrarIntake`,
`requireOwnProducerWorkspace`) before implementation.

| Actor | Scope | Allowed responsibility | Excluded automatic capability |
| --- | --- | --- | --- |
| Producer | Own organisation | Fields, evidence, rights agreement, access grant | SCAS verification |
| Issuer | Separate organisation and explicitly shared basis | Structuring, DAC, pool, issuance, placement | Self-registration of the issuance |
| SCAS | Assigned verification scope | Review and immutable verification evidence | Commercial structuring, mint, receipt confirmation |
| Onboarding / participant operator | Explicit platform permission | Approvals, memberships, persistent mapping | Instrument eligibility |
| Compliance | Authorised assessment scope | Screening, assessment, reassessment, stop decisions | Investor signatures or trading |
| Registrar | Registry scope | Rights and issuance registration, ownership entries | Trading or automatic custody |
| Market operations | Authorised venue scope | Admission, placement opening and pausing | Registrar ownership edits |
| Investor | Own organisation and participant | Subscription, signatures, instructions, own portfolio | Self-confirmed receipt |
| Clearing | Authorised obligations | Reconciliation, reserves, allocation and execution controls | Direct mutation of legal ownership |
| `SYSTEM_ADMIN` | Platform overview and configuration | Administration, and separately permitted demo reset | Participant identity, trading, another actor's portfolio |
| Regulator / auditor | Explicit read scope | Evidence and audit review | Mutations |

Every mutation checks principal, effective organisation, active membership, permission and object
scope **server-side**. Signing checks authority for that organisation and document. Impersonation
retains both principal and effective persona in audit. UI-only access enforcement is not
acceptable, consistent with the existing rule that navigation visibility is not authorization.

---

## 5. Objects and state ownership

All names below are **proposed contracts**; map them to existing enums before implementation.

| Object | Lifecycle / invariant |
| --- | --- |
| Onboarding | `DRAFT`, `SUBMITTED`, `CHANGES_REQUIRED`, `APPROVED`, `REJECTED` |
| Membership / mapping | Explicit active, suspended or revoked membership; mapping is separate from approval |
| Field / case | Existing reviewed lifecycle; the Snapshot is immutable and references exact evidence |
| Access grant | Producer, Issuer, scope, issuer authority, grant and revocation audit; no public-ID access shortcut |
| DAC | Draft, signing, intake, registration or return; existing intake acceptance stays distinguishable |
| Pool / coverage | Versioned composition, fixed calculation evidence, atomic capacity encumbrance |
| Instrument | Existing lifecycle; persistent exact `protocolVersionId`; admission is explicit |
| Issuance | Draft, signing, registration; mint status and minted quantity tracked separately |
| Placement | Draft, ready, open, paused, closed, cancelled |
| Assessment | Participant × instrument, authority, evidence, decision, effective period and history |
| Subscription | Draft, signing, submitted, accepted, rejected, cancelled, expired |
| Payment receipt | Provider event identity, amount and unit, reference, run, verification and reconciliation |
| Funds / inventory reservation | Separate `ACTIVE`, `CONSUMED`, `RELEASED` records |
| Allocation | `PENDING`, `READY`, `ALLOCATED`, `CANCELLED` |
| Execution attempt | `CREATED`, `SUBMITTED`, `CONFIRMED`, `FAILED`, `UNKNOWN` |
| Registrar entry | Pending, registered, rejected; corrections append evidence |
| Audit | Immutable event with principal, effective actor, object, outcome, correlation and run ID |

No single `ISSUED` flag may conflate registration, mint, placement and ownership. `canSubscribe`,
`canReceive` and `canTrade` are separate capabilities. Eligibility is rechecked at consequential
gates. Disabling new trades must not prevent legitimate cancellation or release workflows — this
already holds for `actorMayCancelOrder` and must be preserved.

---

## 6. Documents and signatures

| Document | Proposed parties | Gate |
| --- | --- | --- |
| DAC / rights agreement | Producer and Issuer | Intake |
| Issuance documents | Authorised Issuer and other required parties | Issuance registration |
| Subscription agreement | Investor, and Issuer if a bilateral form is required | Accepted subscription |
| Payment / settlement instruction | Investor and/or authorised settlement actor, per document purpose | Relevant execution |
| Allocation confirmation | Issuer and Clearing, plus others if legally required | Allocation completion |
| Registrar extract / decision | Registrar; EDS requirement **to be determined** | Registration evidence |

Legal necessity, signatories, legal effect and document-language precedence require separate
confirmation before any real offering. Demo templates must disclose that status.

Store the exact document bytes, version and hash, the signing request, the signature or container,
the provider, the certificate (or explicit demo metadata), the signer role, membership and
authority, the claimed signing time, the platform receipt and verification time, the verification
result, and the audit record. New document bytes invalidate readiness for the previous version's
signatures; previous signatures are kept as history. Do not fabricate trusted timestamps.

`DEMO_SIGNATURE` is never `VALID_KAZAKHSTAN_EDS`. The platform never receives or stores EDS
private keys. NCALayer, container formats and verification must be researched from primary
technical sources before any real provider is chosen. Chain-transaction signing is a separate
provider and security decision, not an EDS signature.

---

## 7. Payment, allocation and recovery

| Progress state | Required evidence / control |
| --- | --- |
| `PAYMENT_REQUIRED` | Accepted, signed subscription with terms |
| `PAYMENT_INSTRUCTED` | Issued instruction with reference, amount, unit and deadline |
| `PAYMENT_RECEIVED` | Verified provider receipt matched to the subscription; an investor button is insufficient |
| `FUNDS_RESERVED` | Atomic earmark of the verified receipt amount, with no double use |
| `ALLOCATION_READY` | Current eligibility, valid signatures, quantity hold and coverage |
| `ALLOCATED` | Approved allocation; delivery and Registrar registration remain separate |

`DEMO_PAYMENT` simulation is a distinct operator action that emits auditable provider-receipt
evidence, clearly marked as *no real money moved*. It is not `DEMO-KZT` chain DvP and must not
reuse that historic proof. There is no withdrawable or client cash balance.

Use integer amounts with explicit precision and unit; no floating-point financial sums. The first
path has no oversubscription. Quantity holds have an explicit expiry. Receipt consumption and
quantity allocation must withstand concurrent requests.

Underpayment, overpayment, late receipt, an expired or cancelled subscription, and blocked
eligibility all enter reconciliation and exception handling. There is no automatic success and no
fabricated refund. Duplicate provider events and commands are idempotent and bound to the
operation payload — extend the existing `market_core_idempotency` pattern rather than inventing a
second one.

External calls are not database transactions: persist execution intent and attempts, reconcile
`UNKNOWN` before retrying, and consume each evidence item once. A successful transfer with a
failed Registrar write stays `REGISTRATION_PENDING`; retry the registration, never the transfer.
New-run identifiers never resolve evidence from a previous run.

---

## 8. Admin overview

Extend `/admin` with protocols and every recorded version, keeping the current pointer, `ACTIVE`
state, frozen marker and real governance dates separate — `F2F-V1.1` still claims no activation or
freeze date, and none may be invented. List all instruments with their exact version binding, and
filters for issued and admitted versus structuring, concept and future.

Show each Golden Path run with object links, the blocked gate, the reason and the next actor. Show
provider mode (demo, devnet or live), observed time, availability, reconciliation exceptions and
audit. **An unavailable source is never counted as a verified zero.**

Overview permission does not grant document access or business-execution power. Reset controls
require a separate permission and an allowed environment.

---

## 9. Dataset V2 reset and seed contract

### 9.1 Environment and dataset

Reset runs only against an isolated demo database and environment, with run ownership recorded for
every business row, storage object, external attempt and audit correlation.

Production is always denied by server policy and, when the schema exists, by database permissions.
A `NEXT_PUBLIC_*` flag is never sufficient — nor is `NODE_ENV` alone. The implemented policy
(`src/lib/demo-reset/environment.ts`) requires **all** of:

- runtime signals that classify the environment against a **closed table**. `NODE_ENV`, `VERCEL`,
  `VERCEL_ENV` and `NEXT_PUBLIC_APP_ENV` must be present where the table needs them and carry
  recognised values. `VERCEL` is checked by value, not by presence: only `1`, the value Vercel
  sets, is accepted as a deployment, so `VERCEL=0` and any other string refuse. Missing signals, an
  unrecognised value, `VERCEL` without `VERCEL_ENV` or the reverse, and a Vercel runtime that is
  not `preview` all resolve to `UNKNOWN` and refuse. A local run with no `VERCEL` variable stays
  valid. There is no permissive default: the classifier never assumes `development` because it was
  told nothing;
- an explicitly declared environment name from a closed allow-list;
- a declared dataset identifier;
- a declared database identity in Supabase project-ref form;
- an observed database endpoint that is a **supported** Supabase cloud project
  (`https://<20-character project ref>.supabase.co`, with no credentials, port, path, query or
  fragment), whose project ref **matches** the declared one.

An arbitrary hostname is never read as a project identity: `https://exampleqa.unrelated.invalid`
and `http://127.0.0.1:54321` are refused as unsupported endpoints, not parsed into the refs
`exampleqa` and `127`. Local, self-hosted, proxied and custom-domain endpoints stay refused until
they have their own explicit contract, because an identity that is not a project ref cannot be
matched against a declared project ref.

An unknown environment, an unreadable or unsupported database identity, or an unestablished scope
is a **refusal**, not a default permission.

### 9.2 Preserved and cleared

Preserved: system roles and permissions (which are TypeScript, not rows), reference data, recorded
protocol definitions and frozen versions, the operator organisations and users required to run the
platform, and the reset audit itself.

Cleared: all business objects of the new scenario. Producer, Issuer and Investor for the
acceptance path register **through the UI**. No business Field, Snapshot, DAC, Pool, Instrument,
Issuance, Placement, Subscription, Payment or Allocation is seeded. Optional test personas stay
outside the acceptance run and contribute no holdings.

The machine-readable manifest is `src/lib/demo-reset/manifest.ts`. It records, per category, the
subsystem (database, auth, storage or chain), the disposition, the scope basis, and the exact
object names taken from `supabase/migrations/`.

### 9.3 Run ownership is a prerequisite, not a delivered capability

No `run_id` column, run table or run-correlation field exists on any business table at the audited
baseline. A reset therefore cannot today prove that it would delete only the current run's rows,
and several categories name the same tables under both `PRESERVED` and `CLEARED` — for example
`organizations`, `memberships`, `membership_roles` and `profiles`, which hold both operator
accounts and run-created participants.

This is recorded as a hard prerequisite. Until run ownership exists, a dry-run must resolve to
`INCOMPLETE` or `BLOCKED` and never to `READY_FOR_CONFIRMATION`. The planner
(`src/lib/demo-reset/plan.ts`) enforces this.

Missing access to an inventory source never means zero objects. A test or declared inventory is
never presented as an observed one.

An inventory record must also be interpretable before it can support readiness. The planner
refuses, rather than repairs, a count that is not a finite non-negative safe integer, an
observation kind it does not know, and a claimed count with no valid observation instant. It never
substitutes zero for a broken count or the current clock for a missing observation time, because a
substituted value would misreport the environment. A blank or whitespace run identifier
establishes no scope.

An observation time is validated by calendar component, not by `Date.parse`, which silently
normalises a non-existent date: `2026-02-30T00:00:00Z` would become 2 March and
`2026-02-29T00:00:00Z` would become 1 March. A date that does not exist is refused rather than
moved, while the supported format — ISO 8601 UTC with optional milliseconds — is unchanged.

### 9.3.1 Counts are not proof that the row set is unchanged

`demoResetPlanHash` covers the environment, dataset, dataset contract, run, and each category's
id, subsystem, scope basis, objects and row count. Equal counts therefore hash equally: a row set
whose members changed while its size stayed the same is **not** detected today. The plan hash
proves that the reviewed plan is the same plan, not that the data behind it is the same data.

Closing that gap needs a per-category inventory revision or fingerprint — for example a content
digest over run-scoped primary keys — recorded in the plan and re-derived at confirmation time,
together with a scope re-check against the same run. Both are prerequisites for GP-02 and are
deliberately not built here: a fingerprint requires the run-ownership schema and a real inventory
reader, neither of which exists in this PR.

### 9.4 Future execution architecture (not implemented)

Any future executing path must provide:

- confirmation binding a specific environment, dataset or run, and plan hash;
- confirmation expiry, and a fresh dry-run whenever the plan changes;
- a per-category inventory revision or fingerprint plus a scope re-check at confirmation time, so
  that a changed row set with an unchanged count cannot pass as the reviewed plan (§9.3.1);
- a block on competing business operations during reset;
- unresolved external attempts treated as an obstacle to reset;
- repeatability after partial failure;
- separate handling of database, Auth and Storage;
- reset audit stored outside the deleted scope;
- policy rechecked at execution time, failing closed.

Transactional database work plus resumable Auth and Storage cleanup must reach verified
postconditions before an environment is `READY`. A partial reset stays visibly unavailable. Revoke
run-owned sessions and memberships as appropriate, but never delete a shared external user solely
because they participated in a run.

### 9.5 Legacy fixture fallback must not refill V2

Legacy business rows may be deleted in the authorised demo environment; archiving is optional and
not a prerequisite. SQL reset alone cannot remove a TypeScript fixture fallback, so each fallback
point needs an explicit disable stage. The audited points are registered in
`src/lib/demo-reset/legacy-fixture-fallback.ts`:

| Fallback point | Behaviour | Disable stage |
| --- | --- | --- |
| `src/data/market-core/catalog.ts` (`marketInstruments`, `markets`, `holdings`, `eligibilityAssessments`, `marketParticipants`, `eligibilityMatrix`, `settlements`) | Hardcoded catalogue with no database read | GP-03, GP-08, GP-10 |
| `src/services/secondary-market-repository.ts` (`engineStateFromSnapshot`) | Substitutes catalogue holdings and markets when database rows are empty | GP-08 |
| `src/domain/market-core/participants.ts` (`participantIdForOrganizationSlug`) | Hardcoded organisation-slug map | GP-03 |
| `src/adapters/blockchain/solana/recorded-placement.ts` (`recordedPlacementProof`, `placementManifest`) | Recorded JSON proof for `PL-ISS001-0001` | GP-09, GP-11 |
| `src/services/placement-service.ts` (`fallbackSupply`) | Recorded proof, then mock token, then literal defaults | GP-09 |
| `src/services/admin-service.ts` (`loadDemoPersonasAdmin`) | Catalogue personas when Supabase is unavailable **or returns zero rows** | GP-03 |
| `src/lib/auth/design-preview.ts` (`getDesignPreviewActor`) | Synthetic `SYSTEM_ADMIN` principal in local development | GP-15 acceptance rule |
| `src/data/market-core/seed-scenario.ts` (`seedFirstWheatSecondaryScenario`) | Seeded secondary executions and `DEMO-KZT` balances | GP-08 |
| `src/domain/origination/memory-store.ts` | File-backed store used when no service-role key is present locally | GP-01, documentation only |

This PR registers those points. It does not disable any of them, so current runtime behaviour is
unchanged.

### 9.6 Devnet history

Solana history cannot be reset. A new run receives new identifiers and a new mint. Old evidence is
retained and never attached to new objects. Old signatures are never reused as proof of new
execution.

---

## 10. Delivery slices and dependencies

| PR | Reviewable result |
| --- | --- |
| **GP-00** | This contract, the source audit and aligned sequencing. Docs only. |
| **GP-01** | Run-isolation design and schema; reset dry-run policy, manifest and planner. **No deletion path.** |
| GP-02 | Confirmed reset execution, resumable cleanup, negative environment tests |
| GP-03 | Dynamic organisations, memberships and mapping; minimal admin run progress |
| GP-04 | New-actor Field → SCAS → Snapshot regression pass and necessary fixes |
| GP-05 | Versioned documents and `DEMO_SIGNATURE` |
| GP-06 | Explicit basis sharing, fresh Issuer-led DAC, intake and registration; no legacy workflow |
| GP-07 | Persistent pool, coverage and capacity controls |
| GP-08 | Dynamic instrument and issuance records, basis-adapter relationships, documents and registration |
| GP-09 | UI-initiated Devnet mint with a controlled signer and evidence reconciliation |
| GP-10 | Persistent screening and instrument decisions with stop and reassessment history |
| GP-11 | Placement, signed subscription and expiring quantity hold |
| GP-12 | `DEMO_PAYMENT` receipt generation, verification and reconciliation |
| GP-13 | Atomic earmarking and approved allocation |
| GP-14A | UI transfer execution, `UNKNOWN` recovery and duplicate protection |
| GP-14B | Registrar registration, projection reconciliation and portfolio |
| GP-15 | Complete admin overview and repeated full UI acceptance |

**This PR delivers GP-00 in full, plus the contract, policy and planner part of GP-01.** GP-01 is
not complete: the run-isolation schema and a scoped inventory reader remain outstanding.

GP-09 depends on an agreed technical signer, an inventory account, and an approved isolated QA
environment. GP-14 depends on investor delivery-address ownership and signer configuration.

Migrations may be prepared locally. Applying migrations, pushing, deploying, executing shared
Devnet transactions and merging all retain the `AGENTS.md` operator-authorization boundaries. No
implementation-completion claim is implied by this list.

---

## 11. Acceptance, design and rename

Run the full UI path **twice** from reset, with distinct new identities and business identifiers.
Verify: no manual SQL or source edits; immutable signed documents; an independently verified demo
receipt; fresh Devnet mint and transfer; a Registrar holding; and a correctly scoped portfolio.

Test cross-organisation access, double receipt and double allocation, concurrent quantity holds,
revoked eligibility, lost external responses, and Registrar retry without a repeated transfer.

The current 500-test baseline assertions are kept; `npm run check` is required per PR. A browser
acceptance must not reuse design-preview personas as evidence of real onboarding, real database
authorization or externally confirmed execution.

Sequence after acceptance: Golden Path V2 acceptance → repository and platform rename in a separate
operator-approved operation → Phase 5C.5 design and UX → Exchange Core → Phase 6 money and
pre-trade risk → Phase 7 real DvP → Phase 8 protocol engine. **The rename is not performed now.**

---

## 12. Open decisions and retained debt

Agreed engineering defaults: distinct Producer and Issuer organisations; fixed price with no
oversubscription; new Devnet executions; demo signatures and payment; Registrar authority; a
separate admission decision.

Not legal conclusions, and still **legally unresolved**: which rights transfer under the DAC, the
payment beneficiary, required signatories, production custody, offering documents and regulatory
permissions.

Before GP-09, choose the signer and the ownership of the inventory technical account; do not
appoint the Registrar as custodian by implication. Before any real EDS work, choose a provider
with verified capability. Before any remote reset or QA execution, identify the isolated approved
environment.

### Retained backlog

| # | Item | Closing stage |
| --- | --- | --- |
| 1 | A rejected working overlay can keep canonical values while `holdingsProvenance` still reports `CANONICAL_WITH_WORKING_OVERLAY` (`src/lib/market-core/investor-workspace.ts`). Correct before final provenance acceptance. | GP-14B |
| 2 | Unavailable-activity wording in `docs/PHASE_5C_PLAN.md` named `MARKET_CORE_UNAVAILABLE` as the cause, while `getInvestorWorkspace` (`src/services/investor-workspace.ts`) also passes `activity: { kind: "UNAVAILABLE" }` for an effective actor with no mapped participant identity, and `fetchPersistentEngineState` can throw other messages (`src/services/secondary-market-repository.ts`). | **Fixed in this PR (GP-00)** |
| 3 | Guarded `generateMetadata` for a 403 route: explicit access regression coverage. | GP-03 |
| 4 | Direct null test for `protocolModuleTrailAccess(null)`. | GP-03 |
| 5 | Legacy F2F `portfolio-service` still backs the investor dashboard widget (`src/components/dashboard/role-dashboard.tsx`); unify the source before new-investor acceptance. | GP-14B |

Items 1, 3, 4 and 5 are recorded with a closing stage and are deliberately **not** addressed here.

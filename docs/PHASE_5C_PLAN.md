# Phase 5C — Platform Coherence / Multi-Protocol Product Foundation

**Status:** Delivery plan. 5C.1 is implemented; 5C.2–5C.5 are planned and not implemented.
**Legal operator:** CommoChain Ltd.
**Reads with:** `docs/PROTOCOL_PLATFORM_ARCHITECTURE.md` (target canon),
`docs/MARKET_CORE_ARCHITECTURE.md` (implementation status), `docs/DEVELOPMENT.md` (workflow).

This document does not claim any regulatory permission, admission, or settlement finality.

---

## 1. Objective

Phase 5B proved a generic Market Core with a working secondary LIMIT matching engine. It did not
make the platform coherent as a **multi-protocol product**: protocol rules were mutable and
unversioned, the Protocols → Instruments information architecture was incomplete, organisation
onboarding and eligibility were not joined up, and there was no institutional investor workspace.

Phase 5C closes that gap **without** adding money, settlement, or a protocol rules engine. Its
objective is:

> Make Commodity Chain legible and coherent as a multi-protocol platform — immutable protocol
> versioning, a clear Protocols → Instruments information architecture, role-adaptive navigation,
> coherent onboarding and eligibility, and an institutional investor workspace — while Market Core
> stays asset-agnostic and no new financial capability is claimed.

Invariants that constrain every slice:

- Commodity Chain is a multi-protocol platform. Field to Finance is one protocol, not the platform.
- Protocol != Asset/Rights Object != Issuer != Instrument != Issuance.
- Protocol Owner != Issuer by default.
- Issued instruments bind to an exact immutable Protocol Version.
- Market Core stays asset-agnostic; asset-specific verification lives in protocol modules/adapters.
- Registrar / registered ownership remains the legal book of record.
- Matching must not mutate legal ownership.
- MATCHED / FILLED / CLEARING_READY / AWAITING_DEVNET_SETTLEMENT != SETTLED.
- FUTURE / STRUCTURING / CONCEPT functionality is never represented as implemented.

---

## 2. Delivery slices

### 5C.1 — Immutable Protocol Version Foundation *(implemented)*

Introduces a first-class `ProtocolVersion` entity that owns the versioned rule snapshot, and binds
issued instruments to an exact version permanently.

- `ProtocolVersion` carries `id`, `protocolId`, `displayVersion`, `state`, `frozen`, `activatedAt`,
  `frozenAt`, supersession pointers, a governance note, and a `ProtocolRuleSnapshot`
  (verification / risk / coverage / issuance / redemption models, lifecycle, modules).
- **`F2F-V1.1` claims no activation or freeze date.** It is the *first recorded* version of the
  Field to Finance **demonstrator** protocol. No formal legal or governance activation has taken
  place, so `activatedAt` and `frozenAt` are both `null` rather than filled with a plausible date.
  Immutability is asserted by the technical `frozen` marker alone, and `isFrozenProtocolVersion`
  deliberately does not require a date. Dates must be recorded only if and when a real governance
  event establishes them; they must never be backfilled to make a record look complete.
- `AssetProtocol` no longer carries a mutable copy of those rules. It keeps identity, status,
  owner, operator, regulatory status, and a `currentVersionId` **discovery pointer**.
- `MarketInstrument.protocolVersionId` is the permanent binding. WHEAT-2027 → `F2F-V1.1` (display
  version `1.1`). The engineering phase label `"5B"` is gone from the protocol registry.
- Resolution is instrument → `protocolVersionId` → version registry. `resolveGoverningProtocolVersion`
  has no fallback to `currentVersionId`, so a later protocol version cannot rewrite the rules of an
  already-issued instrument.
- Water, Music Rights and Gaming Assets have **no** protocol version, and the future Field to
  Finance Protocol Investment has **no** binding. None are invented.

**Acceptance criteria**

1. An `ISSUED` instrument without a `protocolVersionId` is a validation violation.
2. A bound version must exist, be frozen, and belong to the instrument's own protocol.
3. Mutating a protocol's `currentVersionId` does not change what an issued instrument resolves to.
4. The shipped catalog produces zero binding violations.
5. A frozen version with no activation or freeze date is valid; no date is invented to satisfy
   validation, and the UI shows such a date as not claimed rather than as a value.
6. `/protocols/F2F` and `/instruments/WHEAT-2027` display the exact bound version record.
7. New UI copy exists in `messages/en.json`, `messages/ru.json` and `messages/kk.json` at parity.
8. `npm run check` and `npm run build` pass with no assertion weakened.

### 5C.2 — Protocols → Instruments information architecture and role-adaptive navigation

Make the platform hierarchy navigable: Platform → Protocol → Protocol Version → Instrument →
Issuance → Market. Role-adaptive navigation so a producer, investor, registrar, regulator and
compliance officer each see a coherent path, with agriculture modules staying on the F2F protocol
page rather than in global navigation.

5C.2 is delivered in two slices. **5C.2 as a whole is not complete until 5C.2B ships.**

#### 5C.2A — Hierarchy spine, protocol catalogue, version route and shared context *(implemented)*

- Canonical `/protocols` catalogue listing every recorded protocol version with its real
  lifecycle state and frozen marker, separately from the current usable version (the ACTIVE and
  frozen pointer). "No recorded protocol version" appears only when a protocol genuinely has no
  recorded version — Water, Music Rights and Gaming Assets. `/markets` is retained and links to
  the catalogue.
- Generic `/protocols/[protocolId]/versions/[versionId]` route. It resolves both route parameters
  and returns `notFound()` for an unknown protocol, an unknown version, or a protocol/version
  mismatch. It contains no protocol-id or asset-name branch.
- Presentation-layer hierarchy model in `src/lib/market-core/hierarchy.ts` covering PLATFORM,
  PROTOCOL, PROTOCOL_VERSION, INSTRUMENT, ISSUANCE and MARKET. It holds message keys, not
  localized text, and adds no second source of domain truth.
- Shared `MarketCoreContextHeader` rendering the level and a localized breadcrumb trail rooted at
  **Commodity Chain** (not Markets), with each collection screen showing its own collection level.
  Adopted on the nine hierarchy-spine screens: `/protocols`,
  `/protocols/[protocolId]`, the version route, `/markets`, `/instruments`,
  `/instruments/[instrumentId]`, `/issuances`, `/issuances/[issuanceId]` and `/secondary`.
- Instrument catalogue grouped by protocol, then instrument family, then lifecycle status, by a
  shared production helper (`groupInstrumentCatalogue`) that the page and its tests both use.
  Empty protocols and empty families are omitted rather than padded. The exact bound protocol
  version is shown where one exists.
- Version links derived from `instrument.protocolVersionId`, so moving a protocol's mutable
  `currentVersionId` never changes an issued instrument's version route.
- The complete `ProtocolRuleSnapshot` is rendered, including lifecycle and modules, with the
  frozen marker shown explicitly in both the frozen and not-frozen states.
- Protocol-version resolution lives in a pure, injectable resolver
  (`resolveProtocolVersionContext`) that the service wraps with canonical registries and the tests
  exercise directly against a synthetic non-agriculture registry.
- The eight `errors` keys rendered by `error.tsx` and `not-found.tsx` translated into Russian and
  Kazakh, because the new version route uses `notFound()`.
- All namespaces have EN/RU/KK key-set parity. The changed `marketCore` and `errors` namespaces
  also have identical key ordering; unrelated legacy namespaces were deliberately not reordered.

**Not claimed by 5C.2A.** Agriculture routes remain globally reachable. Screens outside the
hierarchy spine do not yet declare a level. Acceptance criteria 1 and 3 are therefore only
partially met until 5C.2B.

#### 5C.2B — Unified route/navigation authorization and F2F module containment *(not started)*

- A shared route/navigation registry carrying href, hierarchy level, permission predicate **and
  organisation-type predicate**, consumed both by navigation and by route guards. Today
  `src/lib/auth/nav.ts` and each page's `requirePermission` call are two independent declarations
  that happen to agree; organisation-type guards such as `requireScasVerifier` are not
  expressible in the navigation vocabulary at all.
- Role-adaptive paths for Producer, Investor, Registrar, Compliance, Regulator and Admin.
- Agriculture modules reachable only through the Field to Finance protocol context, with
  redirects rather than deletions.
- A navigation × route-access regression matrix.

**Acceptance criteria (whole of 5C.2)**

1. Every market-core screen states which level of the hierarchy it belongs to.
2. Navigation is derived from permissions; no role sees a link it cannot open.
3. Agriculture-specific modules are reachable only through the F2F protocol context.
4. No asset-name conditionals are introduced into generic Market Core services.

Neither slice adds money, settlement, custody, a protocol engine, or any invented protocol
version, instrument, issuance, market or governance date.

### 5C.3 — Organisation onboarding, memberships, roles, and eligibility coherence

Join up organisation onboarding, membership and role assignment with the participant × instrument
eligibility matrix, so that eligibility state is explainable rather than a bare flag.

**Acceptance criteria**

1. Eligibility remains participant × instrument; no global `ELIGIBLE` flag is introduced.
2. Each eligibility state is attributable to an organisation, membership and assessment.
3. `NOT_ASSESSED` and `POLICY_PENDING` are never presented as approval.
4. Registrar, regulator and unimpersonated admin still cannot trade.

### 5C.4 — Institutional investor workspace and universal instrument shell

An institutional investor workspace over the existing Market Core, and one universal instrument
shell that works for any protocol, with protocol-specific economic basis supplied by an adapter.

**Acceptance criteria**

1. The instrument shell renders for a non-agriculture instrument without agriculture code paths.
2. The workspace reads Market Core only; it introduces no second source of instrument truth.
3. Holdings continue to show owned / available / reserved / pledged / blocked distinctly.
4. No offer, price, yield or term is shown for structuring or concept instruments.

### 5C.5 — Help & Support, multilingual polish, accessibility, and regression hardening

Minimal Help & Support, kk/ru/en polish, accessibility passes on the market-core screens, and
regression hardening — including an automated message-catalog parity test, which currently does
not exist (missing keys silently fall back to English).

**Acceptance criteria**

1. A test fails when `en`, `ru` and `kk` catalogs diverge in key set.
2. Market-core screens pass keyboard and screen-reader review.
3. Help content describes only implemented behaviour.
4. `npm run check` and `npm run build` pass.

---

## 3. Boundaries against later phases

Phase 5C is a **coherence** phase. It adds no financial capability. The following belong to later
phases and must not be implemented, simulated, or described as working inside Phase 5C.

### Not Phase 5C — Phase 6, Money & Settlement

Bank-confirmed funding, cash subledger, client-money accounts, reserves and holds, deposits and
withdrawals, reconciliation, stablecoin or bank rails, custody arrangements, wallets and ATAs.

Phase 5C must not introduce a money ledger, a balance a user could withdraw, or any client-money
control. `DEMO-KZT` remains a fixture with no monetary value, and `settle()` remains unavailable.

### Not Phase 5C — Phase 7, Real DvP

Executing and proving the real delivery-versus-payment path: `settle_secondary_dvp`, programme
redeploy, atomic instrument-leg and cash-leg movement, registry finalisation from a secondary
trade, and settlement finality.

Phase 5C must not move legal ownership, write `registrar_registered_ownership` from matching, or
present MATCHED / CLEARING_READY / AWAITING_DEVNET_SETTLEMENT as SETTLED.

### Not Phase 5C — Phase 8, Protocol Engine

A configurable protocol lifecycle and governance engine: rule evaluation, a protocol DSL or
no-code authoring, automated version promotion and supersession workflows, and generic protocol
fee computation.

5C.1 deliberately ships protocol versions as **data with validation helpers**, not an engine. A
second F2F version, supersession workflow, or rule evaluator is Phase 8 work. `supersedesVersionId`
and `supersededByVersionId` exist as structure only; no supersession has occurred.

### Also out of scope for Phase 5C

Supabase migrations and remote database mutation, Solana Devnet transactions, Binance or any
custody/gateway integration, a retail application or broker/API distribution channel, and any
claim of AFSA permission or instrument admission.

---

## 4. Validation

Every 5C slice must pass, before handoff:

```bash
npm run check
npm run build
git diff --check
```

Domain, authorization, matching, settlement and origination behaviour changes require regression
tests. Assertions must not be weakened to make a failing test pass.

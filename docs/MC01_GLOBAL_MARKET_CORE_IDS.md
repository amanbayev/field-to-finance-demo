# MC-01 — Global Market Core ID allocation safety

Base: `develop @ 0b343c7b2589726e0373c2c8e852ff3081647f09` (merged MC-00).
Scope: new PostgreSQL business IDs only. No historical row rewrite, new schema
identity root, service market selector, run attribution, or settlement execution.

## Problem and baseline

The old writers allocated global table primary keys from **market-local** counters.
Two markets could each have valid local counters and nevertheless both allocate
`ORD-0101`, for example. This affected ORD, RES, TRD, SET and EVT.

Before any allocator change, the unchanged MC-00 PostgreSQL suite passed **17/17**
on disposable PostgreSQL **18.4**, with TCP disabled and a private Unix socket.
It covers authenticated submit, exact replay, matching, trade/settlement creation,
SELL/BUY cancellation, partial fills, disabled settlement preparation and rollback.
MC-00's qualifications are the canonical baseline; its SQL ambiguities were not
reintroduced or repaired again by MC-01.

Five pre-patch probes then produced actual SQLSTATE **23505** failures:

| Family | Duplicate key | Constraint |
|---|---|---|
| ORD | `ORD-0101` | `market_core_orders_pkey` |
| RES | `RES-0101` | `market_core_reservations_pkey` |
| TRD | `TRD-0101` | `market_core_trades_pkey` |
| SET | `SET-0101` | `market_core_settlements_pkey` |
| EVT | `EVT-000101` | `market_core_events_pkey` |

The ORD probe starts two synthetic markets with identical counters. To reach each
later allocator independently, the other probes offset the preceding allocation
counters while keeping the target family's counters equal. They use the actual
MC-00 functions, not replacement allocators. Every probe rolls its transaction
back and compares all Market Core and Registrar rows with its pre-probe snapshot.
Synthetic markets and inventory are test fixtures, not admitted/live instruments
or chain evidence. Service-level market selection is unchanged.

## Effective writers and migration

One new additive migration:

`supabase/migrations/20260908123925_mc01_global_market_core_ids.sql`

| Final effective writer before MC-01 | Source of that definition | New allocations |
|---|---|---|
| `private.market_core_emit` | `20260823120000_market_core_rpc.sql` | EVT |
| `public.market_core_submit_limit_order` | `20260908105740_mc00_market_core_submit_result_ambiguity.sql` | ORD, RES |
| `private.market_core_apply_fill` | `20260908105740_mc00_market_core_submit_result_ambiguity.sql` | TRD, SET |

The migration replaces only these three functions. Their bodies differ only in
five allocation expressions, each using the fixed family prefix and
`gen_random_uuid()::text`. No arbitrary allocator API or new helper is introduced.
PostgreSQL's generator produces version-4 random UUIDs; see the
[PostgreSQL 18 UUID documentation](https://www.postgresql.org/docs/18/functions-uuid.html).
The actual database tests also verify the UUID version and variant through the
full-format assertions.

The effective-function catalog audit finds exactly this closed writer set. Older
`market_core_test_try_isolated_*` allocation helpers are dropped by the later
`20260823220000_phase_5b2a_secondary_dvp_prep.sql`; they are absent from the final
catalog. Static seeds are historical fixtures. The TypeScript in-memory engine
does not persist runtime business rows; application writes use PostgreSQL RPCs.

No merged migration is edited. MC-00's `i.result` lookup and qualified
`c.trade_n` / `c.settlement_n` counter statements remain intact. Cancel,
settlement preparation, matching selection, authorization and Registrar functions
are not replaced by this migration.

## IDs, ordering and history

New rows use full `PREFIX-<UUID>` strings, **40 ASCII bytes** for each family:

```text
^ORD-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

Equivalent assertions cover RES, TRD, SET and EVT. Examples observed in the
disposable MC-01 run, not production or chain records:

| Family | Example |
|---|---|
| ORD | `ORD-3e16ff61-502f-40f6-a701-c7a926de1254` |
| RES | `RES-5ec30278-4cd0-4797-a6a1-b8604224b5cf` |
| TRD | `TRD-4ab23843-9627-43e1-bc3f-6633c2ba8b7e` |
| SET | `SET-9d003be1-c75e-43b5-98b8-261caa2b9d6b` |
| EVT | `EVT-2a92234f-e3d3-40d4-ab29-0cd50832828a` |

UUIDv4 has 122 random bits. Collision is not mathematically impossible. Existing
primary keys remain the final uniqueness guard: a collision fails the transaction,
without adopting, overwriting or upserting an existing business record. There is
no new allocation retry policy.

`market_core_counters` and **every existing counter increment remain unchanged**.
`market_core_orders.sequence` remains market-local price-time order. Two markets
may both allocate sequence 1; UUID text is never used to rank execution.

The migration itself runs no business-row UPDATE, DELETE, INSERT, reset or
backfill. Before/after snapshots compare all 14 Market Core tables and
`registrar_registered_ownership`, including IDs, relationships, counters and
stored idempotency JSON. They are identical immediately across the migration.
Existing text column types and lengths are unchanged. Legacy numeric and seed
IDs coexist with UUID IDs, and legacy stored receipts are returned verbatim.

## Multi-market and concurrency proof

The post-patch suite creates two fresh synthetic markets, M1 and M2, with every
counter initially zero. Two separate authenticated PostgreSQL backends submit
SELL orders concurrently, then separate backends submit crossing BUY orders.
Both markets allocate local order sequence 1 for the first order and 2 for the
second. All ORD/RES/TRD/SET/EVT records have globally distinct full UUID IDs.

Each market ends with `order_seq=2`, `order_n=2`, `reservation_n=2`, `trade_n=1`,
`settlement_n=1`, `event_n=4`. Matching executes at the resting price, persists
exact trade→order and settlement→trade references, and stores full IDs in match
receipts and event metadata. Legal Registrar rows are unchanged.

Concurrency is observed, not inferred from `Promise.all` or UUID probability:
the test coordinator temporarily holds the relevant advisory locks, starts
commands on distinct backend PIDs, and verifies **both are waiting on advisory
locks** through `pg_stat_activity` before releasing them.

Additional concurrent cases prove:

- Two BUY orders compete against one three-unit resting SELL. Exactly three
  units fill; one BUY unit remains open. Local sequences are 1/2/3; no overfill,
  duplicate reservation or settlement occurs. Reserved/available cash deltas
  are exactly 410 synthetic DEMO units: 300 filled plus 110 still reserved.
- Two commands with the same submit key return the same committed UUID response
  and create only one order, reservation, event and idempotency receipt.

Sequential regression scenarios preserve LIMIT matching, no self-match, price
priority then local sequence, resting-price execution, partial-fill quantities,
pending buckets, SELL/BUY cancellation, cancellation replay and held filled
reservations. An injected late settlement-insert exception rolls back all prior
order/reservation/trade/event/counter/receipt effects; retry succeeds atomically.

## Public consumer audit

Repository searches cover all five prefixes and ID field names, numeric parsing,
length/regex constraints, substring operations, sorting, routes/form values,
SQL column definitions, effective functions, source callers and fixtures.

| Consumer area | Classification and result |
|---|---|
| PostgreSQL PKs, references, RPC text parameters, event entity references | Compatible: unbounded `text`; no numeric-ID validator or short-ID column. Idempotency results use JSONB. The database suite checks column types and actual cross-record references. |
| `src/services/secondary-market-repository.ts` | Compatible: IDs are converted to strings without slicing or numeric parsing; numeric conversion applies to amounts/sequence. New focused mapping regression preserves all five families and mixed legacy references. |
| `secondary-market-service.ts`, `/secondary` action/form and domain matching | Compatible: cancellation forwards the complete order ID, joins compare strings, form validation requires nonempty ID. Matching ranks price/sequence. No five-family numeric route constraint was found. |
| Market Core read models, portfolio/clearing/audit views | Compatible: opaque identifiers and equality relationships; date/price/sequence sorting remains distinct from identity. No new UI or layout work is required. |
| `src/domain/market-core/engine.ts`, catalog and unit-test IDs | Fixture/in-memory allocation only. Legacy expectations remain correct for those paths; no runtime persistent writer was found outside the three SQL functions. |
| Historical SQL seed and MC-00 tests | Intentionally legacy. MC-00's suite now explicitly loads migrations only through MC-00, preserving its numeric-ID assertions. MC-01 independently loads that baseline then the new migration. |
| Locked secondary/Registrar preparation fixtures | Fixed `TRD-SEED-001` / `SET-SEED-001`, disabled/unarmed. They are not a general automatic execution path for new trades. |
| Solana V1 Rust, receipt, IDL and `deriveSecondarySettlementPda` | **KNOWN FUTURE-INCOMPATIBLE SETTLEMENT V1 CONTRACT — ACCEPTABLE FOR MC-01 ONLY BECAUSE SETTLEMENT IS DISABLED AND FUTURE V2 WILL USE A SEPARATE BOUNDED SETTLEMENT REFERENCE.** No active application call site of that PDA helper or automatic invocation of the secondary instruction was found. |

No other incompatible active public consumer was found. The Solana exception
does not waive compatibility checks for any other consumer.

## Market Core ↔ Solana identity boundary

**Canonical Market Core trade IDs are no longer constrained by the current
Solana V1 32-byte settlement identifier limit. Future Solana settlement will use
a separate bounded reference; that contract is not implemented by MC-01.**

Current V1 still accepts a `trade_id: String`, uses its raw bytes as a PDA seed,
rejects more than 32 bytes, and allocates a receipt string for at most 32 bytes.
It **cannot accept the new 40-byte canonical trade IDs**. Database business
identity and the future technical settlement reference are separate concepts.

`SECONDARY_SETTLEMENT_ENABLED` remains false; the application provider's
`settle()` throws even with affirmative configuration flags. A focused test calls
only this disabled application boundary with a synthetic 40-byte trade ID. It
does not derive a PDA or call a Solana program. PostgreSQL settlement preparation
still returns `SETTLEMENT_DISABLED`, or `SIGNATURE_LOOKUP` for recorded evidence,
with `allowNewChainSubmit=false`. The test signature marker is explicitly
synthetic and is rolled back, never presented as chain evidence.

Future Solana V2 is expected to derive a deterministic raw 32-byte SHA-256
reference from canonical trade identity under a separately reviewed contract.
MC-01 adds no digest logic, production domain/preimage constants, reference
column, binding, PDA change, V2 instruction or receipt change. There are **zero
changes under `solana/` and zero Solana IDL changes**.

**MC-01 does not make settlement executable.** MATCHED/FILLED remains distinct
from SETTLED. Registrar remains the authoritative legal book.

## Verification and reproduction

Both PostgreSQL suites require an externally installed `embedded-postgres`
runtime; no repository dependency was added. They start private PostgreSQL 18.x
clusters, assert empty `listen_addresses`, use Unix sockets only, and stop/remove
their own clusters. Auth/Storage schemas inside those clusters are synthetic
migration-loading stubs, not shared Supabase services.

```sh
GP01_EMBEDDED_POSTGRES_MODULE=/absolute/embedded-postgres/dist/index.js \
  node --test supabase/tests/market-core-submit-result.test.mjs
GP01_EMBEDDED_POSTGRES_MODULE=/absolute/embedded-postgres/dist/index.js \
  node --test supabase/tests/market-core-global-ids.test.mjs
npm test -- src/domain/market-core src/services/secondary-market-repository.test.ts src/services/secondary-market-service.test.ts src/lib/market-core
npm run check
npm run build
git diff --check
```

Recorded local validation: MC-00 **17/17**; independent pre-patch collision proof
**5/5**; MC-01 PostgreSQL **25/25**, including those five pre-patch probes;
targeted application tests **273/273 in 28 files**; full application tests
**857/857 in 62 files**; lint and typecheck pass through `npm run check`.
Production build and `git diff --check` also passed. Final source review confirms
only the five allocation expressions differ in the three replacement bodies.

Optional GP issuance/participant/PGlite suites were not rerun: no organization,
membership, run, origination or binding schema/function was changed. The MC-01
PostgreSQL suite still loads all canonical migrations and compares every effective
Market Core function, including ownership/ACL/config metadata. Existing public
and private execution grants are also asserted directly.

## Explicit non-goals and remaining work

**MC-01 fixes identifier allocation only. It does not make the service layer
multi-market and does not add run attribution.**

Solana V2 reference/binding is architecture-only and unimplemented. Settlement
remains disabled. Persistent participant/instrument architecture, explicit market
selection, run ownership, GP market bootstrap and holdings/eligibility redesign
remain later work. General changed-payload/cross-context idempotency and the
hardcoded DEMO-KZT behavior are unchanged.

The reset manifest is unchanged; Market Core remains **NOT_SCOPABLE** and Planner
remains **INCOMPLETE**. There is no shared migration, shared Supabase access,
Auth/Storage mutation, Devnet transaction, program upgrade, reset, Registrar
mutation or manual deployment. Draft PR preview is separate from applying SQL.
Do not begin MC-02 or enable settlement as part of MC-01.

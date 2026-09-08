# MC-00 — Market Core SQL ambiguity repair

An authenticated LIMIT submission on canonical develop
`cb217d20686ac633eeb7fac25954939c444f205d` failed with PostgreSQL SQLSTATE `42702`:
the unqualified idempotency `result` could name a local variable or a persisted
column. After isolating that repair, a crossing order exposed the same class of
error for `trade_n` in the fill function. Cancellation and settlement preparation
also contained executable `result` ambiguities.

The additive migration
`20260908105740_mc00_market_core_submit_result_ambiguity.sql` replaces four functions.
It qualifies only four SQL statements. The historical migrations are unchanged.

## Final effective definition audit

All 17 pre-MC00 migrations were loaded in repository filename order into disposable
PostgreSQL 18.4, with `plpgsql.variable_conflict=error`. The resulting catalog has
13 Market Core functions: 12 PL/pgSQL and one SQL function. The four affected
definitions all come from `20260823120000_market_core_rpc.sql`; later migrations
do not replace them. The later Registrar migration replaces `snapshot` and
`reconcile_wheat`; the subsequent DvP preparation migration drops the isolated test
functions and adds the unarmed Registrar preparation function.

| Function | Identifier | Local variable? | Table column? | Executable ambiguity? | MC-00 action |
| --- | --- | --- | --- | --- | --- |
| `public.market_core_submit_limit_order` | `result` | Yes | `market_core_idempotency.result` | Yes; authenticated RPC reproduced `42702` | Read `i.result`, filter `i.scope` and `i.key`. |
| `private.market_core_apply_fill` | `trade_n` | Yes | `market_core_counters.trade_n` | Yes; crossing submit reproduced `42702` | Use `c.trade_n` on UPDATE RHS and RETURNING. Qualify adjacent counter fields in the same statement; keep INTO variables. |
| `public.market_core_cancel_order` | `result` | Yes | `market_core_idempotency.result` | Yes; authenticated RPC reproduced `42702` | Read `i.result`, filter `i.scope` and `i.key`. |
| `public.market_core_prepare_settlement_submit` | `result` | Yes | `market_core_idempotency.result` | Yes; authorized admin RPC reproduced `42702` | Read `i.result`, filter `i.scope` and `i.key`. |
| `private.market_core_current_actor` | `user_id`, `role_id`, `participant_id` | Implicit OUT variables | Yes, on queried relations | No unqualified overlapping read found; relation reads already use aliases | None. |
| `private.market_core_emit` | `n` / `event_n` | Only `n` | Only `event_n` | No same-name overlap | None. |
| `private.market_core_match_incoming` | `incoming`, `resting`, `qty` | Yes | No same-name queried columns | No | None. |
| `public.market_core_settlement_intent` | `actor`, `rec`, `market`, `known` | Yes | No same-name columns in the corresponding reads | No | None. |
| `public.market_core_snapshot` | `actor` | Yes | Events have an `actor` column | No overlapping unqualified read; relation rows have aliases | None. |
| `public.market_core_reconcile_wheat` | `actor` | Yes | No same-name columns in its queries | No | None. |
| `private.market_core_guard_holdings_owned` | No declared locals | No | Trigger uses `new.owned` / `old.owned` | No | None. |
| `public.market_core_prepare_secondary_registrar_finalize` | No declared locals | No | No table query | No | None. |
| `private.market_core_is_eligible` | Prefixed parameters | No PL/pgSQL locals; SQL language | Aliased eligibility columns | No | None. |

Complete local-variable inventory for the PL/pgSQL functions:

| Function suffix (`market_core_…`) | Declared locals |
| --- | --- |
| `submit_limit_order` | `actor`, `market`, `prior`, `seq`, `n`, `res_n`, `required_cash`, `avail`, `order_id`, `order_row`, `result` |
| `apply_fill` | `buy_order`, `sell_order`, `exec_price`, `trade_row`, `trade_n`, `set_n`, `unused`, `buyer_ok`, `seller_ok`, `now_ts` |
| `cancel_order` | `actor`, `order_row`, `prior`, `release_qty`, `result` |
| `prepare_settlement_submit` | `actor`, `rec`, `prior`, `result` |
| `current_actor` | `uid`, `ctx`, `persona`, `org`, `mapped_role`, `mapped_participant`; additionally implicit OUT variables `user_id`, `role_id`, `participant_id`, `can_trade`, `can_read_all` |
| `emit` | `n` |
| `match_incoming` | `incoming`, `resting`, `qty` |
| `settlement_intent` | `actor`, `rec`, `market`, `known` |
| `snapshot` / `reconcile_wheat` | `actor` in each |
| `guard_holdings_owned` / `prepare_secondary_registrar_finalize` | None; the trigger uses PostgreSQL's `NEW`, `OLD`, and `TG_OP`. |

The audit checked SELECT expressions and predicates, UPDATE right-hand sides and
predicates, INSERT values, and RETURNING expressions against the locals. INSERT
target-column lists and UPDATE assignment targets were distinguished from value
expressions. `settlement_n`, `status`, `sequence`, and `id` are not declared local
variables in their corresponding queries. No further executable baseline ambiguity
was found in the final definitions or exercised paths; this is not a general SQL
correctness claim.

## Preserved contract

All four functions retain their signatures, language, return types, owner, ACL,
volatility, SECURITY DEFINER setting, and `search_path`. CREATE OR REPLACE preserves
the existing grants; the migration adds no grants and grants no table DML. Actor
resolution, authorization, advisory locking, market choice, eligibility, balances,
reservations, matching, events, receipt writes, errors, and result JSON are unchanged.

For fill, the UPDATE now reads and returns the persisted `c.trade_n` and
`c.settlement_n`, assigning the returned values to the original `trade_n` and `set_n`
locals. It still increments the same per-market counters exactly once. Legacy
`lpad` allocation, prefixes, primary keys, and market-local order sequence remain.

The regression compares the catalog's complete function bodies and contract metadata
before and after the migration, allowing exactly those four statement substitutions.
All other Market Core functions and existing Market Core/Registrar rows must match.

## Disposable PostgreSQL proof

`supabase/tests/market-core-submit-result.test.mjs` uses the established optional
embedded-postgres runtime. It accepts an absolute local module path, not a database
URL. It creates a unique temporary cluster with TCP disabled and a private Unix
socket, loads real migrations, and stops/removes the cluster on completion. Minimal
Auth/Storage stand-ins and all test identities exist only in that local cluster.

```sh
GP01_EMBEDDED_POSTGRES_MODULE=/absolute/path/to/embedded-postgres/dist/index.js \
  node --test supabase/tests/market-core-submit-result.test.mjs
```

The 17 scenarios pass on PostgreSQL 18.4:

- All four original ambiguities are reproduced. The original fill failure is reached
  through authenticated submits inside a transaction containing only the submit
  repair; rollback restores both function definitions and all rows.
- A new submit persists `ORD-0003`, `RES-0003`, an event, and the exact result receipt.
  Same-key and legacy receipt replay have no second effect.
- An incoming BUY at 110000 fills against a resting SELL at 105000, creating
  `TRD-0002` and `SET-0002`. Persisted trade/settlement counters are both 2; order
  sequence is 4 and event count 12. Price improvement, pending buckets, held
  reservations, partial fills, and self-match exclusion retain existing behavior.
- SELL and BUY cancellation release only the appropriate unfilled hold/cash. Replay
  causes no additional release. Partial cancellation preserves the filled hold.
- Authorized preparation returns `SETTLEMENT_DISABLED` without enabling settlement.
  A deliberately synthetic recorded-signature fixture returns `SIGNATURE_LOOKUP`;
  that fixture is rolled back and is never presented as chain evidence. Stored new
  and legacy preparation/cancellation JSON is replayed verbatim.
- A disposable test-only trigger raises after the trade insert and earlier matching
  mutations. The entire failed command rolls back, and retry succeeds after removal
  of that trigger. There is no production failure hook.
- Authorization checks and the Registrar-owned projection guard remain enforced.

## Boundaries

No shared migration, Auth/Storage operation, chain transaction, reset, Registrar
implementation change, or manual deployment is part of MC-00. Test setup alone
creates local synthetic identities and uses existing migration seeds.

The separate GP issuance/participant/PGlite suites need not be rerun for these
function replacements: their schema and function contracts are unchanged. The MC-00
suite still loads their migrations in order. The application gate remains required.

MC-01 is not implemented. Per-market counters still generate globally keyed IDs,
so the known multi-market allocation collision remains unfixed. Market Core has no
run attribution or service-level market selector added here. The proposed persistent
participant/instrument architecture remains unimplemented. The reset manifest is
unchanged and the planner remains **INCOMPLETE**. Hardcoded `DEMO-KZT` behavior remains
existing architecture debt. FILLED/MATCHED/pending settlement is not settlement finality.

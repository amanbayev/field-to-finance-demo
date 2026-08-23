-- Phase 5B.1 close-out (additive). Dedicated field-to-finance project only.
-- Does not rewrite already-applied remote migrations.
-- Does not change registered WHEAT-2027 owned quantities (990 / 10 / 0).
-- Does not enable settlement. Does not execute Devnet transfers.

-- ---------------------------------------------------------------------------
-- Authoritative registered ownership (Registrar book of record)
-- ---------------------------------------------------------------------------
create table if not exists public.registrar_registered_ownership (
  instrument_id text not null,
  participant_id text not null,
  registered_quantity bigint not null check (registered_quantity >= 0),
  evidence_kind text not null,
  evidence_id text,
  updated_at timestamptz not null default now(),
  primary key (instrument_id, participant_id),
  constraint registrar_registered_ownership_evidence_chk
    check (evidence_kind in ('PRIMARY_PLACEMENT', 'SECONDARY_SETTLEMENT', 'REGISTRAR_OPENING'))
);

comment on table public.registrar_registered_ownership is
  'Authoritative registered ownership (Registrar book of record). Legal owned lives here. Matching must not write this table.';

comment on table public.market_core_holdings is
  'Market balance view / trading projection. owned is a denormalized copy of registrar_registered_ownership. Matching may update reserved_for_orders, pledged, blocked, pending_in, pending_out only.';

comment on table public.market_core_chain_proof is
  'Observed / cached chain proof. Not chain truth. Live Devnet RPC is required before settlement approval.';

insert into public.registrar_registered_ownership (
  instrument_id, participant_id, registered_quantity, evidence_kind, evidence_id
)
select
  h.instrument_id,
  h.participant_id,
  h.owned,
  case
    when h.participant_id = 'INVESTOR-0001' then 'PRIMARY_PLACEMENT'
    else 'REGISTRAR_OPENING'
  end,
  case
    when h.participant_id = 'INVESTOR-0001' then 'PL-ISS001-0001'
    else null
  end
from public.market_core_holdings h
where h.instrument_id = 'WHEAT-2027'
on conflict (instrument_id, participant_id) do nothing;

alter table public.market_core_chain_proof
  add column if not exists observed_at timestamptz not null default now(),
  add column if not exists slot bigint,
  add column if not exists source text not null default 'CACHED_PROOF',
  add column if not exists signature text,
  add column if not exists ata text;

alter table public.market_core_chain_proof
  drop constraint if exists market_core_chain_proof_source_chk;
alter table public.market_core_chain_proof
  add constraint market_core_chain_proof_source_chk
  check (source in ('LIVE_RPC', 'CACHED_PROOF'));

update public.market_core_chain_proof
  set source = 'CACHED_PROOF'
  where source is null or source = 'CACHED_PROOF';

create or replace function private.market_core_guard_holdings_owned()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.owned is distinct from old.owned
     and current_setting('app.registrar_sync', true) is distinct from 'on' then
    raise exception 'OWNED_IS_REGISTRAR_PROJECTION';
  end if;
  return new;
end;
$$;

drop trigger if exists market_core_holdings_owned_guard on public.market_core_holdings;
create trigger market_core_holdings_owned_guard
  before update of owned on public.market_core_holdings
  for each row
  execute function private.market_core_guard_holdings_owned();

create or replace function private.registrar_sync_holdings_owned()
returns trigger
language plpgsql
as $$
begin
  perform set_config('app.registrar_sync', 'on', true);
  update public.market_core_holdings
    set owned = new.registered_quantity
    where instrument_id = new.instrument_id
      and participant_id = new.participant_id;
  return new;
end;
$$;

drop trigger if exists registrar_registered_ownership_sync on public.registrar_registered_ownership;
create trigger registrar_registered_ownership_sync
  after insert or update of registered_quantity on public.registrar_registered_ownership
  for each row
  execute function private.registrar_sync_holdings_owned();

alter table public.registrar_registered_ownership enable row level security;

revoke all on table public.registrar_registered_ownership from public, anon, authenticated;
grant select, insert, update, delete on table public.registrar_registered_ownership to service_role;

-- ---------------------------------------------------------------------------
-- Settlement identity map (no fabricated ATAs)
-- ---------------------------------------------------------------------------
create table if not exists public.market_core_settlement_identities (
  participant_id text primary key,
  participant_name text not null,
  solana_wallet text,
  wheat_ata text,
  demo_kzt_ata text,
  wheat_ata_on_chain boolean,
  demo_kzt_ata_on_chain boolean,
  notes text not null default ''
);

comment on table public.market_core_settlement_identities is
  'Off-chain settlement identity map. wheat_ata / demo_kzt_ata are recorded only when known. Missing ATA is not invented.';

alter table public.market_core_settlement_identities enable row level security;
revoke all on table public.market_core_settlement_identities from public, anon, authenticated;
grant select, insert, update, delete on table public.market_core_settlement_identities to service_role;

insert into public.market_core_settlement_identities (
  participant_id, participant_name, solana_wallet, wheat_ata, demo_kzt_ata,
  wheat_ata_on_chain, demo_kzt_ata_on_chain, notes
) values
  (
    'INVESTOR-0001',
    'Steppe Capital',
    'AJ7wcKJq368STkEWFDESGJKBSGvFbHDv749g9iAHZt63',
    'D7dNbub9wmETEkDoS7b73KpVxTwRb26Cbe9ffRptVUDw',
    'Fj15r1zWB4ncdtRwYFJcyZMGWgXp633sEqcFdD8Nnxmp',
    null,
    null,
    'Mapped from primary placement proof PL-ISS001-0001. On-chain existence is verified by LIVE_RPC, not this row.'
  ),
  (
    'REGISTRAR',
    'Agricultural Registrar',
    null,
    '321J7bc83M7D3E128tZkiGieg4MaQD5oBpHzHLFSjhQQ',
    null,
    null,
    null,
    'Registrar WHEAT ATA from primary placement proof. Wallet owner is the ATA authority on chain.'
  ),
  (
    'GRAIN-DESK',
    'Grain Desk',
    null,
    null,
    null,
    false,
    false,
    'NOT MAPPED. No Solana wallet is assigned to DEMO-TRADER-001 / grain-desk. WHEAT ATA and DEMO-KZT ATA do not exist. 5B.2 must designate a wallet, create ATAs, and fund DEMO-KZT. Do not fabricate an ATA.'
  )
on conflict (participant_id) do nothing;

-- ---------------------------------------------------------------------------
-- Reconcile: registrar book vs cached proof (never treat cache as chain truth)
-- ---------------------------------------------------------------------------
create or replace function public.market_core_reconcile_wheat()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor record;
begin
  select * into actor from private.market_core_current_actor();
  if actor.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  if not actor.can_read_all then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  return jsonb_build_object(
    'ok', true,
    'instrumentId', 'WHEAT-2027',
    'settlementEnabled', false,
    'proofSource', 'CACHED_PROOF',
    'chainTruth', false,
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'participantId', r.participant_id,
        'holderName', h.holder_name,
        'registeredOwned', r.registered_quantity,
        'chainBalance', p.on_chain_balance,
        'chainBalancePresent', p.on_chain_balance is not null,
        'pendingIn', h.pending_in,
        'pendingOut', h.pending_out,
        'proofSource', coalesce(p.source, 'CACHED_PROOF'),
        'observedAt', p.observed_at,
        'slot', p.slot,
        'ata', p.ata,
        'signature', p.signature,
        'exception', p.on_chain_balance is not null and p.on_chain_balance <> r.registered_quantity
      ) order by r.participant_id), '[]'::jsonb)
      from public.registrar_registered_ownership r
      join public.market_core_holdings h
        on h.participant_id = r.participant_id and h.instrument_id = r.instrument_id
      left join public.market_core_chain_proof p
        on p.participant_id = r.participant_id and p.instrument_id = r.instrument_id
      where r.instrument_id = 'WHEAT-2027'
    )
  );
end;
$$;

-- Snapshot includes the registrar book so the app does not treat holdings.owned as a second legal ledger.
create or replace function public.market_core_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor record;
begin
  select * into actor from private.market_core_current_actor();
  if actor.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  return jsonb_build_object(
    'ok', true,
    'actor', jsonb_build_object(
      'roleId', actor.role_id,
      'participantId', actor.participant_id,
      'canTrade', actor.can_trade,
      'canReadAll', actor.can_read_all
    ),
    'registeredOwnership', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.participant_id), '[]'::jsonb)
      from public.registrar_registered_ownership r
    ),
    'markets', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.market_core_markets m),
    'eligibility', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.market_core_eligibility e),
    'holdings', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from public.market_core_holdings h),
    'settlementAccounts', (
      select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
      from public.market_core_settlement_accounts a
      where actor.can_read_all or a.participant_id = actor.participant_id
    ),
    'orders', (
      select coalesce(jsonb_agg(to_jsonb(o) order by o.sequence), '[]'::jsonb)
      from public.market_core_orders o
      where actor.can_read_all
         or o.participant_id = actor.participant_id
         or o.status in ('OPEN', 'PARTIALLY_FILLED', 'FILLED')
    ),
    'reservations', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from public.market_core_reservations r
      where actor.can_read_all or r.participant_id = actor.participant_id
    ),
    'trades', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) from public.market_core_trades t),
    'settlements', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.market_core_settlements s),
    'events', (
      select coalesce(jsonb_agg(to_jsonb(ev) order by ev.occurred_at), '[]'::jsonb)
      from public.market_core_events ev
      where actor.can_read_all or ev.participant_id = actor.participant_id
    )
  );
end;
$$;

revoke all on function public.market_core_snapshot() from public, anon;
revoke all on function public.market_core_reconcile_wheat() from public, anon;
grant execute on function public.market_core_snapshot() to authenticated;
grant execute on function public.market_core_reconcile_wheat() to authenticated;

-- ---------------------------------------------------------------------------
-- Isolated concurrency fixtures (not WHEAT). Postgres / service_role only.
-- ---------------------------------------------------------------------------
create or replace function public.market_core_test_setup_isolated()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.market_core_reservations where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_trades where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_orders where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_settlement_accounts where participant_id in ('TEST-SELLER-A', 'TEST-BUYER-A', 'TEST-BUYER-B');
  delete from public.market_core_holdings where instrument_id = 'TEST-ISO-5B1';
  delete from public.market_core_eligibility where instrument_id = 'TEST-ISO-5B1';
  delete from public.market_core_idempotency where key like 'test-iso-5b1-%';
  delete from public.market_core_counters where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_markets where id = 'MKT-TEST-ISO-5B1';

  insert into public.market_core_markets (
    id, instrument_id, phase, transacting, matching_enabled, settlement_enabled,
    demonstrator_status, settlement_asset_id, settlement_asset_label
  ) values (
    'MKT-TEST-ISO-5B1', 'TEST-ISO-5B1', 'SECONDARY_OPEN', true, true, false,
    'DEMO_OPEN', 'TEST-CASH', 'TEST-CASH'
  );

  insert into public.market_core_counters (market_id, order_seq, order_n, trade_n, reservation_n, settlement_n, event_n)
  values ('MKT-TEST-ISO-5B1', 0, 0, 0, 0, 0, 0);

  insert into public.market_core_eligibility (participant_id, participant_name, instrument_id, state)
  values
    ('TEST-SELLER-A', 'Isolated Seller', 'TEST-ISO-5B1', 'ELIGIBLE'),
    ('TEST-BUYER-A', 'Isolated Buyer A', 'TEST-ISO-5B1', 'ELIGIBLE'),
    ('TEST-BUYER-B', 'Isolated Buyer B', 'TEST-ISO-5B1', 'ELIGIBLE');

  insert into public.market_core_holdings (
    id, instrument_id, participant_id, holder_name, owned, reserved_for_orders, pledged, blocked, pending_in, pending_out
  ) values
    ('hld-test-iso-seller', 'TEST-ISO-5B1', 'TEST-SELLER-A', 'Isolated Seller', 10, 0, 0, 0, 0, 0),
    ('hld-test-iso-buyer-a', 'TEST-ISO-5B1', 'TEST-BUYER-A', 'Isolated Buyer A', 0, 0, 0, 0, 0, 0),
    ('hld-test-iso-buyer-b', 'TEST-ISO-5B1', 'TEST-BUYER-B', 'Isolated Buyer B', 0, 0, 0, 0, 0, 0);

  insert into public.market_core_settlement_accounts (participant_id, asset_id, available, reserved)
  values
    ('TEST-BUYER-A', 'TEST-CASH', 1000000, 0),
    ('TEST-BUYER-B', 'TEST-CASH', 1000000, 0);

  return jsonb_build_object('ok', true, 'marketId', 'MKT-TEST-ISO-5B1', 'available', 10);
end;
$$;

create or replace function public.market_core_test_try_isolated_sell(p_qty bigint, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  avail bigint;
  prior jsonb;
  seq bigint;
  n bigint;
  res_n bigint;
  order_id text;
begin
  if coalesce(p_key, '') = '' or coalesce(p_qty, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtext('MKT-TEST-ISO-5B1'));

  select result into prior
  from public.market_core_idempotency
  where scope = 'submit' and key = p_key;
  if prior is not null then
    return prior || jsonb_build_object('duplicate', true);
  end if;

  select (owned - reserved_for_orders - pledged - blocked) into avail
  from public.market_core_holdings
  where participant_id = 'TEST-SELLER-A' and instrument_id = 'TEST-ISO-5B1'
  for update;

  if coalesce(avail, 0) < p_qty then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_AVAILABLE', 'available', coalesce(avail, 0));
  end if;

  update public.market_core_holdings
    set reserved_for_orders = reserved_for_orders + p_qty
    where participant_id = 'TEST-SELLER-A' and instrument_id = 'TEST-ISO-5B1';

  update public.market_core_counters
    set order_seq = order_seq + 1, order_n = order_n + 1, reservation_n = reservation_n + 1
    where market_id = 'MKT-TEST-ISO-5B1'
    returning order_seq, order_n, reservation_n into seq, n, res_n;

  order_id := 'ORD-TEST-ISO-' || lpad(n::text, 4, '0');

  insert into public.market_core_orders (
    id, market_id, instrument_id, participant_id, side, order_type, price,
    original_quantity, remaining_quantity, filled_quantity, status, sequence,
    source_channel, idempotency_key
  ) values (
    order_id, 'MKT-TEST-ISO-5B1', 'TEST-ISO-5B1', 'TEST-SELLER-A', 'SELL', 'LIMIT', 100,
    p_qty, p_qty, 0, 'OPEN', seq, 'DIRECT_MTP', p_key
  );

  insert into public.market_core_reservations (
    id, order_id, market_id, instrument_id, participant_id, kind, quantity, status
  ) values (
    'RES-TEST-ISO-' || lpad(res_n::text, 4, '0'),
    order_id, 'MKT-TEST-ISO-5B1', 'TEST-ISO-5B1', 'TEST-SELLER-A', 'ASSET', p_qty, 'ACTIVE'
  );

  insert into public.market_core_idempotency (scope, key, participant_id, result)
  values (
    'submit', p_key, 'TEST-SELLER-A',
    jsonb_build_object('ok', true, 'orderId', order_id, 'duplicate', false)
  )
  on conflict (scope, key) do nothing;

  return jsonb_build_object('ok', true, 'orderId', order_id, 'duplicate', false);
end;
$$;

create or replace function public.market_core_test_try_isolated_buy(
  p_participant text,
  p_qty bigint,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  avail bigint;
  prior jsonb;
  seq bigint;
  n bigint;
  res_n bigint;
  order_id text;
  cash bigint;
begin
  if p_participant not in ('TEST-BUYER-A', 'TEST-BUYER-B') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT');
  end if;
  if coalesce(p_key, '') = '' or coalesce(p_qty, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtext('MKT-TEST-ISO-5B1'));

  select result into prior
  from public.market_core_idempotency
  where scope = 'submit' and key = p_key;
  if prior is not null then
    return prior || jsonb_build_object('duplicate', true);
  end if;

  cash := 100 * p_qty;
  select available into avail
  from public.market_core_settlement_accounts
  where participant_id = p_participant and asset_id = 'TEST-CASH'
  for update;
  if coalesce(avail, 0) < cash then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SETTLEMENT');
  end if;

  update public.market_core_settlement_accounts
    set available = available - cash, reserved = reserved + cash
    where participant_id = p_participant and asset_id = 'TEST-CASH';

  update public.market_core_counters
    set order_seq = order_seq + 1, order_n = order_n + 1, reservation_n = reservation_n + 1
    where market_id = 'MKT-TEST-ISO-5B1'
    returning order_seq, order_n, reservation_n into seq, n, res_n;

  order_id := 'ORD-TEST-ISO-' || lpad(n::text, 4, '0');

  insert into public.market_core_orders (
    id, market_id, instrument_id, participant_id, side, order_type, price,
    original_quantity, remaining_quantity, filled_quantity, status, sequence,
    source_channel, idempotency_key
  ) values (
    order_id, 'MKT-TEST-ISO-5B1', 'TEST-ISO-5B1', p_participant, 'BUY', 'LIMIT', 100,
    p_qty, p_qty, 0, 'OPEN', seq, 'DIRECT_MTP', p_key
  );

  insert into public.market_core_reservations (
    id, order_id, market_id, instrument_id, participant_id, kind, quantity, status
  ) values (
    'RES-TEST-ISO-' || lpad(res_n::text, 4, '0'),
    order_id, 'MKT-TEST-ISO-5B1', 'TEST-ISO-5B1', p_participant, 'SETTLEMENT', cash, 'ACTIVE'
  );

  perform private.market_core_match_incoming(order_id);

  insert into public.market_core_idempotency (scope, key, participant_id, result)
  values (
    'submit', p_key, p_participant,
    jsonb_build_object('ok', true, 'orderId', order_id, 'duplicate', false)
  )
  on conflict (scope, key) do nothing;

  return jsonb_build_object('ok', true, 'orderId', order_id, 'duplicate', false);
end;
$$;

create or replace function public.market_core_test_isolated_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  return jsonb_build_object(
    'orders', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from public.market_core_orders o where o.market_id = 'MKT-TEST-ISO-5B1'),
    'trades', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.market_core_trades t where t.market_id = 'MKT-TEST-ISO-5B1'),
    'holdings', (select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb) from public.market_core_holdings h where h.instrument_id = 'TEST-ISO-5B1')
  );
end;
$$;

create or replace function public.market_core_test_cleanup_isolated()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.market_core_reservations where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_settlements where trade_id in (
    select id from public.market_core_trades where market_id = 'MKT-TEST-ISO-5B1'
  );
  delete from public.market_core_idempotency
    where key in (select id from public.market_core_trades where market_id = 'MKT-TEST-ISO-5B1')
       or key like 'test-iso-5b1-%';
  delete from public.market_core_events where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_trades where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_orders where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_settlement_accounts where participant_id in ('TEST-SELLER-A', 'TEST-BUYER-A', 'TEST-BUYER-B');
  delete from public.market_core_holdings where instrument_id = 'TEST-ISO-5B1';
  delete from public.market_core_eligibility where instrument_id = 'TEST-ISO-5B1';
  delete from public.market_core_idempotency where key like 'test-iso-5b1-%';
  delete from public.market_core_counters where market_id = 'MKT-TEST-ISO-5B1';
  delete from public.market_core_markets where id = 'MKT-TEST-ISO-5B1';
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.market_core_test_setup_isolated() from public, anon, authenticated;
revoke all on function public.market_core_test_try_isolated_sell(bigint, text) from public, anon, authenticated;
revoke all on function public.market_core_test_try_isolated_buy(text, bigint, text) from public, anon, authenticated;
revoke all on function public.market_core_test_isolated_summary() from public, anon, authenticated;
revoke all on function public.market_core_test_cleanup_isolated() from public, anon, authenticated;

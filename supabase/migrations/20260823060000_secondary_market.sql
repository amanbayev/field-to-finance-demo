-- Phase 5B.1: additive Market Core persistence, transactional matching RPCs,
-- RLS, and a one-time WHEAT secondary seed.
-- Apply only to the dedicated field-to-finance project.
-- Does not alter identity tables, Solana state, or registered WHEAT owned amounts.

create table if not exists public.market_core_markets (
  id text primary key,
  instrument_id text not null,
  phase text not null,
  transacting boolean not null default false,
  matching_enabled boolean not null default true,
  settlement_enabled boolean not null default false,
  demonstrator_status text not null default 'DEMO_OPEN',
  settlement_asset_id text not null,
  settlement_asset_label text not null default 'DEMO-KZT',
  settlement_has_monetary_value boolean not null default false,
  market_type text not null default 'REGULATED_INSTITUTIONAL_DEMONSTRATOR',
  allowed_order_types text[] not null default array['LIMIT']::text[],
  whole_quantity_only boolean not null default true,
  created_at timestamptz not null default now(),
  constraint market_core_markets_demo_status_chk
    check (demonstrator_status in ('DEMO_OPEN', 'DEMO_CLOSED'))
);

create table if not exists public.market_core_eligibility (
  participant_id text not null,
  participant_name text not null,
  instrument_id text not null,
  state text not null,
  primary key (participant_id, instrument_id),
  constraint market_core_eligibility_state_chk
    check (state in ('ELIGIBLE', 'NOT_ELIGIBLE', 'NOT_ASSESSED', 'POLICY_PENDING'))
);

create table if not exists public.market_core_holdings (
  id text primary key,
  instrument_id text not null,
  participant_id text not null,
  holder_name text not null,
  owned bigint not null check (owned >= 0),
  reserved_for_orders bigint not null check (reserved_for_orders >= 0),
  pledged bigint not null check (pledged >= 0),
  blocked bigint not null check (blocked >= 0),
  pending_in bigint not null check (pending_in >= 0),
  pending_out bigint not null check (pending_out >= 0),
  unique (instrument_id, participant_id),
  constraint market_core_holdings_available_chk
    check (owned - reserved_for_orders - pledged - blocked >= 0)
);

create table if not exists public.market_core_settlement_accounts (
  participant_id text not null,
  asset_id text not null,
  available bigint not null check (available >= 0),
  reserved bigint not null check (reserved >= 0),
  primary key (participant_id, asset_id)
);

create table if not exists public.market_core_chain_proof (
  participant_id text not null,
  instrument_id text not null,
  on_chain_balance bigint not null check (on_chain_balance >= 0),
  as_of timestamptz not null default now(),
  primary key (participant_id, instrument_id)
);

create table if not exists public.market_core_orders (
  id text primary key,
  market_id text not null references public.market_core_markets (id),
  instrument_id text not null,
  participant_id text not null,
  side text not null check (side in ('BUY', 'SELL')),
  order_type text not null check (order_type = 'LIMIT'),
  price bigint not null check (price > 0),
  original_quantity bigint not null check (original_quantity > 0),
  remaining_quantity bigint not null check (remaining_quantity >= 0),
  filled_quantity bigint not null check (filled_quantity >= 0),
  status text not null check (status in ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED')),
  sequence bigint not null,
  source_channel text not null default 'DIRECT_MTP',
  reject_reason text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_core_orders_no_overfill
    check (filled_quantity + remaining_quantity <= original_quantity)
);

create unique index if not exists market_core_orders_market_sequence_uidx
  on public.market_core_orders (market_id, sequence);
create unique index if not exists market_core_orders_idempotency_uidx
  on public.market_core_orders (participant_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.market_core_reservations (
  id text primary key,
  order_id text not null references public.market_core_orders (id),
  market_id text not null,
  instrument_id text not null,
  participant_id text not null,
  kind text not null check (kind in ('ASSET', 'SETTLEMENT')),
  quantity bigint not null check (quantity >= 0),
  status text not null check (status in ('ACTIVE', 'RELEASED', 'HELD_PENDING_SETTLEMENT')),
  created_at timestamptz not null default now()
);

create table if not exists public.market_core_trades (
  id text primary key,
  market_id text not null,
  instrument_id text not null,
  buy_order_id text not null references public.market_core_orders (id),
  sell_order_id text not null references public.market_core_orders (id),
  buyer_participant_id text not null,
  seller_participant_id text not null,
  quantity bigint not null check (quantity > 0),
  price bigint not null check (price > 0),
  notional bigint not null check (notional > 0),
  status text not null,
  kind text not null check (kind = 'SECONDARY'),
  eligibility_recheck_passed boolean not null default false,
  dvp_status text not null default 'PENDING',
  registry_update_status text not null default 'PENDING',
  final_settlement_status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_core_trades_status_chk
    check (status in ('MATCHED', 'CLEARING_READY', 'AWAITING_DEVNET_SETTLEMENT')),
  constraint market_core_trades_unique_pair unique (buy_order_id, sell_order_id, quantity, price)
);

create table if not exists public.market_core_settlements (
  id text primary key,
  trade_id text not null unique,
  status text not null,
  kind text not null check (kind in ('PRIMARY', 'SECONDARY')),
  provider text not null default 'DEMO',
  idempotency_key text not null unique,
  evidence_label text,
  asset_tx_signature text,
  payment_tx_signature text,
  atomic_dvp_tx_signature text,
  submitted_at timestamptz,
  chain_confirmed_at timestamptz,
  registry_finalized_at timestamptz,
  settled_at timestamptz,
  last_error text,
  retry_count integer not null default 0 check (retry_count >= 0),
  created_at timestamptz not null default now(),
  constraint market_core_settlements_status_chk
    check (status in (
      'RESERVED',
      'AWAITING_DEVNET_SETTLEMENT',
      'MATCHED',
      'CLEARING_READY',
      'SETTLEMENT_READY',
      'SETTLEMENT_SUBMITTING',
      'SETTLEMENT_SUBMITTED',
      'CHAIN_CONFIRMED',
      'REGISTRY_FINALIZING',
      'SETTLED',
      'SETTLEMENT_EXCEPTION',
      'FINAL',
      'DVP_COMPLETE'
    )),
  constraint market_core_settlements_settled_requires_evidence
    check (
      status <> 'SETTLED'
      or (
        (asset_tx_signature is not null or atomic_dvp_tx_signature is not null)
        and chain_confirmed_at is not null
        and registry_finalized_at is not null
        and settled_at is not null
      )
    )
);

create table if not exists public.market_core_events (
  id text primary key,
  occurred_at timestamptz not null default now(),
  actor text not null,
  participant_id text,
  instrument_id text not null,
  market_id text not null,
  entity_id text not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.market_core_idempotency (
  scope text not null,
  key text not null,
  participant_id text,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

create table if not exists public.market_core_counters (
  market_id text primary key references public.market_core_markets (id),
  order_seq bigint not null default 0,
  order_n bigint not null default 0,
  trade_n bigint not null default 0,
  reservation_n bigint not null default 0,
  settlement_n bigint not null default 0,
  event_n bigint not null default 0
);

create table if not exists public.market_core_participant_map (
  organization_slug text primary key,
  participant_id text not null,
  participant_name text not null
);

create index if not exists market_core_orders_live_idx
  on public.market_core_orders (market_id, side, status, price, sequence)
  where status in ('OPEN', 'PARTIALLY_FILLED');
create index if not exists market_core_events_market_idx
  on public.market_core_events (market_id, occurred_at desc);

alter table public.market_core_markets enable row level security;
alter table public.market_core_eligibility enable row level security;
alter table public.market_core_holdings enable row level security;
alter table public.market_core_settlement_accounts enable row level security;
alter table public.market_core_orders enable row level security;
alter table public.market_core_reservations enable row level security;
alter table public.market_core_trades enable row level security;
alter table public.market_core_settlements enable row level security;
alter table public.market_core_events enable row level security;
alter table public.market_core_idempotency enable row level security;
alter table public.market_core_counters enable row level security;
alter table public.market_core_participant_map enable row level security;
alter table public.market_core_chain_proof enable row level security;

revoke all on table public.market_core_markets from public, anon, authenticated;
revoke all on table public.market_core_eligibility from public, anon, authenticated;
revoke all on table public.market_core_holdings from public, anon, authenticated;
revoke all on table public.market_core_settlement_accounts from public, anon, authenticated;
revoke all on table public.market_core_orders from public, anon, authenticated;
revoke all on table public.market_core_reservations from public, anon, authenticated;
revoke all on table public.market_core_trades from public, anon, authenticated;
revoke all on table public.market_core_settlements from public, anon, authenticated;
revoke all on table public.market_core_events from public, anon, authenticated;
revoke all on table public.market_core_idempotency from public, anon, authenticated;
revoke all on table public.market_core_counters from public, anon, authenticated;
revoke all on table public.market_core_participant_map from public, anon, authenticated;
revoke all on table public.market_core_chain_proof from public, anon, authenticated;

insert into public.market_core_participant_map (organization_slug, participant_id, participant_name)
values
  ('steppe-capital', 'INVESTOR-0001', 'Steppe Capital'),
  ('grain-desk', 'GRAIN-DESK', 'Grain Desk'),
  ('agricultural-registrar', 'REGISTRAR', 'Agricultural Registrar'),
  ('commodity-desk', 'COMMODITY-DESK', 'Commodity Desk')
on conflict (organization_slug) do nothing;

create unique index if not exists market_core_reservations_live_uidx
  on public.market_core_reservations (order_id, kind)
  where status in ('ACTIVE', 'HELD_PENDING_SETTLEMENT');

insert into public.market_core_markets (
  id, instrument_id, phase, transacting, matching_enabled, settlement_enabled,
  demonstrator_status, settlement_asset_id, settlement_asset_label
) values (
  'MKT-WHEAT-2027-DEMO-KZT',
  'WHEAT-2027',
  'SECONDARY_OPEN',
  true,
  true,
  false,
  'DEMO_OPEN',
  'DEMO-KZT',
  'DEMO-KZT'
) on conflict (id) do nothing;

insert into public.market_core_counters (market_id, order_seq, order_n, trade_n, reservation_n, settlement_n, event_n)
values ('MKT-WHEAT-2027-DEMO-KZT', 2, 2, 1, 2, 1, 8)
on conflict (market_id) do nothing;

insert into public.market_core_eligibility (participant_id, participant_name, instrument_id, state)
values
  ('INVESTOR-0001', 'Steppe Capital', 'WHEAT-2027', 'ELIGIBLE'),
  ('GRAIN-DESK', 'Grain Desk', 'WHEAT-2027', 'ELIGIBLE'),
  ('INVESTOR-0001', 'Steppe Capital', 'WATER-FUTURE', 'NOT_ASSESSED'),
  ('INVESTOR-0001', 'Steppe Capital', 'F2F-PROTOCOL-INVESTMENT', 'NOT_ASSESSED'),
  ('COMMODITY-DESK', 'Commodity Desk', 'WHEAT-2027', 'NOT_ASSESSED'),
  ('RETAIL-PLACEHOLDER', 'Retail investor (future channel)', 'WHEAT-2027', 'POLICY_PENDING')
on conflict (participant_id, instrument_id) do nothing;

insert into public.market_core_holdings (
  id, instrument_id, participant_id, holder_name, owned, reserved_for_orders, pledged, blocked, pending_in, pending_out
) values
  ('hld-registrar-wheat', 'WHEAT-2027', 'REGISTRAR', 'Agricultural Registrar', 990, 0, 0, 0, 0, 0),
  ('hld-steppe-wheat', 'WHEAT-2027', 'INVESTOR-0001', 'Steppe Capital', 10, 2, 0, 0, 0, 2),
  ('hld-grain-desk-wheat', 'WHEAT-2027', 'GRAIN-DESK', 'Grain Desk', 0, 0, 0, 0, 2, 0)
on conflict (id) do nothing;

insert into public.market_core_chain_proof (participant_id, instrument_id, on_chain_balance)
values
  ('REGISTRAR', 'WHEAT-2027', 990),
  ('INVESTOR-0001', 'WHEAT-2027', 10),
  ('GRAIN-DESK', 'WHEAT-2027', 0)
on conflict (participant_id, instrument_id) do nothing;

insert into public.market_core_settlement_accounts (participant_id, asset_id, available, reserved)
values
  ('INVESTOR-0001', 'DEMO-KZT', 500000, 0),
  ('GRAIN-DESK', 'DEMO-KZT', 790000, 210000)
on conflict (participant_id, asset_id) do nothing;

insert into public.market_core_orders (
  id, market_id, instrument_id, participant_id, side, order_type, price,
  original_quantity, remaining_quantity, filled_quantity, status, sequence,
  source_channel, idempotency_key, created_at, updated_at
) values
  (
    'ORD-SEED-SELL-001', 'MKT-WHEAT-2027-DEMO-KZT', 'WHEAT-2027', 'INVESTOR-0001',
    'SELL', 'LIMIT', 105000, 2, 0, 2, 'FILLED', 1, 'DIRECT_MTP',
    'seed-submit-ORD-SEED-SELL-001', '2026-08-23T10:00:00Z', '2026-08-23T10:01:00Z'
  ),
  (
    'ORD-SEED-BUY-001', 'MKT-WHEAT-2027-DEMO-KZT', 'WHEAT-2027', 'GRAIN-DESK',
    'BUY', 'LIMIT', 105000, 2, 0, 2, 'FILLED', 2, 'DIRECT_MTP',
    'seed-submit-ORD-SEED-BUY-001', '2026-08-23T10:01:00Z', '2026-08-23T10:01:00Z'
  )
on conflict (id) do nothing;

insert into public.market_core_reservations (
  id, order_id, market_id, instrument_id, participant_id, kind, quantity, status
) values
  ('RES-SEED-ASSET-001', 'ORD-SEED-SELL-001', 'MKT-WHEAT-2027-DEMO-KZT', 'WHEAT-2027', 'INVESTOR-0001', 'ASSET', 2, 'HELD_PENDING_SETTLEMENT'),
  ('RES-SEED-CASH-001', 'ORD-SEED-BUY-001', 'MKT-WHEAT-2027-DEMO-KZT', 'WHEAT-2027', 'GRAIN-DESK', 'SETTLEMENT', 210000, 'HELD_PENDING_SETTLEMENT')
on conflict (id) do nothing;

insert into public.market_core_trades (
  id, market_id, instrument_id, buy_order_id, sell_order_id, buyer_participant_id, seller_participant_id,
  quantity, price, notional, status, kind, eligibility_recheck_passed, created_at, updated_at
) values (
  'TRD-SEED-001', 'MKT-WHEAT-2027-DEMO-KZT', 'WHEAT-2027', 'ORD-SEED-BUY-001', 'ORD-SEED-SELL-001',
  'GRAIN-DESK', 'INVESTOR-0001', 2, 105000, 210000, 'AWAITING_DEVNET_SETTLEMENT', 'SECONDARY', true,
  '2026-08-23T10:01:00Z', '2026-08-23T10:01:00Z'
) on conflict (id) do nothing;

insert into public.market_core_settlements (
  id, trade_id, status, kind, provider, idempotency_key, evidence_label
) values (
  'SET-SEED-001', 'TRD-SEED-001', 'AWAITING_DEVNET_SETTLEMENT', 'SECONDARY', 'DEMO',
  'seed-settlement-SET-SEED-001', null
) on conflict (id) do nothing;

insert into public.market_core_events (
  id, occurred_at, actor, participant_id, instrument_id, market_id, entity_id, event_type, metadata
) values
  ('EVT-SEED-01', '2026-08-23T10:00:00Z', 'DEMO-FUND-001', 'INVESTOR-0001', 'WHEAT-2027', 'MKT-WHEAT-2027-DEMO-KZT', 'ORD-SEED-SELL-001', 'order_submitted', '{"side":"SELL","price":105000,"quantity":2}'::jsonb),
  ('EVT-SEED-02', '2026-08-23T10:00:00Z', 'DEMO-FUND-001', 'INVESTOR-0001', 'WHEAT-2027', 'MKT-WHEAT-2027-DEMO-KZT', 'ORD-SEED-SELL-001', 'order_reserved', '{"kind":"ASSET","quantity":2}'::jsonb),
  ('EVT-SEED-03', '2026-08-23T10:01:00Z', 'DEMO-TRADER-001', 'GRAIN-DESK', 'WHEAT-2027', 'MKT-WHEAT-2027-DEMO-KZT', 'ORD-SEED-BUY-001', 'order_submitted', '{"side":"BUY","price":105000,"quantity":2}'::jsonb),
  ('EVT-SEED-04', '2026-08-23T10:01:00Z', 'DEMO-TRADER-001', 'GRAIN-DESK', 'WHEAT-2027', 'MKT-WHEAT-2027-DEMO-KZT', 'ORD-SEED-BUY-001', 'order_reserved', '{"kind":"SETTLEMENT","quantity":210000}'::jsonb),
  ('EVT-SEED-05', '2026-08-23T10:01:00Z', 'MATCHING_ENGINE', 'GRAIN-DESK', 'WHEAT-2027', 'MKT-WHEAT-2027-DEMO-KZT', 'ORD-SEED-BUY-001', 'order_matched', '{"tradeId":"TRD-SEED-001","quantity":2,"price":105000}'::jsonb),
  ('EVT-SEED-06', '2026-08-23T10:01:00Z', 'MATCHING_ENGINE', null, 'WHEAT-2027', 'MKT-WHEAT-2027-DEMO-KZT', 'TRD-SEED-001', 'trade_created', '{"quantity":2,"price":105000,"notional":210000}'::jsonb),
  ('EVT-SEED-07', '2026-08-23T10:01:00Z', 'MATCHING_ENGINE', 'GRAIN-DESK', 'WHEAT-2027', 'MKT-WHEAT-2027-DEMO-KZT', 'TRD-SEED-001', 'eligibility_rechecked', '{"passed":true}'::jsonb),
  ('EVT-SEED-08', '2026-08-23T10:01:00Z', 'MATCHING_ENGINE', 'GRAIN-DESK', 'WHEAT-2027', 'MKT-WHEAT-2027-DEMO-KZT', 'TRD-SEED-001', 'settlement_reservation_confirmed', '{"notional":210000,"dvp":"PENDING"}'::jsonb)
on conflict (id) do nothing;

insert into public.market_core_idempotency (scope, key, participant_id, result)
values
  ('submit', 'seed-submit-ORD-SEED-SELL-001', 'INVESTOR-0001', jsonb_build_object('ok', true, 'orderId', 'ORD-SEED-SELL-001')),
  ('submit', 'seed-submit-ORD-SEED-BUY-001', 'GRAIN-DESK', jsonb_build_object('ok', true, 'orderId', 'ORD-SEED-BUY-001')),
  ('settlement_submit', 'seed-settlement-SET-SEED-001', null, jsonb_build_object('ok', false, 'error', 'SETTLEMENT_DISABLED'))
on conflict (scope, key) do nothing;

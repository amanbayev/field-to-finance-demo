-- Phase 5B Preview: additive secondary-market tables.
-- NOT applied to the shared Production Supabase project in this stage.
-- Preview interactivity uses an in-process engine store + seeded scenario.
-- This file documents the intended durable schema and RLS for a later apply.

-- Does not alter identity tables, Solana state, or WHEAT-2027 legal holdings.

create table if not exists public.market_core_markets (
  id text primary key,
  instrument_id text not null,
  phase text not null,
  transacting boolean not null default false,
  settlement_asset_id text not null,
  settlement_has_monetary_value boolean not null default false,
  created_at timestamptz not null default now()
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
  status text not null,
  sequence bigint not null,
  source_channel text not null default 'DIRECT_MTP',
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_core_orders_no_overfill
    check (filled_quantity + remaining_quantity <= original_quantity)
);

create unique index if not exists market_core_orders_market_sequence_uidx
  on public.market_core_orders (market_id, sequence);

create table if not exists public.market_core_reservations (
  id text primary key,
  order_id text not null references public.market_core_orders (id),
  market_id text not null,
  instrument_id text not null,
  participant_id text not null,
  kind text not null check (kind in ('ASSET', 'SETTLEMENT')),
  quantity bigint not null check (quantity >= 0),
  status text not null,
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
  dvp_status text not null default 'PENDING',
  registry_update_status text not null default 'PENDING',
  final_settlement_status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_core_settlements (
  id text primary key,
  trade_id text not null,
  status text not null,
  evidence_label text,
  kind text not null check (kind in ('PRIMARY', 'SECONDARY')),
  created_at timestamptz not null default now()
);

create table if not exists public.market_core_eligibility (
  participant_id text not null,
  instrument_id text not null,
  state text not null,
  primary key (participant_id, instrument_id)
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

create table if not exists public.market_core_settlement_accounts (
  participant_id text not null,
  asset_id text not null,
  available bigint not null check (available >= 0),
  reserved bigint not null check (reserved >= 0),
  primary key (participant_id, asset_id)
);

alter table public.market_core_markets enable row level security;
alter table public.market_core_orders enable row level security;
alter table public.market_core_reservations enable row level security;
alter table public.market_core_trades enable row level security;
alter table public.market_core_settlements enable row level security;
alter table public.market_core_eligibility enable row level security;
alter table public.market_core_events enable row level security;
alter table public.market_core_settlement_accounts enable row level security;

revoke all on table public.market_core_markets from public, anon, authenticated;
revoke all on table public.market_core_orders from public, anon, authenticated;
revoke all on table public.market_core_reservations from public, anon, authenticated;
revoke all on table public.market_core_trades from public, anon, authenticated;
revoke all on table public.market_core_settlements from public, anon, authenticated;
revoke all on table public.market_core_eligibility from public, anon, authenticated;
revoke all on table public.market_core_events from public, anon, authenticated;
revoke all on table public.market_core_settlement_accounts from public, anon, authenticated;

-- Intended later: SECURITY DEFINER RPCs in schema private that
-- 1. take pg_advisory_xact_lock(hashtext(market_id))
-- 2. verify the caller via session_contexts / memberships (no service_role in the app)
-- 3. apply submit/cancel atomically
-- 4. never write settlement_finalized or registry_transfer_completed until real DvP

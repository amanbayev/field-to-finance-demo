-- MC-01: global business identity is independent of market-local counters.
-- Change only new ORD/RES/TRD/SET/EVT allocation. Keep counter increments,
-- local order sequence, historical rows, and MC-00 ambiguity qualifications.
-- CREATE OR REPLACE retains existing function ownership and EXECUTE grants.
-- Settlement stays disabled; no Solana V1/V2 contract is changed here.

create or replace function private.market_core_emit(
  p_actor text,
  p_participant text,
  p_instrument text,
  p_market text,
  p_entity text,
  p_type text,
  p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  n bigint;
begin
  update public.market_core_counters
    set event_n = event_n + 1
    where market_id = p_market
    returning event_n into n;
  insert into public.market_core_events (
    id, occurred_at, actor, participant_id, instrument_id, market_id, entity_id, event_type, metadata
  ) values (
    'EVT-' || gen_random_uuid()::text,
    clock_timestamp(),
    p_actor,
    p_participant,
    p_instrument,
    p_market,
    p_entity,
    p_type,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.market_core_submit_limit_order(
  p_market_id text,
  p_side text,
  p_price bigint,
  p_quantity bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor record;
  market public.market_core_markets;
  prior jsonb;
  seq bigint;
  n bigint;
  res_n bigint;
  required_cash bigint;
  avail bigint;
  order_id text;
  order_row public.market_core_orders;
  result jsonb;
begin
  select * into actor from private.market_core_current_actor();
  if actor.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  if coalesce(p_idempotency_key, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'IDEMPOTENCY_REQUIRED');
  end if;
  if not actor.can_trade then
    return jsonb_build_object('ok', false, 'error', 'INELIGIBLE');
  end if;
  if p_side not in ('BUY', 'SELL') or coalesce(p_price, 0) <= 0 or coalesce(p_quantity, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_QUANTITY');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_market_id));

  select i.result into prior
  from public.market_core_idempotency as i
  where i.scope = 'submit' and i.key = p_idempotency_key;
  if prior is not null then
    return prior;
  end if;

  select * into market from public.market_core_markets where id = p_market_id for update;
  if market.id is null or not market.transacting or not market.matching_enabled or market.phase <> 'SECONDARY_OPEN' then
    return jsonb_build_object('ok', false, 'error', 'MARKET_CLOSED');
  end if;
  if not private.market_core_is_eligible(actor.participant_id, market.instrument_id) then
    return jsonb_build_object('ok', false, 'error', 'INELIGIBLE');
  end if;

  if p_side = 'SELL' then
    select (owned - reserved_for_orders - pledged - blocked) into avail
    from public.market_core_holdings
    where participant_id = actor.participant_id and instrument_id = market.instrument_id
    for update;
    if coalesce(avail, 0) < p_quantity then
      return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_AVAILABLE');
    end if;
    update public.market_core_holdings
      set reserved_for_orders = reserved_for_orders + p_quantity
      where participant_id = actor.participant_id and instrument_id = market.instrument_id;
  else
    required_cash := p_price * p_quantity;
    select available into avail
    from public.market_core_settlement_accounts
    where participant_id = actor.participant_id and asset_id = market.settlement_asset_id
    for update;
    if coalesce(avail, 0) < required_cash then
      return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SETTLEMENT');
    end if;
    update public.market_core_settlement_accounts
      set available = available - required_cash,
          reserved = reserved + required_cash
      where participant_id = actor.participant_id and asset_id = market.settlement_asset_id;
  end if;

  update public.market_core_counters
    set order_seq = order_seq + 1, order_n = order_n + 1, reservation_n = reservation_n + 1
    where market_id = p_market_id
    returning order_seq, order_n, reservation_n into seq, n, res_n;
  order_id := 'ORD-' || gen_random_uuid()::text;

  insert into public.market_core_orders (
    id, market_id, instrument_id, participant_id, side, order_type, price,
    original_quantity, remaining_quantity, filled_quantity, status, sequence,
    source_channel, idempotency_key
  ) values (
    order_id, p_market_id, market.instrument_id, actor.participant_id, p_side, 'LIMIT', p_price,
    p_quantity, p_quantity, 0, 'OPEN', seq, 'DIRECT_MTP', p_idempotency_key
  ) returning * into order_row;

  insert into public.market_core_reservations (
    id, order_id, market_id, instrument_id, participant_id, kind, quantity, status
  ) values (
    'RES-' || gen_random_uuid()::text,
    order_id,
    p_market_id,
    market.instrument_id,
    actor.participant_id,
    case when p_side = 'SELL' then 'ASSET' else 'SETTLEMENT' end,
    case when p_side = 'SELL' then p_quantity else p_price * p_quantity end,
    'ACTIVE'
  );

  perform private.market_core_emit(
    coalesce(actor.role_id, 'UNKNOWN'), actor.participant_id, market.instrument_id, p_market_id, order_id,
    'order_submitted', jsonb_build_object('side', p_side, 'price', p_price, 'quantity', p_quantity)
  );
  perform private.market_core_match_incoming(order_id);
  select * into order_row from public.market_core_orders where id = order_id;

  result := jsonb_build_object('ok', true, 'error', null, 'orderId', order_id, 'status', order_row.status);
  insert into public.market_core_idempotency (scope, key, participant_id, result)
  values ('submit', p_idempotency_key, actor.participant_id, result)
  on conflict (scope, key) do nothing;
  return result;
end;
$$;

create or replace function private.market_core_apply_fill(
  p_incoming public.market_core_orders,
  p_resting public.market_core_orders,
  p_qty bigint
)
returns public.market_core_trades
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  buy_order public.market_core_orders;
  sell_order public.market_core_orders;
  exec_price bigint := p_resting.price;
  trade_row public.market_core_trades;
  trade_n bigint;
  set_n bigint;
  unused bigint;
  buyer_ok boolean;
  seller_ok boolean;
  now_ts timestamptz := clock_timestamp();
begin
  if p_incoming.side = 'BUY' then
    buy_order := p_incoming;
    sell_order := p_resting;
  else
    buy_order := p_resting;
    sell_order := p_incoming;
  end if;
  if buy_order.price < sell_order.price then
    raise exception 'NO_CROSS';
  end if;
  if p_qty <= 0
     or p_qty > p_incoming.remaining_quantity
     or p_qty > p_resting.remaining_quantity then
    raise exception 'OVERFILL';
  end if;

  update public.market_core_orders
    set filled_quantity = filled_quantity + p_qty,
        remaining_quantity = remaining_quantity - p_qty,
        status = case
          when remaining_quantity - p_qty = 0 then 'FILLED'
          else 'PARTIALLY_FILLED'
        end,
        updated_at = now_ts
    where id in (p_incoming.id, p_resting.id);

  update public.market_core_holdings
    set pending_out = pending_out + p_qty
    where participant_id = sell_order.participant_id
      and instrument_id = sell_order.instrument_id;
  update public.market_core_holdings
    set pending_in = pending_in + p_qty
    where participant_id = buy_order.participant_id
      and instrument_id = buy_order.instrument_id;

  unused := (buy_order.price - exec_price) * p_qty;
  if unused > 0 then
    update public.market_core_settlement_accounts
      set reserved = reserved - unused,
          available = available + unused
      where participant_id = buy_order.participant_id
        and asset_id = 'DEMO-KZT';
  end if;

  update public.market_core_counters as c
    set trade_n = c.trade_n + 1,
        settlement_n = c.settlement_n + 1
    where c.market_id = p_incoming.market_id
    returning c.trade_n, c.settlement_n into trade_n, set_n;

  buyer_ok := private.market_core_is_eligible(buy_order.participant_id, buy_order.instrument_id);
  seller_ok := private.market_core_is_eligible(sell_order.participant_id, sell_order.instrument_id);

  insert into public.market_core_trades (
    id, market_id, instrument_id, buy_order_id, sell_order_id,
    buyer_participant_id, seller_participant_id, quantity, price, notional,
    status, kind, eligibility_recheck_passed, created_at, updated_at
  ) values (
    'TRD-' || gen_random_uuid()::text,
    p_incoming.market_id,
    p_incoming.instrument_id,
    buy_order.id,
    sell_order.id,
    buy_order.participant_id,
    sell_order.participant_id,
    p_qty,
    exec_price,
    exec_price * p_qty,
    case when buyer_ok and seller_ok then 'AWAITING_DEVNET_SETTLEMENT' else 'MATCHED' end,
    'SECONDARY',
    buyer_ok and seller_ok,
    now_ts,
    now_ts
  ) returning * into trade_row;

  insert into public.market_core_settlements (
    id, trade_id, status, kind, provider, idempotency_key
  ) values (
    'SET-' || gen_random_uuid()::text,
    trade_row.id,
    'AWAITING_DEVNET_SETTLEMENT',
    'SECONDARY',
    'DEMO',
    'settlement-' || trade_row.id
  );

  insert into public.market_core_idempotency (scope, key, participant_id, result)
  values (
    'match',
    trade_row.id,
    p_incoming.participant_id,
    jsonb_build_object('ok', true, 'tradeId', trade_row.id)
  )
  on conflict (scope, key) do nothing;

  perform private.market_core_emit(
    'MATCHING_ENGINE', p_incoming.participant_id, p_incoming.instrument_id, p_incoming.market_id, p_incoming.id,
    'order_matched', jsonb_build_object('tradeId', trade_row.id, 'quantity', p_qty, 'price', exec_price)
  );
  perform private.market_core_emit(
    'MATCHING_ENGINE', null, p_incoming.instrument_id, p_incoming.market_id, trade_row.id,
    'trade_created', jsonb_build_object('quantity', p_qty, 'price', exec_price, 'notional', trade_row.notional)
  );

  update public.market_core_reservations r
    set status = 'HELD_PENDING_SETTLEMENT'
    where r.order_id in (p_incoming.id, p_resting.id)
      and r.status = 'ACTIVE'
      and (select o.remaining_quantity from public.market_core_orders o where o.id = r.order_id) = 0;

  return trade_row;
end;
$$;

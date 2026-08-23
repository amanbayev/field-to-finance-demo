-- Phase 5B.1: SECURITY DEFINER Market Core RPCs.
-- Transactional matching under pg_advisory_xact_lock.
-- Apply only to project qnzoghmqnqwfpkzgpede.
-- Does not grant table DML to authenticated. Does not execute chain transfers.

create or replace function private.market_core_current_actor()
returns table (
  user_id uuid,
  role_id text,
  participant_id text,
  can_trade boolean,
  can_read_all boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  ctx public.session_contexts%rowtype;
  persona public.demo_personas%rowtype;
  org public.organizations%rowtype;
  mapped_role text;
  mapped_participant text;
begin
  if uid is null then
    return;
  end if;

  select * into ctx from public.session_contexts where principal_user_id = uid;

  if ctx.effective_demo_persona_id is not null then
    select * into persona from public.demo_personas where id = ctx.effective_demo_persona_id;
    select * into org from public.organizations where id = persona.organization_id;
    mapped_role := persona.role_id;
    mapped_participant := coalesce(
      persona.external_investor_ref,
      org.external_investor_ref,
      (select m.participant_id from public.market_core_participant_map m where m.organization_slug = org.slug)
    );
  else
    if ctx.active_organization_id is not null then
      select * into org from public.organizations where id = ctx.active_organization_id;
    end if;
    if org.id is null then
      select o.* into org
      from public.memberships mem
      join public.organizations o on o.id = mem.organization_id
      where mem.user_id = uid and mem.status = 'ACTIVE'
      order by mem.created_at
      limit 1;
    end if;
    select mr.role_id into mapped_role
    from public.memberships mem
    join public.membership_roles mr on mr.membership_id = mem.id
    where mem.user_id = uid
      and mem.organization_id = org.id
      and mem.status = 'ACTIVE'
      and mr.revoked_at is null
    order by mr.assigned_at
    limit 1;
    mapped_participant := coalesce(
      org.external_investor_ref,
      (select m.participant_id from public.market_core_participant_map m where m.organization_slug = org.slug)
    );
  end if;

  user_id := uid;
  role_id := coalesce(mapped_role, '');
  participant_id := mapped_participant;
  can_trade := role_id in ('INVESTOR', 'TRADER') and participant_id is not null;
  can_read_all := role_id in ('SYSTEM_ADMIN', 'REGULATOR', 'REGISTRAR_OPERATOR');
  return next;
end;
$$;

revoke all on function private.market_core_current_actor() from public, anon, authenticated;

create or replace function private.market_core_is_eligible(p_participant text, p_instrument text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.market_core_eligibility e
    where e.participant_id = p_participant
      and e.instrument_id = p_instrument
      and e.state = 'ELIGIBLE'
  )
  and p_instrument <> 'F2F-PROTOCOL-INVESTMENT';
$$;

revoke all on function private.market_core_is_eligible(text, text) from public, anon, authenticated;

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
    'EVT-' || lpad(n::text, 6, '0'),
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

revoke all on function private.market_core_emit(text, text, text, text, text, text, jsonb) from public, anon, authenticated;

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

  update public.market_core_counters
    set trade_n = trade_n + 1,
        settlement_n = settlement_n + 1
    where market_id = p_incoming.market_id
    returning trade_n, settlement_n into trade_n, set_n;

  buyer_ok := private.market_core_is_eligible(buy_order.participant_id, buy_order.instrument_id);
  seller_ok := private.market_core_is_eligible(sell_order.participant_id, sell_order.instrument_id);

  insert into public.market_core_trades (
    id, market_id, instrument_id, buy_order_id, sell_order_id,
    buyer_participant_id, seller_participant_id, quantity, price, notional,
    status, kind, eligibility_recheck_passed, created_at, updated_at
  ) values (
    'TRD-' || lpad(trade_n::text, 4, '0'),
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
    'SET-' || lpad(set_n::text, 4, '0'),
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

revoke all on function private.market_core_apply_fill(public.market_core_orders, public.market_core_orders, bigint)
  from public, anon, authenticated;

create or replace function private.market_core_match_incoming(p_order_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  incoming public.market_core_orders;
  resting public.market_core_orders;
  qty bigint;
begin
  loop
    select * into incoming from public.market_core_orders where id = p_order_id for update;
    exit when incoming.remaining_quantity <= 0 or incoming.status not in ('OPEN', 'PARTIALLY_FILLED');
    if incoming.side = 'BUY' then
      select * into resting
      from public.market_core_orders
      where market_id = incoming.market_id
        and id <> incoming.id
        and participant_id <> incoming.participant_id
        and side = 'SELL'
        and status in ('OPEN', 'PARTIALLY_FILLED')
        and remaining_quantity > 0
        and price <= incoming.price
      order by price asc, sequence asc
      limit 1
      for update;
    else
      select * into resting
      from public.market_core_orders
      where market_id = incoming.market_id
        and id <> incoming.id
        and participant_id <> incoming.participant_id
        and side = 'BUY'
        and status in ('OPEN', 'PARTIALLY_FILLED')
        and remaining_quantity > 0
        and price >= incoming.price
      order by price desc, sequence asc
      limit 1
      for update;
    end if;
    exit when resting.id is null;
    qty := least(incoming.remaining_quantity, resting.remaining_quantity);
    perform private.market_core_apply_fill(incoming, resting, qty);
    resting := null;
  end loop;
end;
$$;

revoke all on function private.market_core_match_incoming(text) from public, anon, authenticated;

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

  select result into prior
  from public.market_core_idempotency
  where scope = 'submit' and key = p_idempotency_key;
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
  order_id := 'ORD-' || lpad(n::text, 4, '0');

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
    'RES-' || lpad(res_n::text, 4, '0'),
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

create or replace function public.market_core_cancel_order(
  p_order_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor record;
  order_row public.market_core_orders;
  prior jsonb;
  release_qty bigint;
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
    return jsonb_build_object('ok', false, 'error', 'NOT_OWNER');
  end if;

  select result into prior from public.market_core_idempotency where scope = 'cancel' and key = p_idempotency_key;
  if prior is not null then
    return prior;
  end if;

  select * into order_row from public.market_core_orders where id = p_order_id;
  if order_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtext(order_row.market_id));
  select * into order_row from public.market_core_orders where id = p_order_id for update;

  if order_row.participant_id <> actor.participant_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_OWNER');
  end if;
  if order_row.status in ('FILLED', 'CANCELLED', 'REJECTED') or order_row.remaining_quantity <= 0 then
    return jsonb_build_object('ok', false, 'error', 'ORDER_NOT_CANCELABLE');
  end if;

  release_qty := order_row.remaining_quantity;
  if order_row.side = 'SELL' then
    update public.market_core_holdings
      set reserved_for_orders = reserved_for_orders - release_qty
      where participant_id = order_row.participant_id and instrument_id = order_row.instrument_id;
  else
    update public.market_core_settlement_accounts
      set reserved = reserved - (order_row.price * release_qty),
          available = available + (order_row.price * release_qty)
      where participant_id = order_row.participant_id and asset_id = 'DEMO-KZT';
  end if;

  update public.market_core_orders
    set remaining_quantity = 0,
        status = case when filled_quantity > 0 then 'FILLED' else 'CANCELLED' end,
        updated_at = clock_timestamp()
    where id = p_order_id;

  update public.market_core_reservations
    set status = case when order_row.filled_quantity > 0 then 'HELD_PENDING_SETTLEMENT' else 'RELEASED' end
    where order_id = p_order_id and status = 'ACTIVE';

  perform private.market_core_emit(
    actor.role_id, actor.participant_id, order_row.instrument_id, order_row.market_id, p_order_id,
    'order_cancelled', jsonb_build_object('released', release_qty)
  );

  result := jsonb_build_object('ok', true, 'error', null, 'orderId', p_order_id);
  insert into public.market_core_idempotency (scope, key, participant_id, result)
  values ('cancel', p_idempotency_key, actor.participant_id, result)
  on conflict (scope, key) do nothing;
  return result;
end;
$$;

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

create or replace function public.market_core_settlement_intent(p_settlement_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor record;
  rec public.market_core_settlements;
  market public.market_core_markets;
  known text;
begin
  select * into actor from private.market_core_current_actor();
  if actor.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  if not actor.can_read_all then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  select * into rec from public.market_core_settlements where id = p_settlement_id;
  if rec.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  select m.* into market
  from public.market_core_markets m
  join public.market_core_trades t on t.market_id = m.id
  where t.id = rec.trade_id;
  known := coalesce(rec.atomic_dvp_tx_signature, rec.asset_tx_signature, rec.payment_tx_signature);
  if rec.status in ('CHAIN_CONFIRMED', 'REGISTRY_FINALIZING', 'SETTLED') then
    return jsonb_build_object(
      'ok', true, 'allowNewChainSubmit', false, 'action', 'REGISTRY_FINALIZE',
      'reason', 'Chain is confirmed. Do not send another transfer. Finalize registrar from confirmed evidence.',
      'signature', known
    );
  end if;
  if known is not null or rec.status in ('SETTLEMENT_SUBMITTING', 'SETTLEMENT_SUBMITTED') then
    return jsonb_build_object(
      'ok', true, 'allowNewChainSubmit', false, 'action', 'SIGNATURE_LOOKUP',
      'reason', 'A submit may have landed. Look up the known signature or idempotency key. Do not resubmit.',
      'signature', known, 'idempotencyKey', rec.idempotency_key
    );
  end if;
  if market.id is null or not market.settlement_enabled then
    return jsonb_build_object(
      'ok', true, 'allowNewChainSubmit', false, 'action', 'NONE',
      'reason', 'Matching demonstrator is active. Devnet settlement is awaiting approval.'
    );
  end if;
  return jsonb_build_object(
    'ok', true,
    'allowNewChainSubmit', rec.status in ('SETTLEMENT_READY', 'AWAITING_DEVNET_SETTLEMENT'),
    'action', 'CHAIN_TRANSFER',
    'reason', 'No prior signature. First submit only when settlement is enabled.'
  );
end;
$$;

create or replace function public.market_core_prepare_settlement_submit(
  p_settlement_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor record;
  rec public.market_core_settlements;
  prior jsonb;
  result jsonb;
begin
  select * into actor from private.market_core_current_actor();
  if actor.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  if not actor.can_read_all then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if coalesce(p_idempotency_key, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'IDEMPOTENCY_REQUIRED');
  end if;
  select result into prior from public.market_core_idempotency where scope = 'settlement_submit' and key = p_idempotency_key;
  if prior is not null then
    return prior;
  end if;
  select * into rec from public.market_core_settlements where id = p_settlement_id for update;
  if rec.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if rec.asset_tx_signature is not null or rec.payment_tx_signature is not null or rec.atomic_dvp_tx_signature is not null then
    result := jsonb_build_object('ok', true, 'error', null, 'allowNewChainSubmit', false, 'action', 'SIGNATURE_LOOKUP');
  else
    result := jsonb_build_object('ok', false, 'error', 'SETTLEMENT_DISABLED', 'allowNewChainSubmit', false, 'action', 'NONE');
  end if;
  insert into public.market_core_idempotency (scope, key, participant_id, result)
  values ('settlement_submit', p_idempotency_key, actor.participant_id, result)
  on conflict (scope, key) do nothing;
  return result;
end;
$$;

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
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'participantId', h.participant_id,
        'holderName', h.holder_name,
        'registeredOwned', h.owned,
        'chainBalance', coalesce(p.on_chain_balance, h.owned),
        'pendingIn', h.pending_in,
        'pendingOut', h.pending_out,
        'exception', coalesce(p.on_chain_balance, h.owned) <> h.owned
      ) order by h.participant_id), '[]'::jsonb)
      from public.market_core_holdings h
      left join public.market_core_chain_proof p
        on p.participant_id = h.participant_id and p.instrument_id = h.instrument_id
      where h.instrument_id = 'WHEAT-2027'
    )
  );
end;
$$;

revoke all on function public.market_core_submit_limit_order(text, text, bigint, bigint, text) from public, anon;
revoke all on function public.market_core_cancel_order(text, text) from public, anon;
revoke all on function public.market_core_snapshot() from public, anon;
revoke all on function public.market_core_settlement_intent(text) from public, anon;
revoke all on function public.market_core_prepare_settlement_submit(text, text) from public, anon;
revoke all on function public.market_core_reconcile_wheat() from public, anon;

grant execute on function public.market_core_submit_limit_order(text, text, bigint, bigint, text) to authenticated;
grant execute on function public.market_core_cancel_order(text, text) to authenticated;
grant execute on function public.market_core_snapshot() to authenticated;
grant execute on function public.market_core_settlement_intent(text) to authenticated;
grant execute on function public.market_core_prepare_settlement_submit(text, text) to authenticated;
grant execute on function public.market_core_reconcile_wheat() to authenticated;

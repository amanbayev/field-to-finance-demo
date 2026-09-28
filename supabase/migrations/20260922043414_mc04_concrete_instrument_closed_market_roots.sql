-- MC-04: permanent concrete identities, deliberately unavailable to trading.
-- No business backfill, version import, runtime provisioning or root receipts.
begin;

create table public.market_core_instruments (
  id text primary key default ('INS-' || gen_random_uuid()::text),
  issuer_organization_id uuid not null references public.organizations(id)
    on update restrict on delete restrict,
  protocol_version_id text not null references public.protocol_version_records(id)
    on update restrict on delete restrict,
  run_id uuid references public.demo_reset_run_instances(id)
    on update restrict on delete restrict,
  symbol text not null check (btrim(symbol) <> ''),
  name text not null check (btrim(name) <> ''),
  instrument_type text not null check (instrument_type in ('ASSET_TOKEN', 'PROTOCOL_INVESTMENT')),
  status text not null default 'STRUCTURING' check (status = 'STRUCTURING'),
  created_at timestamptz not null default now() check (isfinite(created_at)),
  created_by text not null default current_user check (btrim(created_by) <> ''),
  constraint market_core_instruments_id_format check
    (id ~ '^INS-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
comment on table public.market_core_instruments is
  'Permanent concrete identity, not issuance or admission. Exact MC-03 version must already exist. Symbol/name are metadata, never identity or retry keys. NULL run is explicit NON_RUN. No legal dates, supply, mint or balances.';

create function private.mc04_instrument_seal()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Lock before INSERT FK checks acquire KEY SHARE. Two concurrent creators
  -- must not both hold KEY SHARE and then try to upgrade to FOR UPDATE.
  perform private.market_core_seal_organization(new.issuer_organization_id);
  return new;
end;
$$;
create trigger mc04_instrument_seal before insert on public.market_core_instruments
  for each row execute function private.mc04_instrument_seal();

create function private.mc04_instrument_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.issuer_organization_id is distinct from old.issuer_organization_id
      or new.protocol_version_id is distinct from old.protocol_version_id
      or new.run_id is distinct from old.run_id
      or new.instrument_type is distinct from old.instrument_type
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by then
      raise exception 'mc04_instrument_identity_immutable';
    end if;
  end if;
  -- Inspect FINAL values after every BEFORE trigger. A seal is monotonic.
  -- Never acquire a second issuer lock here after a trigger redirection.
  -- The callable primitive additionally requires the exact requested issuer.
  if not exists (select 1 from public.organizations o
    where o.id = new.issuer_organization_id and o.market_identity_sealed
      and o.run_id is not distinct from new.run_id) then
    raise exception 'mc04_instrument_issuer_context_mismatch';
  end if;
  return new;
end;
$$;
create trigger mc04_instrument_guard after insert or update on public.market_core_instruments
  for each row execute function private.mc04_instrument_guard();

create function private.mc04_instrument_preserve()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'mc04_instrument_identity_preserved';
end;
$$;
create trigger mc04_instrument_preserve before delete or truncate on public.market_core_instruments
  for each statement execute function private.mc04_instrument_preserve();

alter table public.market_core_instruments enable row level security;
revoke all on table public.market_core_instruments from public, anon, authenticated, service_role;

alter table public.market_core_markets
  add column instrument_ref text references public.market_core_instruments(id)
    on update restrict on delete restrict,
  add column book_key text,
  add constraint mc04_market_bridge check (
    (instrument_ref is null and book_key is null) or
    (instrument_ref is not null and instrument_id = instrument_ref
      and book_key is not null and btrim(book_key) <> '')
  ),
  add constraint mc04_market_closed check (instrument_ref is null or
    (phase = 'CLOSED' and not transacting and not matching_enabled
      and not settlement_enabled and demonstrator_status = 'DEMO_CLOSED'));
create unique index mc04_market_book_unique
  on public.market_core_markets(instrument_ref, settlement_asset_id, book_key)
  where instrument_ref is not null;
comment on column public.market_core_markets.instrument_ref is
  'MC-04 exact instrument root; run derives only through instrument. Historical NULL is permanent, not adoptable. New INSERT requires a reference.';
comment on column public.market_core_markets.book_key is
  'Immutable explicit book identity within an instrument and settlement/quote asset. Multiple books per instrument are permitted. Legacy NULL stays NULL.';

create function private.mc04_market_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  counter public.market_core_counters%rowtype;
begin
  if tg_op = 'INSERT' and new.instrument_ref is null then
    raise exception 'mc04_new_market_requires_instrument';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.instrument_ref is distinct from old.instrument_ref
    or new.instrument_id is distinct from old.instrument_id
    or new.book_key is distinct from old.book_key
    or new.settlement_asset_id is distinct from old.settlement_asset_id
    or new.settlement_asset_label is distinct from old.settlement_asset_label
    or new.settlement_has_monetary_value is distinct from old.settlement_has_monetary_value
    or new.market_type is distinct from old.market_type
    or new.allowed_order_types is distinct from old.allowed_order_types
    or new.whole_quantity_only is distinct from old.whole_quantity_only
    or new.created_at is distinct from old.created_at
  ) then raise exception 'mc04_market_configuration_immutable'; end if;

  if new.instrument_ref is not null then
    -- Existing service-role table grants stay intact for legacy operations.
    -- They must not confer root creation/update authority, even with BYPASSRLS.
    if current_user <> pg_catalog.pg_get_userbyid(
      (select c.relowner from pg_catalog.pg_class c where c.oid = tg_relid)) then
      raise exception 'mc04_market_internal_only' using errcode = '42501';
    end if;
    -- Validate FINAL rows for primitive, owner and definer writes, including
    -- BEFORE-trigger replacements. Reuse MC-03's exact 25-character trim
    -- contract without changing any stored identity or the helper's ACL.
    -- The current order-type contract is exactly one 1-based LIMIT element.
    -- Array equality includes dimensions/bounds; IS DISTINCT FROM also rejects
    -- NULL arrays/elements deterministically (CHECK/IF must not accept UNKNOWN).
    if (new.id ~ '^MKT-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') is not true
      or not private.protocol_version_text_valid(new.instrument_ref)
      or not private.protocol_version_text_valid(new.instrument_id)
      or not private.protocol_version_text_valid(new.book_key)
      or not private.protocol_version_text_valid(new.settlement_asset_id)
      or not private.protocol_version_text_valid(new.settlement_asset_label)
      or new.market_type is distinct from 'REGULATED_INSTITUTIONAL_DEMONSTRATOR'
      or new.allowed_order_types is distinct from array['LIMIT']::text[] then
      raise exception 'mc04_market_invalid_configuration';
    end if;
    if tg_op = 'INSERT' then
      insert into public.market_core_counters(market_id) values(new.id) returning * into counter;
      if not found or counter.market_id is distinct from new.id
        or row(counter.order_seq,counter.order_n,counter.trade_n,counter.reservation_n,counter.settlement_n,counter.event_n)
          is distinct from row(0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint) then
        raise exception 'mc04_market_counter_creation_failed';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger mc04_market_guard after insert or update on public.market_core_markets
  for each row execute function private.mc04_market_guard();

create function private.mc04_market_preserve()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    -- TRUNCATE is not MVCC-safe: a stale snapshot cannot prove no roots exist.
    raise exception 'mc04_market_identity_preserved';
  elsif old.instrument_ref is not null then
    raise exception 'mc04_market_identity_preserved';
  end if;
  return old;
end;
$$;
create trigger mc04_market_preserve after delete on public.market_core_markets
  for each row execute function private.mc04_market_preserve();
create trigger mc04_market_no_truncate before truncate on public.market_core_markets
  for each statement execute function private.mc04_market_preserve();

create function private.mc04_counter_preserve()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'mc04_market_counter_preserved';
  elsif (tg_op = 'DELETE' or new.market_id is distinct from old.market_id) and exists (
    select 1 from public.market_core_markets m where m.id = old.market_id and m.instrument_ref is not null
  ) then
    raise exception 'mc04_market_counter_preserved';
  end if;
  return null;
end;
$$;
create trigger mc04_counter_preserve after update or delete on public.market_core_counters
  for each row execute function private.mc04_counter_preserve();
create trigger mc04_counter_no_truncate before truncate on public.market_core_counters
  for each statement execute function private.mc04_counter_preserve();

-- A narrow veto at the write boundary also covers direct owner/definer DML,
-- arbitrary-market submit, and private matching/apply_fill with synthetic rows.
-- Definer is needed only to READ roots hidden from runtime roles; it grants no
-- write capability. Existing matching and Registrar functions are untouched.
create function private.mc04_legacy_execution_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.market_core_markets m
    where m.id = new.market_id and m.instrument_ref is not null)
    or exists (select 1 from public.market_core_instruments i where i.id = new.instrument_id) then
    raise exception 'mc04_execution_not_available';
  end if;
  return new;
end;
$$;
create trigger mc04_orders_legacy_only after insert or update on public.market_core_orders
  for each row execute function private.mc04_legacy_execution_only();
create trigger mc04_trades_legacy_only after insert or update on public.market_core_trades
  for each row execute function private.mc04_legacy_execution_only();

create function private.mc04_create_instrument(
  p_issuer_organization_id uuid, p_protocol_version_id text, p_run_id uuid,
  p_symbol text, p_name text, p_instrument_type text
)
returns public.market_core_instruments
language plpgsql volatile security invoker set search_path = '' as $$
declare
  expected_id text := 'INS-' || gen_random_uuid()::text;
  expected_at timestamptz := now();
  instrument public.market_core_instruments%rowtype;
begin
  -- No catalog/current/latest lookup or import. The FK must succeed as supplied.
  insert into public.market_core_instruments(id,issuer_organization_id,protocol_version_id,run_id,
    symbol,name,instrument_type,created_at,created_by)
  values(expected_id,p_issuer_organization_id,p_protocol_version_id,p_run_id,
    p_symbol,p_name,p_instrument_type,expected_at,current_user) returning * into instrument;
  if not found or row(instrument.id,instrument.issuer_organization_id,instrument.protocol_version_id,
    instrument.run_id,instrument.symbol,instrument.name,instrument.instrument_type,instrument.status,
    instrument.created_at,instrument.created_by)
    is distinct from row(expected_id,p_issuer_organization_id,p_protocol_version_id,p_run_id,
      p_symbol,p_name,p_instrument_type,'STRUCTURING'::text,expected_at,current_user::text) then
    raise exception 'mc04_instrument_insert_mismatch';
  end if;
  return instrument;
end;
$$;

create function private.mc04_create_closed_market(
  p_instrument_ref text, p_settlement_asset_id text, p_settlement_asset_label text, p_book_key text
)
returns public.market_core_markets
language plpgsql volatile security invoker set search_path = '' as $$
declare
  expected_id text := 'MKT-' || gen_random_uuid()::text;
  expected_at timestamptz := now();
  market public.market_core_markets%rowtype;
begin
  -- Plain INSERT: competing equal configurations have one winner and a 23505
  -- loser (or a propagated isolation failure). No update/adoption/idempotency.
  insert into public.market_core_markets(id,instrument_id,instrument_ref,book_key,
    settlement_asset_id,settlement_asset_label,phase,transacting,matching_enabled,
    settlement_enabled,demonstrator_status,settlement_has_monetary_value,
    market_type,allowed_order_types,whole_quantity_only,created_at)
  values(expected_id,p_instrument_ref,p_instrument_ref,p_book_key,
    p_settlement_asset_id,p_settlement_asset_label,'CLOSED',false,false,false,'DEMO_CLOSED',false,
    'REGULATED_INSTITUTIONAL_DEMONSTRATOR',array['LIMIT']::text[],true,expected_at)
  returning * into market;
  if not found or row(market.id,market.instrument_id,market.instrument_ref,market.book_key,
    market.settlement_asset_id,market.settlement_asset_label,market.phase,market.transacting,
    market.matching_enabled,market.settlement_enabled,market.demonstrator_status,
    market.settlement_has_monetary_value,market.market_type,market.allowed_order_types,
    market.whole_quantity_only,market.created_at)
    is distinct from row(expected_id,p_instrument_ref,p_instrument_ref,p_book_key,
      p_settlement_asset_id,p_settlement_asset_label,'CLOSED'::text,false,false,false,'DEMO_CLOSED'::text,
      false,'REGULATED_INSTITUTIONAL_DEMONSTRATOR'::text,array['LIMIT']::text[],true,expected_at) then
    raise exception 'mc04_market_insert_mismatch';
  end if;
  return market;
end;
$$;

create function private.mc04_create_instrument_and_market(
  p_issuer_organization_id uuid, p_protocol_version_id text, p_run_id uuid,
  p_symbol text, p_name text, p_instrument_type text,
  p_settlement_asset_id text, p_settlement_asset_label text, p_book_key text
)
returns public.market_core_markets
language plpgsql volatile security invoker set search_path = '' as $$
declare
  instrument public.market_core_instruments%rowtype;
begin
  select * into instrument from private.mc04_create_instrument(p_issuer_organization_id,
    p_protocol_version_id,p_run_id,p_symbol,p_name,p_instrument_type);
  return private.mc04_create_closed_market(instrument.id,p_settlement_asset_id,p_settlement_asset_label,p_book_key);
end;
$$;
comment on function private.mc04_create_instrument_and_market(uuid,text,uuid,text,text,text,text,text,text) is
  'Internal owner/definer primitive. All roots, counter and organization seal commit or roll back together. No client exactly-once promise; MC-05 owns the future command/receipt contract.';

revoke all on function private.mc04_instrument_seal(), private.mc04_instrument_guard(), private.mc04_instrument_preserve(),
  private.mc04_market_guard(), private.mc04_market_preserve(), private.mc04_counter_preserve(),
  private.mc04_legacy_execution_only(),
  private.mc04_create_instrument(uuid,text,uuid,text,text,text),
  private.mc04_create_closed_market(text,text,text,text),
  private.mc04_create_instrument_and_market(uuid,text,uuid,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;

-- Preserve the legacy submit body and ACL; only the pre-cache veto is new.
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

  -- MC-04: establish a legacy target before replaying the legacy receipt cache.
  if not exists (select 1 from public.market_core_markets m
    where m.id = p_market_id and m.instrument_ref is null) then
    return jsonb_build_object('ok', false, 'error', 'MARKET_CLOSED');
  end if;

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

commit;

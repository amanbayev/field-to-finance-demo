-- Phase 5B.2A preparation only.
-- Cleans leftover isolated fixture. Does not settle TRD-SEED-001.
-- Does not change WHEAT-2027 registered ownership (990 / 10 / 0).
-- Does not enable settlement. Does not execute Devnet transfers.

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
delete from public.market_core_settlement_accounts
  where participant_id in ('TEST-SELLER-A', 'TEST-BUYER-A', 'TEST-BUYER-B');
delete from public.market_core_holdings where instrument_id = 'TEST-ISO-5B1';
delete from public.market_core_eligibility where instrument_id = 'TEST-ISO-5B1';
delete from public.market_core_counters where market_id = 'MKT-TEST-ISO-5B1';
delete from public.market_core_markets where id = 'MKT-TEST-ISO-5B1';

drop function if exists public.market_core_test_setup_isolated();
drop function if exists public.market_core_test_try_isolated_sell(bigint, text);
drop function if exists public.market_core_test_try_isolated_buy(text, bigint, text);
drop function if exists public.market_core_test_isolated_summary();
drop function if exists public.market_core_test_cleanup_isolated();

update public.market_core_settlement_identities
set
  solana_wallet = 'AJ7wcKJq368STkEWFDESGJKBSGvFbHDv749g9iAHZt63',
  wheat_ata = 'D7dNbub9wmETEkDoS7b73KpVxTwRb26Cbe9ffRptVUDw',
  demo_kzt_ata = 'Fj15r1zWB4ncdtRwYFJcyZMGWgXp633sEqcFdD8Nnxmp',
  wheat_ata_on_chain = true,
  demo_kzt_ata_on_chain = true,
  notes = 'Mapped from PL-ISS001-0001. Read-only Devnet check: WHEAT and DEMO-KZT ATAs exist.'
where participant_id = 'INVESTOR-0001';

update public.market_core_settlement_identities
set
  solana_wallet = '71G4GdJVawxt5DCVxcghW96TaLDxDqNEA1mLybAuTU9Q',
  wheat_ata = 'HQ1eM9ekdQkj3buuDgSdWsQ5DGnQnZc81sPCPC6j8unx',
  demo_kzt_ata = 'ARouqPTtPwsVfXAV1yYuZidz2vApM1qKH62xC6i5YrcM',
  wheat_ata_on_chain = false,
  demo_kzt_ata_on_chain = false,
  notes = 'Off-chain Grain Desk wallet designated. Derived Token-2022 ATAs do not exist on Devnet. Do not create them in this phase.'
where participant_id = 'GRAIN-DESK';

create or replace function public.market_core_prepare_secondary_registrar_finalize(
  p_trade_id text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_trade_id is distinct from 'TRD-SEED-001' then
    raise exception 'UNEXPECTED_TRADE';
  end if;
  if p_signature is null or length(p_signature) = 0 then
    raise exception 'MISSING_CHAIN_EVIDENCE';
  end if;
  -- Intentionally not executed in 5B.2A.
  -- Planned book: Steppe 10 -> 8, Grain Desk 0 -> 2, Registrar 990 unchanged.
  raise exception 'NOT_ARMED_PHASE_5B_2A';
end;
$$;

revoke all on function public.market_core_prepare_secondary_registrar_finalize(text, text)
  from public, anon, authenticated;
grant execute on function public.market_core_prepare_secondary_registrar_finalize(text, text)
  to service_role;

comment on function public.market_core_prepare_secondary_registrar_finalize(text, text) is
  'Prepared secondary registrar finalization. Raises NOT_ARMED_PHASE_5B_2A. Do not call until the execution phase.';

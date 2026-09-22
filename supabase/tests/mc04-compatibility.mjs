// Exact allowed change to the historical submit function, shared by native suites.
// Removing this block must recover its entire pre-MC-04 pg_get_functiondef.
import assert from 'node:assert/strict';
export const mc04SubmitGuard = `  -- MC-04: establish a legacy target before replaying the legacy receipt cache.
  if not exists (select 1 from public.market_core_markets m
    where m.id = p_market_id and m.instrument_ref is null) then
    return jsonb_build_object('ok', false, 'error', 'MARKET_CLOSED');
  end if;

`;
export function assertFunctionsPreserved(current, previous, mc04 = false) {
  for (const f of previous) {
    const actual = current.find(g=>g.oid===f.oid);
    if (mc04 && f.definition.startsWith('CREATE OR REPLACE FUNCTION public.market_core_submit_limit_order(')) {
      assert.equal(actual.definition.split(mc04SubmitGuard).length,2);
      assert.deepEqual({...actual,definition:actual.definition.replace(mc04SubmitGuard,'')},f);
    } else assert.deepEqual(actual,f);
  }
}

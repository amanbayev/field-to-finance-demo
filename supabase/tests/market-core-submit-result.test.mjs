// Actual PostgreSQL semantics, disposable Unix-socket cluster only.
// Run with GP01_EMBEDDED_POSTGRES_MODULE=/absolute/embedded-postgres/dist/index.js
// node --test supabase/tests/market-core-submit-result.test.mjs
// No database URL, shared credentials, remote Auth/Storage, or Devnet access.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';

if (!process.env.GP01_EMBEDDED_POSTGRES_MODULE?.startsWith('/')) {
  throw new Error('Set GP01_EMBEDDED_POSTGRES_MODULE to an absolute embedded-postgres dist/index.js path.');
}
const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.GP01_EMBEDDED_POSTGRES_MODULE).href);
const directory = await mkdtemp('/private/tmp/mc00-postgres-');
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), user: 'postgres', password: randomUUID(),
  port: 5432, persistent: true, createPostgresUser: false, postgresFlags: ['-h', '', '-k', directory],
  onLog() {}, onError(message) { console.error(message); },
});
const migrationDirectory = new URL('../migrations/', import.meta.url);
const migration = '20260908105740_mc00_market_core_submit_result_ambiguity.sql';
const signatures = [
  'public.market_core_submit_limit_order(text,text,bigint,bigint,text)',
  'public.market_core_cancel_order(text,text)',
  'public.market_core_prepare_settlement_submit(text,text)',
];
const marketId = 'MKT-WHEAT-2027-DEMO-KZT';
const sellerId = randomUUID();
const buyerId = randomUUID();
const adminId = randomUUID();
const submitKey = 'mc00-synthetic-sell';
const clients = [];
let started = false;
let db;
let seller;
let buyer;
let admin;
let submitted;
let matchedSettlement;
let baselineFunctions;
let stopped = false;

async function connection(userId) {
  const client = pg.getPgClient('postgres', directory);
  await client.connect();
  clients.push(client);
  await client.query("set statement_timeout='15s'");
  if (userId) {
    await client.query('set role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  }
  return client;
}
async function actor(userId, participantId, role, type) {
  // Synthetic local fixture setup only. Existing migration seeds supply holdings and eligibility.
  await db.query('insert into auth.users(id) values($1)', [userId]);
  const org = (await db.query(`insert into public.organizations(slug,name,type,external_investor_ref)
    values($1,'MC00 synthetic organization',$2,$3) returning id`, [`mc00-${role.toLowerCase()}`, type, participantId])).rows[0].id;
  const membership = (await db.query('insert into public.memberships(user_id,organization_id) values($1,$2) returning id', [userId, org])).rows[0].id;
  await db.query('insert into public.membership_roles(membership_id,role_id) values($1,$2)', [membership, role]);
  await db.query('insert into public.session_contexts(principal_user_id,active_organization_id) values($1,$2)', [userId, org]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  const resolved = (await db.query('select * from private.market_core_current_actor()')).rows[0];
  assert.equal(resolved.participant_id, participantId);
  assert.equal(resolved.role_id, role);
  assert.equal(resolved.can_trade, role !== 'SYSTEM_ADMIN');
  assert.equal(resolved.can_read_all, role === 'SYSTEM_ADMIN');
  if (participantId) assert.equal((await db.query("select private.market_core_is_eligible($1,'WHEAT-2027') as eligible", [participantId])).rows[0].eligible, true);
  return connection(userId);
}
async function snapshot() {
  const tables = (await db.query(`select tablename from pg_tables where schemaname='public'
    and (starts_with(tablename,'market_core_') or tablename='registrar_registered_ownership') order by tablename`)).rows;
  const result = {};
  for (const { tablename } of tables) {
    result[tablename] = (await db.query(`select to_jsonb(t) as row from public.${tablename} t order by to_jsonb(t)::text`)).rows.map(r => r.row);
  }
  return result;
}
async function definitions() {
  return (await db.query(`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosrc,p.prolang,p.prosecdef,p.provolatile,p.proconfig,p.proacl,p.proowner,p.prorettype,p.proargtypes::text
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and starts_with(p.proname,'market_core_')
    order by n.nspname,p.proname`)).rows;
}
async function submit(client, side, price, quantity, key) {
  return (await client.query('select public.market_core_submit_limit_order($1,$2,$3,$4,$5) as result',
    [marketId, side, price, quantity, key])).rows[0].result;
}
async function cancel(client, orderId, key) {
  return (await client.query('select public.market_core_cancel_order($1,$2) as result', [orderId, key])).rows[0].result;
}
async function prepare(client, settlementId, key) {
  return (await client.query('select public.market_core_prepare_settlement_submit($1,$2) as result', [settlementId, key])).rows[0].result;
}
function holding(state, participantId) {
  return state.market_core_holdings.find(h => h.participant_id === participantId && h.instrument_id === 'WHEAT-2027');
}
function cash(state, participantId) {
  return state.market_core_settlement_accounts.find(a => a.participant_id === participantId && a.asset_id === 'DEMO-KZT');
}
function receipt(state, scope, key) {
  return state.market_core_idempotency.find(r => r.scope === scope && r.key === key).result;
}
function onlyBody(sql, name) {
  const start = sql.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0);
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}
function diagnostic(error) {
  return Object.fromEntries(['code', 'message', 'detail', 'where', 'internalQuery', 'constraint'].map(key => [key, error[key] ?? null]));
}
// Stop subsequent scenarios at the first unexpected failure for inspection.
function scenario(name, fn) {
  test(name, async t => {
    if (stopped) { t.skip('Stopped after an earlier baseline failure'); return; }
    try { await fn(t); } catch (error) { stopped = true; t.diagnostic(JSON.stringify(diagnostic(error))); throw error; }
  });
}

before(async () => {
  await pg.initialise();
  await pg.start();
  started = true;
  db = await connection();
  const settings = (await db.query(`select current_setting('server_version') as version,
    current_setting('listen_addresses') as listen, current_setting('unix_socket_directories') as socket`)).rows[0];
  assert.match(settings.version, /^18\./);
  assert.equal(settings.listen, '');
  assert.equal(settings.socket, directory);
  console.log('Disposable PostgreSQL:', JSON.stringify(settings));
  await db.query(`create role anon; create role authenticated; create role service_role inherit nosuperuser bypassrls;
    alter default privileges for role postgres in schema public grant all on tables to service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text);`);
  // This historical regression suite proves the exact MC-00 baseline. Later
  // allocator migrations have their own suite and must not change these IDs.
  const files = (await readdir(migrationDirectory)).filter(f => f.endsWith('.sql') && f <= migration).sort();
  assert.equal(files.at(-1), migration, 'Review migration ordering before extending this baseline suite');
  for (const file of files.filter(f => f !== migration)) {
    await db.query(await readFile(new URL(file, migrationDirectory), 'utf8'));
  }
  console.log('Unchanged migrations loaded:', files.length - 1);
  assert.equal((await db.query("select current_setting('plpgsql.variable_conflict') as setting")).rows[0].setting, 'error');
  baselineFunctions = await definitions();
  seller = await actor(sellerId, 'INVESTOR-0001', 'INVESTOR', 'INVESTMENT_FUND');
  buyer = await actor(buyerId, 'GRAIN-DESK', 'TRADER', 'TRADING_FIRM');
  admin = await actor(adminId, null, 'SYSTEM_ADMIN', 'PLATFORM');
}, { timeout: 60000 });

after(async () => {
  try { await Promise.all(clients.map(client => client.end())); }
  finally {
    if (started) await pg.stop();
    await rm(directory, { recursive: true, force: true });
    console.log('Disposable server stopped; cluster removed:', directory);
  }
});

scenario('canonical submit reproduces result ambiguity with SQLSTATE 42702 and no effect', async t => {
  const before = await snapshot();
  await assert.rejects(() => submit(seller, 'SELL', 105000, 1, submitKey), error => {
    t.diagnostic(JSON.stringify(diagnostic(error)));
    return error.code === '42702' && error.message === 'column reference "result" is ambiguous'
      && error.where.includes('market_core_submit_limit_order');
  });
  assert.deepEqual(await snapshot(), before);
});

scenario('canonical cancel and settlement preparation reproduce result ambiguity with no effect', async () => {
  for (const [fn, call] of [
    ['market_core_cancel_order', () => cancel(seller, 'ORD-SEED-SELL-001', 'mc00-prepatch-cancel')],
    ['market_core_prepare_settlement_submit', () => prepare(admin, 'SET-SEED-001', 'mc00-prepatch-prepare')],
  ]) {
    const before = await snapshot();
    await assert.rejects(call, error => error.code === '42702'
      && error.message === 'column reference "result" is ambiguous' && error.where.includes(fn));
    assert.deepEqual(await snapshot(), before);
  }
});

scenario('canonical fill ambiguity rolls back crossing effects after the isolated submit repair', async t => {
  const before = await snapshot();
  await db.query('begin');
  try {
    // This transaction reproduces the prior submit-only MC-00 state. Its function
    // replacement, resting order, and failed crossing are all rolled back below.
    const sql = await readFile(new URL(migration, migrationDirectory), 'utf8');
    await db.query(onlyBody(sql, 'public.market_core_submit_limit_order'));
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [sellerId]);
    assert.equal((await submit(db, 'SELL', 105000, 1, 'mc00-prepatch-sell')).ok, true);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [buyerId]);
    await assert.rejects(() => submit(db, 'BUY', 110000, 1, 'mc00-prepatch-buy'), error => {
      t.diagnostic(JSON.stringify(diagnostic(error)));
      return error.code === '42702' && error.message === 'column reference "trade_n" is ambiguous'
        && error.where.includes('private.market_core_apply_fill');
    });
  } finally { await db.query('rollback'); }
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await definitions(), baselineFunctions);
});

scenario('additive repair changes only four qualified statements and preserves security and existing rows', async () => {
  const before = await snapshot();
  await db.query(await readFile(new URL(migration, migrationDirectory), 'utf8'));
  const expected = structuredClone(baselineFunctions);
  for (const [name, scope] of [
    ['market_core_submit_limit_order', 'submit'],
    ['market_core_cancel_order', 'cancel'],
    ['market_core_prepare_settlement_submit', 'settlement_submit'],
  ]) {
    const fn = expected.find(f => f.proname === name);
    const oldLookup = scope === 'submit'
      ? "  select result into prior\n  from public.market_core_idempotency\n  where scope = 'submit' and key = p_idempotency_key;"
      : `  select result into prior from public.market_core_idempotency where scope = '${scope}' and key = p_idempotency_key;`;
    const newLookup = `  select i.result into prior\n  from public.market_core_idempotency as i\n  where i.scope = '${scope}' and i.key = p_idempotency_key;`;
    assert.equal(fn.prosrc.split(oldLookup).length, 2);
    fn.prosrc = fn.prosrc.replace(oldLookup, newLookup);
  }
  const fill = expected.find(f => f.proname === 'market_core_apply_fill');
  const oldCounter = '  update public.market_core_counters\n    set trade_n = trade_n + 1,\n        settlement_n = settlement_n + 1\n    where market_id = p_incoming.market_id\n    returning trade_n, settlement_n into trade_n, set_n;';
  const newCounter = '  update public.market_core_counters as c\n    set trade_n = c.trade_n + 1,\n        settlement_n = c.settlement_n + 1\n    where c.market_id = p_incoming.market_id\n    returning c.trade_n, c.settlement_n into trade_n, set_n;';
  assert.equal(fill.prosrc.split(oldCounter).length, 2);
  fill.prosrc = fill.prosrc.replace(oldCounter, newCounter);
  assert.deepEqual(await definitions(), expected);
  assert.deepEqual(await snapshot(), before);
  for (const fn of expected.filter(f => ['market_core_submit_limit_order', 'market_core_apply_fill', 'market_core_cancel_order', 'market_core_prepare_settlement_submit'].includes(f.proname))) {
    assert.equal(fn.prosecdef, true);
    assert.equal(fn.provolatile, 'v');
    assert.deepEqual(fn.proconfig, ['search_path=pg_catalog, public']);
  }
  for (const [role, allowed] of [['authenticated', true], ['anon', false]]) {
    for (const signature of signatures) {
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, signature])).rows[0].allowed, allowed);
    }
    assert.equal((await db.query("select has_function_privilege($1,'private.market_core_apply_fill(public.market_core_orders,public.market_core_orders,bigint)','EXECUTE') as allowed", [role])).rows[0].allowed, false);
    for (const table of ['market_core_orders', 'market_core_reservations', 'market_core_idempotency']) {
      assert.equal((await db.query("select has_table_privilege($1,$2,'INSERT,UPDATE,DELETE') as allowed", [role, `public.${table}`])).rows[0].allowed, false);
    }
  }
});

scenario('authenticated submit persists an order, reservation, event, and exact receipt', async t => {
  const before = await snapshot();
  submitted = await submit(seller, 'SELL', 105000, 1, submitKey);
  assert.deepEqual(submitted, { ok: true, error: null, orderId: 'ORD-0003', status: 'OPEN' });
  const after = await snapshot();
  assert.equal(after.market_core_orders.length, before.market_core_orders.length + 1);
  const order = after.market_core_orders.find(o => o.id === submitted.orderId);
  assert.equal(order.order_type, 'LIMIT');
  assert.equal(order.sequence, 3);
  assert.equal(order.remaining_quantity, 1);
  assert.equal(order.filled_quantity, 0);
  assert.equal(after.market_core_reservations.length, before.market_core_reservations.length + 1);
  const reservation = after.market_core_reservations.find(r => r.order_id === submitted.orderId);
  assert.equal(reservation.id, 'RES-0003');
  assert.equal(reservation.quantity, 1);
  assert.equal(reservation.status, 'ACTIVE');
  assert.equal(after.market_core_events.length, before.market_core_events.length + 1);
  assert.equal(after.market_core_idempotency.length, before.market_core_idempotency.length + 1);
  assert.deepEqual(after.market_core_idempotency.find(r => r.scope === 'submit' && r.key === submitKey).result, submitted);
  const holding = after.market_core_holdings.find(h => h.participant_id === 'INVESTOR-0001' && h.instrument_id === 'WHEAT-2027');
  assert.equal(holding.owned, 10);
  assert.equal(holding.reserved_for_orders, 3);
  assert.deepEqual(after.registrar_registered_ownership, before.registrar_registered_ownership);
  t.diagnostic(JSON.stringify({ submitted, reservation }));
});

scenario('same-key replay returns the committed receipt without any second business effect', async () => {
  assert.ok(submitted);
  const before = await snapshot();
  const stored = before.market_core_idempotency.find(r => r.scope === 'submit' && r.key === submitKey).result;
  const replay = await submit(seller, 'SELL', 105000, 1, submitKey);
  assert.deepEqual(replay, stored);
  assert.deepEqual(replay, submitted);
  assert.deepEqual(await snapshot(), before);
});

scenario('legacy receipt is read verbatim instead of reconstructing a current submit response', async () => {
  const before = await snapshot();
  const key = 'seed-submit-ORD-SEED-SELL-001';
  const stored = before.market_core_idempotency.find(r => r.scope === 'submit' && r.key === key).result;
  assert.deepEqual(stored, { ok: true, orderId: 'ORD-SEED-SELL-001' });
  assert.deepEqual(await submit(seller, 'SELL', 105000, 2, key), stored);
  assert.deepEqual(await snapshot(), before);
});

scenario('crossing submit persists legacy trade and settlement IDs, counters, reserves, and resting price', async t => {
  const before = await snapshot();
  const bought = await submit(buyer, 'BUY', 110000, 1, 'mc00-synthetic-buy');
  assert.equal(bought.ok, true);
  assert.equal(bought.status, 'FILLED');
  const after = await snapshot();
  assert.equal(after.market_core_trades.length, before.market_core_trades.length + 1);
  assert.equal(after.market_core_settlements.length, before.market_core_settlements.length + 1);
  const trade = after.market_core_trades.find(tr => tr.buy_order_id === bought.orderId);
  assert.equal(trade.sell_order_id, submitted.orderId);
  assert.equal(trade.price, 105000);
  assert.equal(trade.quantity, 1);
  assert.equal(trade.status, 'AWAITING_DEVNET_SETTLEMENT');
  assert.equal(trade.kind, 'SECONDARY');
  assert.equal(trade.id, 'TRD-0002');
  assert.equal(trade.notional, 105000);
  matchedSettlement = after.market_core_settlements.find(s => s.trade_id === trade.id);
  assert.equal(matchedSettlement.id, 'SET-0002');
  assert.equal(matchedSettlement.status, 'AWAITING_DEVNET_SETTLEMENT');
  assert.equal(matchedSettlement.kind, 'SECONDARY');
  assert.equal(matchedSettlement.provider, 'DEMO');
  assert.equal(matchedSettlement.idempotency_key, 'settlement-TRD-0002');
  assert.deepEqual(after.market_core_counters[0], {
    market_id: marketId, order_seq: 4, order_n: 4, reservation_n: 4,
    trade_n: 2, settlement_n: 2, event_n: 12,
  });
  assert.ok(after.market_core_events.some(e => e.id === 'EVT-000012' && e.event_type === 'trade_created'));
  for (const id of [submitted.orderId, bought.orderId]) {
    const order = after.market_core_orders.find(o => o.id === id);
    assert.equal(order.remaining_quantity, 0);
    assert.equal(order.filled_quantity, 1);
    assert.equal(order.status, 'FILLED');
    assert.equal(after.market_core_reservations.find(r => r.order_id === id).status, 'HELD_PENDING_SETTLEMENT');
  }
  assert.equal(holding(after, 'INVESTOR-0001').pending_out, holding(before, 'INVESTOR-0001').pending_out + 1);
  assert.equal(holding(after, 'GRAIN-DESK').pending_in, holding(before, 'GRAIN-DESK').pending_in + 1);
  assert.equal(cash(after, 'GRAIN-DESK').available, cash(before, 'GRAIN-DESK').available - 105000);
  assert.equal(cash(after, 'GRAIN-DESK').reserved, cash(before, 'GRAIN-DESK').reserved + 105000);
  assert.deepEqual(after.registrar_registered_ownership, before.registrar_registered_ownership);
  t.diagnostic(JSON.stringify({ bought, tradeId: trade.id, settlementId: matchedSettlement.id, counters: after.market_core_counters[0] }));
});

scenario('SELL cancellation releases the holding once, records an event and replays the exact receipt', async () => {
  const original = await snapshot();
  const open = await submit(seller, 'SELL', 120000, 2, 'mc00-synthetic-cancelable');
  assert.equal(open.ok, true);
  const reserved = await snapshot();
  assert.equal(holding(reserved, 'INVESTOR-0001').reserved_for_orders, holding(original, 'INVESTOR-0001').reserved_for_orders + 2);
  const cancelled = await cancel(seller, open.orderId, 'mc00-synthetic-cancel');
  assert.deepEqual(cancelled, { ok: true, error: null, orderId: open.orderId });
  const final = await snapshot();
  assert.equal(final.market_core_reservations.find(r => r.order_id === open.orderId).status, 'RELEASED');
  assert.equal(final.market_core_orders.find(o => o.id === open.orderId).status, 'CANCELLED');
  assert.equal(final.market_core_orders.find(o => o.id === open.orderId).remaining_quantity, 0);
  assert.deepEqual(holding(final, 'INVESTOR-0001'), holding(original, 'INVESTOR-0001'));
  assert.equal(final.market_core_events.length, reserved.market_core_events.length + 1);
  assert.deepEqual(receipt(final, 'cancel', 'mc00-synthetic-cancel'), cancelled);
  assert.deepEqual(await cancel(seller, open.orderId, 'mc00-synthetic-cancel'), cancelled);
  assert.deepEqual(await snapshot(), final);
});

scenario('BUY cancellation releases DEMO-KZT once without a second release on replay', async () => {
  const original = await snapshot();
  const open = await submit(buyer, 'BUY', 90000, 1, 'mc00-cash-cancelable');
  assert.equal(open.status, 'OPEN');
  const reserved = await snapshot();
  assert.equal(cash(reserved, 'GRAIN-DESK').available, cash(original, 'GRAIN-DESK').available - 90000);
  assert.equal(cash(reserved, 'GRAIN-DESK').reserved, cash(original, 'GRAIN-DESK').reserved + 90000);
  const cancelled = await cancel(buyer, open.orderId, 'mc00-cash-cancel');
  assert.equal(cancelled.ok, true);
  const final = await snapshot();
  assert.deepEqual(cash(final, 'GRAIN-DESK'), cash(original, 'GRAIN-DESK'));
  assert.equal(final.market_core_reservations.find(r => r.order_id === open.orderId).status, 'RELEASED');
  assert.deepEqual(receipt(final, 'cancel', 'mc00-cash-cancel'), cancelled);
  assert.deepEqual(await cancel(buyer, open.orderId, 'mc00-cash-cancel'), cancelled);
  assert.deepEqual(await snapshot(), final);
});

scenario('partial fill and cancellation retain the filled hold and release only the unfilled quantity', async () => {
  const original = await snapshot();
  const resting = await submit(seller, 'SELL', 120000, 2, 'mc00-partial-sell');
  assert.equal(resting.ok, true);
  assert.equal((await submit(buyer, 'BUY', 130000, 1, 'mc00-partial-buy')).status, 'FILLED');
  const partial = await snapshot();
  const order = partial.market_core_orders.find(o => o.id === resting.orderId);
  assert.equal(order.status, 'PARTIALLY_FILLED');
  assert.equal(order.filled_quantity, 1);
  assert.equal(order.remaining_quantity, 1);
  assert.equal(partial.market_core_reservations.find(r => r.order_id === resting.orderId).status, 'ACTIVE');
  const cancelled = await cancel(seller, resting.orderId, 'mc00-partial-cancel');
  assert.equal(cancelled.ok, true);
  const final = await snapshot();
  assert.equal(final.market_core_orders.find(o => o.id === resting.orderId).status, 'FILLED');
  assert.equal(final.market_core_orders.find(o => o.id === resting.orderId).remaining_quantity, 0);
  assert.equal(final.market_core_reservations.find(r => r.order_id === resting.orderId).status, 'HELD_PENDING_SETTLEMENT');
  assert.equal(holding(final, 'INVESTOR-0001').reserved_for_orders, holding(original, 'INVESTOR-0001').reserved_for_orders + 1);
  assert.deepEqual(await cancel(seller, resting.orderId, 'mc00-partial-cancel'), cancelled);
  assert.deepEqual(await snapshot(), final);
});

scenario('crossing orders from one participant do not self-match', async () => {
  const before = await snapshot();
  const ownBuy = await submit(seller, 'BUY', 130000, 1, 'mc00-own-buy');
  const ownSell = await submit(seller, 'SELL', 130000, 1, 'mc00-own-sell');
  assert.equal(ownBuy.status, 'OPEN');
  assert.equal(ownSell.status, 'OPEN');
  const open = await snapshot();
  assert.deepEqual(open.market_core_trades, before.market_core_trades);
  assert.deepEqual(open.market_core_settlements, before.market_core_settlements);
  assert.equal(holding(open, 'INVESTOR-0001').pending_in, holding(before, 'INVESTOR-0001').pending_in);
  assert.equal(holding(open, 'INVESTOR-0001').pending_out, holding(before, 'INVESTOR-0001').pending_out);
  assert.equal((await cancel(seller, ownBuy.orderId, 'mc00-own-buy-cancel')).ok, true);
  assert.equal((await cancel(seller, ownSell.orderId, 'mc00-own-sell-cancel')).ok, true);
  const final = await snapshot();
  assert.deepEqual(cash(final, 'INVESTOR-0001'), cash(before, 'INVESTOR-0001'));
  assert.deepEqual(holding(final, 'INVESTOR-0001'), holding(before, 'INVESTOR-0001'));
});

scenario('authorized settlement preparation remains disabled and replays without another effect', async () => {
  const before = await snapshot();
  const result = await prepare(admin, matchedSettlement.id, 'mc00-prepare-disabled');
  assert.deepEqual(result, { ok: false, error: 'SETTLEMENT_DISABLED', allowNewChainSubmit: false, action: 'NONE' });
  const after = await snapshot();
  assert.deepEqual(receipt(after, 'settlement_submit', 'mc00-prepare-disabled'), result);
  assert.equal(after.market_core_idempotency.length, before.market_core_idempotency.length + 1);
  assert.deepEqual({ ...after, market_core_idempotency: before.market_core_idempotency }, before);
  assert.deepEqual(await prepare(admin, matchedSettlement.id, 'mc00-prepare-disabled'), result);
  assert.deepEqual(await snapshot(), after);
  const intent = (await admin.query('select public.market_core_settlement_intent($1) as result', [matchedSettlement.id])).rows[0].result;
  assert.equal(intent.allowNewChainSubmit, false);
  assert.equal(intent.action, 'NONE');
});

scenario('recorded-signature preparation returns lookup-only without submitting or finalizing', async () => {
  const before = await snapshot();
  await db.query('begin');
  try {
    // Deliberately synthetic local marker, never represented as chain evidence.
    await db.query("update public.market_core_settlements set asset_tx_signature='MC00_SYNTHETIC_MARKER_NOT_CHAIN_EVIDENCE' where id=$1", [matchedSettlement.id]);
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [adminId]);
    const result = await prepare(db, matchedSettlement.id, 'mc00-prepare-lookup');
    assert.deepEqual(result, { ok: true, error: null, allowNewChainSubmit: false, action: 'SIGNATURE_LOOKUP' });
    assert.deepEqual(await prepare(db, matchedSettlement.id, 'mc00-prepare-lookup'), result);
    await db.query('reset role');
    const after = await snapshot();
    assert.deepEqual(receipt(after, 'settlement_submit', 'mc00-prepare-lookup'), result);
    assert.equal(after.market_core_settlements.find(s => s.id === matchedSettlement.id).status, 'AWAITING_DEVNET_SETTLEMENT');
    assert.deepEqual(after.registrar_registered_ownership, before.registrar_registered_ownership);
  } finally { await db.query('rollback'); }
  assert.deepEqual(await snapshot(), before);
});

scenario('cancel and settlement preparation return legacy stored JSON verbatim with no effect', async () => {
  const legacyCancel = { ok: true, orderId: 'ORD-LEGACY-CANCELLED' };
  await db.query(`insert into public.market_core_idempotency(scope,key,participant_id,result)
    values('cancel','mc00-legacy-cancel','INVESTOR-0001',$1)`, [legacyCancel]);
  const before = await snapshot();
  assert.deepEqual(await cancel(seller, legacyCancel.orderId, 'mc00-legacy-cancel'), legacyCancel);
  const legacyPrepare = receipt(before, 'settlement_submit', 'seed-settlement-SET-SEED-001');
  assert.deepEqual(legacyPrepare, { ok: false, error: 'SETTLEMENT_DISABLED' });
  assert.deepEqual(await prepare(admin, 'SET-SEED-001', 'seed-settlement-SET-SEED-001'), legacyPrepare);
  assert.deepEqual(await snapshot(), before);
});

scenario('a synthetic late settlement-insert failure rolls back prior matching mutations', async () => {
  const resting = await submit(seller, 'SELL', 125000, 1, 'mc00-rollback-sell');
  assert.equal(resting.ok, true);
  const before = await snapshot();
  // This hook exists only in this disposable cluster and is removed before retry.
  await db.query(`create function private.mc00_test_late_failure() returns trigger language plpgsql as $$
    begin
      if not exists(select 1 from public.market_core_trades where id=new.trade_id) then
        raise exception 'MC00_TEST_EXPECTED_PRIOR_TRADE';
      end if;
      raise exception 'MC00_SYNTHETIC_LATE_FAILURE';
    end; $$;
    create trigger mc00_test_late_failure before insert on public.market_core_settlements
    for each row execute function private.mc00_test_late_failure();`);
  try {
    await assert.rejects(() => submit(buyer, 'BUY', 130000, 1, 'mc00-rollback-buy'),
      { code: 'P0001', message: 'MC00_SYNTHETIC_LATE_FAILURE' });
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.query('drop trigger mc00_test_late_failure on public.market_core_settlements; drop function private.mc00_test_late_failure();');
  }
  const retried = await submit(buyer, 'BUY', 130000, 1, 'mc00-rollback-buy');
  assert.equal(retried.status, 'FILLED');
  const after = await snapshot();
  assert.equal(after.market_core_trades.length, before.market_core_trades.length + 1);
  assert.equal(after.market_core_settlements.length, before.market_core_settlements.length + 1);
  assert.deepEqual(await submit(buyer, 'BUY', 130000, 1, 'mc00-rollback-buy'), retried);
  assert.deepEqual(await snapshot(), after);
});

scenario('existing authorization and Registrar projection boundaries remain enforced', async () => {
  const before = await snapshot();
  assert.deepEqual(await prepare(seller, matchedSettlement.id, 'mc00-forbidden-prepare'), { ok: false, error: 'FORBIDDEN' });
  assert.deepEqual(await cancel(buyer, submitted.orderId, 'mc00-not-owner'), { ok: false, error: 'NOT_OWNER' });
  assert.deepEqual(await submit(admin, 'BUY', 1, 1, 'mc00-admin-not-trader'), { ok: false, error: 'INELIGIBLE' });
  await db.query('begin');
  try {
    await db.query("select set_config('app.registrar_sync','off',true)");
    await assert.rejects(db.query("update public.market_core_holdings set owned=owned+1 where participant_id='INVESTOR-0001' and instrument_id='WHEAT-2027'"),
      { code: 'P0001', message: 'OWNED_IS_REGISTRAR_PROJECTION' });
  } finally { await db.query('rollback'); }
  assert.deepEqual(await snapshot(), before);
});

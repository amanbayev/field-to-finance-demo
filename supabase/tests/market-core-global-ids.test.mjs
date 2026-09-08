// Actual PostgreSQL semantics, disposable Unix-socket cluster only.
// Run with GP01_EMBEDDED_POSTGRES_MODULE=/absolute/embedded-postgres/dist/index.js
// node --test supabase/tests/market-core-global-ids.test.mjs
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
const directory = await mkdtemp('/private/tmp/mc01-postgres-');
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), user: 'postgres', password: randomUUID(),
  port: 5432, persistent: true, createPostgresUser: false, postgresFlags: ['-h', '', '-k', directory],
  onLog() {}, onError(message) { console.error(message); },
});
const migrationDirectory = new URL('../migrations/', import.meta.url);
const migration = '20260908123925_mc01_global_market_core_ids.sql';
const signatures = [
  'public.market_core_submit_limit_order(text,text,bigint,bigint,text)',
  'public.market_core_cancel_order(text,text)',
  'public.market_core_prepare_settlement_submit(text,text)',
];
const marketId = 'MKT-WHEAT-2027-DEMO-KZT';
const sellerId = randomUUID();
const buyerId = randomUUID();
const adminId = randomUUID();
const submitKey = 'mc01-synthetic-sell';
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
    values($1,'MC01 synthetic organization',$2,$3) returning id`, [`mc01-${role.toLowerCase()}`, type, participantId])).rows[0].id;
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
  const files = (await readdir(migrationDirectory)).filter(f => f.endsWith('.sql')).sort();
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
    if (started) {
      await pg.stop();
      await rm(directory, { recursive: true });
      console.log('Disposable server stopped; cluster removed.');
    }
  }
});

async function syntheticMarket(id, counters) {
  await db.query(`insert into public.market_core_markets
    select (jsonb_populate_record(null::public.market_core_markets,
      to_jsonb(m) || jsonb_build_object('id',$1::text))).*
    from public.market_core_markets m where id=$2`, [id, marketId]);
  await db.query(`insert into public.market_core_counters(market_id,order_n,reservation_n,event_n,trade_n,settlement_n)
    values($1,$2,$3,$4,$5,$6)`, [id, ...counters]);
}
async function asSubmit(id, who, side, key) {
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [who]);
  return (await db.query('select public.market_core_submit_limit_order($1,$2,$3,1,$4) as result',
    [id, side, side==='SELL'?105000:110000, key])).rows[0].result;
}
for (const [family, second] of [
  ['ORD',[100,100,100,100,100]],
  ['RES',[200,100,200,200,200]],
  ['EVT',[200,200,100,200,200]],
  ['TRD',[200,200,200,100,200]],
  ['SET',[200,200,200,200,100]],
]) {
  scenario(`MC00 pre-patch ${family} actual global duplicate-key collision`, async t => {
    const before = await snapshot();
    await db.query('begin');
    try {
      const a=`MKT-MC01-COLLISION-${family}-A`, b=`MKT-MC01-COLLISION-${family}-B`;
      await syntheticMarket(a,[100,100,100,100,100]);
      await syntheticMarket(b,second);
      assert.equal((await asSubmit(a,sellerId,'SELL',`${family}-a-sell`)).ok,true);
      if (family==='TRD' || family==='SET') {
        assert.equal((await asSubmit(a,buyerId,'BUY',`${family}-a-buy`)).status,'FILLED');
        assert.equal((await asSubmit(b,sellerId,'SELL',`${family}-b-sell`)).ok,true);
      }
      await assert.rejects(() => asSubmit(b, family==='TRD'||family==='SET'?buyerId:sellerId,
        family==='TRD'||family==='SET'?'BUY':'SELL',`${family}-collision`), error => {
          t.diagnostic(JSON.stringify(diagnostic(error)));
          return error.code==='23505' && error.detail.includes(`${family}-${family==='EVT'?'000101':'0101'}`);
        });
    } finally { await db.query('rollback'); }
    assert.deepEqual(await snapshot(),before);
  });
}

function assertUuid(prefix, value) {
  assert.match(value, new RegExp(`^${prefix}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`));
  assert.equal(Buffer.byteLength(value), 40);
}
async function catalogShape() {
  return (await db.query(`select table_name,column_name,data_type,character_maximum_length
    from information_schema.columns where table_schema='public'
    and (starts_with(table_name,'market_core_') or table_name='registrar_registered_ownership')
    order by table_name,ordinal_position`)).rows;
}
scenario('effective writer and column audit is closed on the canonical MC00 baseline', async () => {
  const expected = {
    market_core_orders: ['market_core_submit_limit_order'],
    market_core_reservations: ['market_core_submit_limit_order'],
    market_core_trades: ['market_core_apply_fill'],
    market_core_settlements: ['market_core_apply_fill'],
    market_core_events: ['market_core_emit'],
  };
  for (const [table, names] of Object.entries(expected)) {
    assert.deepEqual(baselineFunctions.filter(f => f.prosrc.includes(`insert into public.${table} (`)).map(f => f.proname), names);
  }
  assert.equal(baselineFunctions.some(f => f.proname.startsWith('market_core_test_')), false);
  const columns = await catalogShape();
  for (const row of columns.filter(c => c.column_name === 'id' || c.column_name.endsWith('_id'))) {
    assert.equal(row.data_type, 'text', `${row.table_name}.${row.column_name}`);
    assert.equal(row.character_maximum_length, null);
  }
  assert.equal(columns.find(c => c.table_name==='market_core_idempotency' && c.column_name==='result').data_type,'jsonb');
});
scenario('one additive migration changes only five allocators, no rows, columns, ACLs or other functions', async () => {
  const before = await snapshot();
  const shape = await catalogShape();
  const expected = structuredClone(baselineFunctions);
  for (const [fnName,prefix,variable,width] of [
    ['market_core_submit_limit_order','ORD','n',4],
    ['market_core_submit_limit_order','RES','res_n',4],
    ['market_core_apply_fill','TRD','trade_n',4],
    ['market_core_apply_fill','SET','set_n',4],
    ['market_core_emit','EVT','n',6],
  ]) {
    const fn=expected.find(f => f.proname===fnName);
    const old=`'${prefix}-' || lpad(${variable}::text, ${width}, '0')`;
    assert.equal(fn.prosrc.split(old).length,2);
    fn.prosrc=fn.prosrc.replace(old,`'${prefix}-' || gen_random_uuid()::text`);
  }
  await db.query(await readFile(new URL(migration,migrationDirectory),'utf8'));
  assert.deepEqual(await definitions(),expected);
  assert.deepEqual(await snapshot(),before);
  assert.deepEqual(await catalogShape(),shape);
  for (const signature of signatures) {
    assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') as ok",[signature])).rows[0].ok,true);
    assert.equal((await db.query("select has_function_privilege('anon',$1,'EXECUTE') as ok",[signature])).rows[0].ok,false);
  }
  for (const fn of ['private.market_core_emit(text,text,text,text,text,text,jsonb)',
    'private.market_core_apply_fill(public.market_core_orders,public.market_core_orders,bigint)']) {
    assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') as ok",[fn])).rows[0].ok,false);
  }
});
scenario('authenticated submit persists an order, reservation, event, and exact receipt', async t => {
  const before = await snapshot();
  submitted = await submit(seller, 'SELL', 105000, 1, submitKey);
  assertUuid('ORD', submitted.orderId);
  assert.deepEqual(submitted, { ok: true, error: null, orderId: submitted.orderId, status: 'OPEN' });
  const after = await snapshot();
  assert.equal(after.market_core_orders.length, before.market_core_orders.length + 1);
  const order = after.market_core_orders.find(o => o.id === submitted.orderId);
  assert.equal(order.order_type, 'LIMIT');
  assert.equal(order.sequence, 3);
  assert.equal(order.remaining_quantity, 1);
  assert.equal(order.filled_quantity, 0);
  assert.equal(after.market_core_reservations.length, before.market_core_reservations.length + 1);
  const reservation = after.market_core_reservations.find(r => r.order_id === submitted.orderId);
  assertUuid('RES', reservation.id);
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

scenario('crossing submit persists full UUID trade and settlement IDs, counters, reserves, and resting price', async t => {
  const before = await snapshot();
  const bought = await submit(buyer, 'BUY', 110000, 1, 'mc01-synthetic-buy');
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
  assertUuid('TRD', trade.id);
  assert.equal(trade.notional, 105000);
  matchedSettlement = after.market_core_settlements.find(s => s.trade_id === trade.id);
  assertUuid('SET', matchedSettlement.id);
  assert.equal(matchedSettlement.status, 'AWAITING_DEVNET_SETTLEMENT');
  assert.equal(matchedSettlement.kind, 'SECONDARY');
  assert.equal(matchedSettlement.provider, 'DEMO');
  assert.equal(matchedSettlement.idempotency_key, `settlement-${trade.id}`);
  assert.deepEqual(after.market_core_counters[0], {
    market_id: marketId, order_seq: 4, order_n: 4, reservation_n: 4,
    trade_n: 2, settlement_n: 2, event_n: 12,
  });
  assert.ok(after.market_core_events.some(e => e.entity_id === trade.id && e.event_type === 'trade_created'));
  for (const event of after.market_core_events.filter(e => !before.market_core_events.some(old => old.id === e.id))) assertUuid('EVT', event.id);
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
  const open = await submit(seller, 'SELL', 120000, 2, 'mc01-synthetic-cancelable');
  assert.equal(open.ok, true);
  const reserved = await snapshot();
  assert.equal(holding(reserved, 'INVESTOR-0001').reserved_for_orders, holding(original, 'INVESTOR-0001').reserved_for_orders + 2);
  const cancelled = await cancel(seller, open.orderId, 'mc01-synthetic-cancel');
  assert.deepEqual(cancelled, { ok: true, error: null, orderId: open.orderId });
  const final = await snapshot();
  assert.equal(final.market_core_reservations.find(r => r.order_id === open.orderId).status, 'RELEASED');
  assert.equal(final.market_core_orders.find(o => o.id === open.orderId).status, 'CANCELLED');
  assert.equal(final.market_core_orders.find(o => o.id === open.orderId).remaining_quantity, 0);
  assert.deepEqual(holding(final, 'INVESTOR-0001'), holding(original, 'INVESTOR-0001'));
  assert.equal(final.market_core_events.length, reserved.market_core_events.length + 1);
  assert.deepEqual(receipt(final, 'cancel', 'mc01-synthetic-cancel'), cancelled);
  assert.deepEqual(await cancel(seller, open.orderId, 'mc01-synthetic-cancel'), cancelled);
  assert.deepEqual(await snapshot(), final);
});

scenario('BUY cancellation releases DEMO-KZT once without a second release on replay', async () => {
  const original = await snapshot();
  const open = await submit(buyer, 'BUY', 90000, 1, 'mc01-cash-cancelable');
  assert.equal(open.status, 'OPEN');
  const reserved = await snapshot();
  assert.equal(cash(reserved, 'GRAIN-DESK').available, cash(original, 'GRAIN-DESK').available - 90000);
  assert.equal(cash(reserved, 'GRAIN-DESK').reserved, cash(original, 'GRAIN-DESK').reserved + 90000);
  const cancelled = await cancel(buyer, open.orderId, 'mc01-cash-cancel');
  assert.equal(cancelled.ok, true);
  const final = await snapshot();
  assert.deepEqual(cash(final, 'GRAIN-DESK'), cash(original, 'GRAIN-DESK'));
  assert.equal(final.market_core_reservations.find(r => r.order_id === open.orderId).status, 'RELEASED');
  assert.deepEqual(receipt(final, 'cancel', 'mc01-cash-cancel'), cancelled);
  assert.deepEqual(await cancel(buyer, open.orderId, 'mc01-cash-cancel'), cancelled);
  assert.deepEqual(await snapshot(), final);
});

scenario('partial fill and cancellation retain the filled hold and release only the unfilled quantity', async () => {
  const original = await snapshot();
  const resting = await submit(seller, 'SELL', 120000, 2, 'mc01-partial-sell');
  assert.equal(resting.ok, true);
  assert.equal((await submit(buyer, 'BUY', 130000, 1, 'mc01-partial-buy')).status, 'FILLED');
  const partial = await snapshot();
  const order = partial.market_core_orders.find(o => o.id === resting.orderId);
  assert.equal(order.status, 'PARTIALLY_FILLED');
  assert.equal(order.filled_quantity, 1);
  assert.equal(order.remaining_quantity, 1);
  assert.equal(partial.market_core_reservations.find(r => r.order_id === resting.orderId).status, 'ACTIVE');
  const cancelled = await cancel(seller, resting.orderId, 'mc01-partial-cancel');
  assert.equal(cancelled.ok, true);
  const final = await snapshot();
  assert.equal(final.market_core_orders.find(o => o.id === resting.orderId).status, 'FILLED');
  assert.equal(final.market_core_orders.find(o => o.id === resting.orderId).remaining_quantity, 0);
  assert.equal(final.market_core_reservations.find(r => r.order_id === resting.orderId).status, 'HELD_PENDING_SETTLEMENT');
  assert.equal(holding(final, 'INVESTOR-0001').reserved_for_orders, holding(original, 'INVESTOR-0001').reserved_for_orders + 1);
  assert.deepEqual(await cancel(seller, resting.orderId, 'mc01-partial-cancel'), cancelled);
  assert.deepEqual(await snapshot(), final);
});

scenario('crossing orders from one participant do not self-match', async () => {
  const before = await snapshot();
  const ownBuy = await submit(seller, 'BUY', 130000, 1, 'mc01-own-buy');
  const ownSell = await submit(seller, 'SELL', 130000, 1, 'mc01-own-sell');
  assert.equal(ownBuy.status, 'OPEN');
  assert.equal(ownSell.status, 'OPEN');
  const open = await snapshot();
  assert.deepEqual(open.market_core_trades, before.market_core_trades);
  assert.deepEqual(open.market_core_settlements, before.market_core_settlements);
  assert.equal(holding(open, 'INVESTOR-0001').pending_in, holding(before, 'INVESTOR-0001').pending_in);
  assert.equal(holding(open, 'INVESTOR-0001').pending_out, holding(before, 'INVESTOR-0001').pending_out);
  assert.equal((await cancel(seller, ownBuy.orderId, 'mc01-own-buy-cancel')).ok, true);
  assert.equal((await cancel(seller, ownSell.orderId, 'mc01-own-sell-cancel')).ok, true);
  const final = await snapshot();
  assert.deepEqual(cash(final, 'INVESTOR-0001'), cash(before, 'INVESTOR-0001'));
  assert.deepEqual(holding(final, 'INVESTOR-0001'), holding(before, 'INVESTOR-0001'));
});

scenario('authorized settlement preparation remains disabled and replays without another effect', async () => {
  const before = await snapshot();
  const result = await prepare(admin, matchedSettlement.id, 'mc01-prepare-disabled');
  assert.deepEqual(result, { ok: false, error: 'SETTLEMENT_DISABLED', allowNewChainSubmit: false, action: 'NONE' });
  const after = await snapshot();
  assert.deepEqual(receipt(after, 'settlement_submit', 'mc01-prepare-disabled'), result);
  assert.equal(after.market_core_idempotency.length, before.market_core_idempotency.length + 1);
  assert.deepEqual({ ...after, market_core_idempotency: before.market_core_idempotency }, before);
  assert.deepEqual(await prepare(admin, matchedSettlement.id, 'mc01-prepare-disabled'), result);
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
    await db.query("update public.market_core_settlements set asset_tx_signature='MC01_SYNTHETIC_MARKER_NOT_CHAIN_EVIDENCE' where id=$1", [matchedSettlement.id]);
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [adminId]);
    const result = await prepare(db, matchedSettlement.id, 'mc01-prepare-lookup');
    assert.deepEqual(result, { ok: true, error: null, allowNewChainSubmit: false, action: 'SIGNATURE_LOOKUP' });
    assert.deepEqual(await prepare(db, matchedSettlement.id, 'mc01-prepare-lookup'), result);
    await db.query('reset role');
    const after = await snapshot();
    assert.deepEqual(receipt(after, 'settlement_submit', 'mc01-prepare-lookup'), result);
    assert.equal(after.market_core_settlements.find(s => s.id === matchedSettlement.id).status, 'AWAITING_DEVNET_SETTLEMENT');
    assert.deepEqual(after.registrar_registered_ownership, before.registrar_registered_ownership);
  } finally { await db.query('rollback'); }
  assert.deepEqual(await snapshot(), before);
});

scenario('cancel and settlement preparation return legacy stored JSON verbatim with no effect', async () => {
  const legacyCancel = { ok: true, orderId: 'ORD-LEGACY-CANCELLED' };
  await db.query(`insert into public.market_core_idempotency(scope,key,participant_id,result)
    values('cancel','mc01-legacy-cancel','INVESTOR-0001',$1)`, [legacyCancel]);
  const before = await snapshot();
  assert.deepEqual(await cancel(seller, legacyCancel.orderId, 'mc01-legacy-cancel'), legacyCancel);
  const legacyPrepare = receipt(before, 'settlement_submit', 'seed-settlement-SET-SEED-001');
  assert.deepEqual(legacyPrepare, { ok: false, error: 'SETTLEMENT_DISABLED' });
  assert.deepEqual(await prepare(admin, 'SET-SEED-001', 'seed-settlement-SET-SEED-001'), legacyPrepare);
  assert.deepEqual(await snapshot(), before);
});

scenario('a synthetic late settlement-insert failure rolls back prior matching mutations', async () => {
  const resting = await submit(seller, 'SELL', 125000, 1, 'mc01-rollback-sell');
  assert.equal(resting.ok, true);
  const before = await snapshot();
  // This hook exists only in this disposable cluster and is removed before retry.
  await db.query(`create function private.mc01_test_late_failure() returns trigger language plpgsql as $$
    begin
      if not exists(select 1 from public.market_core_trades where id=new.trade_id) then
        raise exception 'MC01_TEST_EXPECTED_PRIOR_TRADE';
      end if;
      raise exception 'MC01_SYNTHETIC_LATE_FAILURE';
    end; $$;
    create trigger mc01_test_late_failure before insert on public.market_core_settlements
    for each row execute function private.mc01_test_late_failure();`);
  try {
    await assert.rejects(() => submit(buyer, 'BUY', 130000, 1, 'mc01-rollback-buy'),
      { code: 'P0001', message: 'MC01_SYNTHETIC_LATE_FAILURE' });
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.query('drop trigger mc01_test_late_failure on public.market_core_settlements; drop function private.mc01_test_late_failure();');
  }
  const retried = await submit(buyer, 'BUY', 130000, 1, 'mc01-rollback-buy');
  assert.equal(retried.status, 'FILLED');
  const after = await snapshot();
  assert.equal(after.market_core_trades.length, before.market_core_trades.length + 1);
  assert.equal(after.market_core_settlements.length, before.market_core_settlements.length + 1);
  assert.deepEqual(await submit(buyer, 'BUY', 130000, 1, 'mc01-rollback-buy'), retried);
  assert.deepEqual(await snapshot(), after);
});

scenario('existing authorization and Registrar projection boundaries remain enforced', async () => {
  const before = await snapshot();
  assert.deepEqual(await prepare(seller, matchedSettlement.id, 'mc01-forbidden-prepare'), { ok: false, error: 'FORBIDDEN' });
  assert.deepEqual(await cancel(buyer, submitted.orderId, 'mc01-not-owner'), { ok: false, error: 'NOT_OWNER' });
  assert.deepEqual(await submit(admin, 'BUY', 1, 1, 'mc01-admin-not-trader'), { ok: false, error: 'INELIGIBLE' });
  await db.query('begin');
  try {
    await db.query("select set_config('app.registrar_sync','off',true)");
    await assert.rejects(db.query("update public.market_core_holdings set owned=owned+1 where participant_id='INVESTOR-0001' and instrument_id='WHEAT-2027'"),
      { code: 'P0001', message: 'OWNED_IS_REGISTRAR_PROJECTION' });
  } finally { await db.query('rollback'); }
  assert.deepEqual(await snapshot(), before);
});

async function freshMarket(id) {
  const instrument=`${id}-SYNTHETIC-INSTRUMENT`;
  await syntheticMarket(id,[0,0,0,0,0]);
  await db.query('update public.market_core_markets set instrument_id=$2 where id=$1',[id,instrument]);
  for (const participant of ['INVESTOR-0001','GRAIN-DESK']) {
    await db.query(`insert into public.market_core_eligibility values($1,'MC01 synthetic participant',$2,'ELIGIBLE')`,[participant,instrument]);
    await db.query(`insert into public.market_core_holdings
      values($1,$2,$3,'MC01 synthetic inventory',1000,0,0,0,0,0)`,[`${id}-${participant}`,instrument,participant]);
  }
  return instrument;
}
async function marketSubmit(client,id,side,price,quantity,key) {
  const result=(await client.query('select public.market_core_submit_limit_order($1,$2,$3,$4,$5) as result',
    [id,side,price,quantity,key])).rows[0].result;
  assert.equal(result.ok,true,JSON.stringify(result));
  assertUuid('ORD',result.orderId);
  return result;
}
async function concurrentSubmits(requests) {
  const connections=await Promise.all(requests.map(r=>connection(r.userId)));
  const pids=await Promise.all(connections.map(async c=>(await c.query('select pg_backend_pid() as pid')).rows[0].pid));
  assert.equal(new Set(pids).size,requests.length);
  await db.query('begin');
  let completed;
  let waiting=0;
  try {
    for (const id of [...new Set(requests.map(r=>r.market))].sort()) {
      await db.query('select pg_advisory_xact_lock(hashtext($1))',[id]);
    }
    completed=Promise.allSettled(requests.map((r,i)=>marketSubmit(connections[i],r.market,r.side,r.price,r.quantity,r.key)));
    // Prove every independent backend entered the real advisory-lock boundary
    // before releasing it. Promise.all alone would not establish overlap.
    const deadline=Date.now()+5000;
    while(Date.now()<deadline) {
      await db.query('select pg_stat_clear_snapshot()');
      waiting=Number((await db.query(`select count(*) as n from pg_stat_activity
        where pid=any($1::int[]) and wait_event_type='Lock' and wait_event='advisory'`,[pids])).rows[0].n);
      if(waiting===requests.length) break;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
  } finally { await db.query('commit'); }
  const results=await completed;
  assert.equal(waiting,requests.length,'All backends must reach the blocked lock boundary');
  for(const r of results) assert.equal(r.status,'fulfilled',r.reason?.stack);
  console.log('Observed concurrent PostgreSQL backends:',JSON.stringify({pids,waiting,markets:requests.map(r=>r.market)}));
  return results.map(r=>r.value);
}
const families={ORD:'market_core_orders',RES:'market_core_reservations',TRD:'market_core_trades',SET:'market_core_settlements',EVT:'market_core_events'};
scenario('equivalent counters in two markets allocate all five UUID families with equal local sequences',async t=>{
  const ids=['MKT-MC01-M1','MKT-MC01-M2'];
  for(const id of ids) await freshMarket(id);
  const before=await snapshot();
  const resting=await concurrentSubmits(ids.map(id=>({userId:sellerId,market:id,side:'SELL',price:100,quantity:2,key:`${id}-sell`})));
  const afterSells=await snapshot();
  for(const result of resting) assert.equal(afterSells.market_core_orders.find(o=>o.id===result.orderId).sequence,1);
  const buys=await concurrentSubmits(ids.map(id=>({userId:buyerId,market:id,side:'BUY',price:110,quantity:2,key:`${id}-buy`})));
  assert.ok(buys.every(r=>r.status==='FILLED'));
  const after=await snapshot();
  const examples={};
  for(const [prefix,table] of Object.entries(families)) {
    const added=after[table].filter(row=>!before[table].some(old=>old.id===row.id));
    assert.equal(added.length,prefix==='EVT'?8:prefix==='TRD'||prefix==='SET'?2:4);
    for(const row of added) assertUuid(prefix,row.id);
    assert.equal(new Set(added.map(r=>r.id)).size,added.length);
    examples[prefix]=added.map(r=>r.id);
  }
  for(const id of ids) {
    assert.deepEqual(after.market_core_counters.find(c=>c.market_id===id),{
      market_id:id,order_seq:2,order_n:2,reservation_n:2,trade_n:1,settlement_n:1,event_n:4,
    });
    const tr=after.market_core_trades.find(tr=>tr.market_id===id);
    assert.equal(tr.quantity,2);assert.equal(tr.price,100);assert.equal(tr.notional,200);
    const set=after.market_core_settlements.find(s=>s.trade_id===tr.id);
    assert.equal(set.idempotency_key,`settlement-${tr.id}`);
    assert.equal(set.status,'AWAITING_DEVNET_SETTLEMENT');
    assert.deepEqual(receipt(after,'match',tr.id),{ok:true,tradeId:tr.id});
    assert.ok(after.market_core_events.some(e=>e.metadata.tradeId===tr.id));
  }
  assert.deepEqual(after.registrar_registered_ownership,before.registrar_registered_ownership);
  t.diagnostic(JSON.stringify({syntheticUuidExamples:examples}));
});
scenario('same-market concurrent crossings preserve locks, quantities, reserves and unique local sequence',async()=>{
  const id='MKT-MC01-SAME';const instrument=await freshMarket(id);
  const resting=await marketSubmit(seller,id,'SELL',100,3,'same-resting');
  const before=await snapshot();
  await concurrentSubmits([1,2].map(n=>({userId:buyerId,market:id,side:'BUY',price:110,quantity:2,key:`same-buy-${n}`})));
  const after=await snapshot();const orders=after.market_core_orders.filter(o=>o.market_id===id);
  const trades=after.market_core_trades.filter(tr=>tr.market_id===id);
  assert.deepEqual(orders.map(o=>o.sequence).sort((a,b)=>a-b),[1,2,3]);
  assert.equal(trades.reduce((sum,tr)=>sum+tr.quantity,0),3);
  assert.equal(orders.find(o=>o.id===resting.orderId).filled_quantity,3);
  for(const o of orders) assert.equal(o.filled_quantity+o.remaining_quantity,o.original_quantity);
  assert.equal(orders.filter(o=>o.side==='BUY').reduce((n,o)=>n+o.remaining_quantity,0),1);
  assert.equal(after.market_core_reservations.filter(r=>r.market_id===id).length,3);
  assert.equal(after.market_core_holdings.find(h=>h.instrument_id===instrument&&h.participant_id==='INVESTOR-0001').reserved_for_orders,3);
  assert.equal(after.market_core_holdings.find(h=>h.instrument_id===instrument&&h.participant_id==='GRAIN-DESK').pending_in,3);
  assert.equal(cash(after,'GRAIN-DESK').reserved-cash(before,'GRAIN-DESK').reserved,410);
  assert.equal(cash(before,'GRAIN-DESK').available-cash(after,'GRAIN-DESK').available,410);
  for(const tr of trades) {
    assert.equal(tr.price,100);assert.equal(tr.status,'AWAITING_DEVNET_SETTLEMENT');
    assert.equal(after.market_core_settlements.filter(s=>s.trade_id===tr.id).length,1);
  }
  assert.deepEqual(after.registrar_registered_ownership,before.registrar_registered_ownership);
});
scenario('concurrent same-key submission returns one UUID and one committed set of effects',async()=>{
  const id='MKT-MC01-REPLAY';await freshMarket(id);const before=await snapshot();
  const results=await concurrentSubmits([1,2].map(()=>({userId:sellerId,market:id,side:'SELL',price:100,quantity:1,key:'same-concurrent-key'})));
  assert.deepEqual(results[0],results[1]);const after=await snapshot();
  for(const table of ['market_core_orders','market_core_reservations','market_core_events','market_core_idempotency']) {
    assert.equal(after[table].length,before[table].length+1);
  }
  assert.equal(after.market_core_counters.find(c=>c.market_id===id).order_seq,1);
  assert.deepEqual(await marketSubmit(seller,id,'SELL',100,1,'same-concurrent-key'),results[0]);
  assert.deepEqual(await snapshot(),after);
});
scenario('price then local sequence, never random UUID order, determines resting fills',async()=>{
  const id='MKT-MC01-PRIORITY';await freshMarket(id);
  const expensive=await marketSubmit(seller,id,'SELL',105,1,'priority-expensive');
  const early=await marketSubmit(seller,id,'SELL',100,1,'priority-early');
  const late=await marketSubmit(seller,id,'SELL',100,1,'priority-late');
  const buy1=await marketSubmit(buyer,id,'BUY',110,1,'priority-buy1');
  let state=await snapshot();
  assert.equal(state.market_core_trades.find(t=>t.buy_order_id===buy1.orderId).sell_order_id,early.orderId);
  const buy2=await marketSubmit(buyer,id,'BUY',110,1,'priority-buy2');
  state=await snapshot();
  assert.equal(state.market_core_trades.find(t=>t.buy_order_id===buy2.orderId).sell_order_id,late.orderId);
  assert.equal(state.market_core_orders.find(o=>o.id===expensive.orderId).status,'OPEN');
  assert.ok(state.market_core_trades.filter(t=>t.market_id===id).every(t=>t.price===100));
});
scenario('all new IDs and references remain intact and no unexpected effective allocator survives',async()=>{
  const state=await snapshot();
  for(const [prefix,table] of Object.entries(families)) {
    const generated=state[table].filter(r=>!r.id.startsWith(`${prefix}-SEED-`));
    for(const row of generated) assertUuid(prefix,row.id);
    assert.equal(new Set(state[table].map(r=>r.id)).size,state[table].length);
  }
  for(const s of state.market_core_settlements) assert.ok(state.market_core_trades.some(tr=>tr.id===s.trade_id));
  for(const r of state.market_core_reservations) assert.ok(state.market_core_orders.some(o=>o.id===r.order_id));
  for(const tr of state.market_core_trades) {
    assert.ok(state.market_core_orders.some(o=>o.id===tr.buy_order_id));
    assert.ok(state.market_core_orders.some(o=>o.id===tr.sell_order_id));
  }
  const current=await definitions();
  assert.equal(current.filter(f=>f.prosrc.includes('gen_random_uuid()')).length,3);
  assert.equal(current.some(f=>/lpad\([^)]*::text/.test(f.prosrc)),false);
});

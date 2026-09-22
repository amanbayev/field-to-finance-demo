// MC-04 acceptance: full ordered chain, real competing connections, no remote transport.
import assert from 'node:assert/strict';
import { assertFunctionsPreserved } from './mc04-compatibility.mjs';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, appendFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { before, after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (!process.env.GP01_EMBEDDED_POSTGRES_MODULE?.startsWith('/')) throw new Error('Absolute GP01_EMBEDDED_POSTGRES_MODULE required');
const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.GP01_EMBEDDED_POSTGRES_MODULE).href);
const directory = await mkdtemp('/private/tmp/mc04-postgres-');
const logs = await mkdtemp('/private/tmp/mc04-sql-logs-');
const writes = [], clients = [];
const pg = new EmbeddedPostgres({ databaseDir: join(directory,'data'), user:'postgres', password:randomUUID(),
  port:5432, persistent:true, createPostgresUser:false, initdbFlags:['--encoding=UTF8'], postgresFlags:['-h','','-k',directory],
  onLog(message) { writes.push(appendFile(join(logs,'server.log'),`${message}\n`)); },
  onError(message) { writes.push(appendFile(join(logs,'server.log'),`${message}\n`)); } });
const migrations = new URL('../migrations/',import.meta.url);
const migration = '20260922043414_mc04_concrete_instrument_closed_market_roots.sql';
const legacy = 'MKT-WHEAT-2027-DEMO-KZT';
const privileges = ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
let db, started = false, prior, priorFunctions, priorACL, priorDefaults, runA, runB, version, alternateVersion, buyer, seller;
async function connection(role, user) {
  const c = pg.getPgClient('postgres',directory); await c.connect(); clients.push(c);
  await c.query("set statement_timeout='15s'");
  if (role) await c.query(`set role ${role}`); // Closed synthetic roles only.
  if (user) await c.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  return c;
}
async function snapshot() {
  const result = {};
  for (const {schemaname,tablename} of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','private','auth','storage') order by 1,2")).rows) {
    result[`${schemaname}.${tablename}`] = (await db.query(`select to_jsonb(t) as row from ${schemaname}.${tablename} t order by to_jsonb(t)::text`)).rows.map(r=>r.row);
  }
  return result;
}
async function functions() {
  return (await db.query("select p.oid,pg_get_functiondef(p.oid) as definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' order by p.oid")).rows;
}
async function org(run = null) {
  return (await db.query("insert into public.organizations(slug,name,type,run_id) values($1,'Synthetic issuer','ISSUER',$2) returning id",[randomUUID(),run])).rows[0].id;
}
async function sealed(id) { return (await db.query('select run_id,market_identity_sealed from public.organizations where id=$1',[id])).rows[0]; }
async function instrument(issuer, run = null, c = db, v = version) {
  return (await c.query("select * from private.mc04_create_instrument($1,$2,$3,'SAME','Synthetic instrument','ASSET_TOKEN')",[issuer,v,run])).rows[0];
}
async function market(id, book = 'PRIMARY', c = db, asset = 'SYNTH-QUOTE') {
  return (await c.query('select * from private.mc04_create_closed_market($1,$2,$3,$4)',[id,asset,asset,book])).rows[0];
}
async function compound(issuer, run = null, c = db, book = 'PRIMARY') {
  return (await c.query("select * from private.mc04_create_instrument_and_market($1,$2,$3,'SAME','Synthetic instrument','ASSET_TOKEN','SYNTH-QUOTE','Synthetic quote',$4)",[issuer,version,run,book])).rows[0];
}
async function unchanged(action, error) { const before = await snapshot(); await assert.rejects(action,error); assert.deepEqual(await snapshot(),before); }
async function probe(body) { await db.query('begin'); try { await body(); } finally { await db.query('rollback'); } }
async function waitForLock(c) {
  for (let n=0;n<400;n++) {
    if ((await db.query('select wait_event_type from pg_stat_activity where pid=$1',[c.processID])).rows[0]?.wait_event_type==='Lock') return;
    await delay(10);
  }
  assert.fail('Competing native connection never waited for lock');
}
async function actor(participant, role, type) {
  const user = randomUUID(); await db.query('insert into auth.users(id) values($1)',[user]);
  const id = await org(); await db.query('update public.organizations set type=$2, external_investor_ref=$3 where id=$1',[id,type,participant]);
  const mem = (await db.query('insert into public.memberships(user_id,organization_id) values($1,$2) returning id',[user,id])).rows[0].id;
  await db.query('insert into public.membership_roles(membership_id,role_id) values($1,$2)',[mem,role]);
  await db.query('insert into public.session_contexts(principal_user_id,active_organization_id) values($1,$2)',[user,id]);
  return connection('authenticated',user);
}
async function submit(c, id, side = 'BUY', key = randomUUID()) {
  return (await c.query('select public.market_core_submit_limit_order($1,$2,100000,1,$3) as result',[id,side,key])).rows[0].result;
}

before(async()=> {
  await pg.initialise(); await pg.start(); started=true; db=await connection();
  const settings=(await db.query("select current_setting('server_version') as version,current_setting('server_encoding') as encoding,current_setting('listen_addresses') as listen,current_setting('unix_socket_directories') as socket")).rows[0];
  assert.match(settings.version,/^18\.4/); assert.equal(settings.encoding,'UTF8'); assert.equal(settings.listen,''); assert.equal(settings.socket,directory);
  assert.equal((await stat(directory)).mode & 0o077,0);
  console.log('MC-04 native PostgreSQL',settings,'logs',logs);
  await db.query(`create role anon; create role authenticated; create role service_role inherit nosuperuser bypassrls; create role mc04_public_only;
    alter default privileges for role postgres in schema public grant all on tables to service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text);`);
  const files=(await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort();
  assert.equal(files.at(-1),migration); assert.equal(files.length,22);
  for (const f of files.slice(0,-1)) await db.query(await readFile(new URL(f,migrations),'utf8'));
  prior=await snapshot(); priorFunctions=await functions();
  priorACL=(await db.query("select oid,relacl from pg_class where relnamespace in ('public'::regnamespace,'private'::regnamespace) order by oid")).rows;
  await db.query(`alter default privileges for role postgres in schema public grant all on tables to public,anon,authenticated,service_role;
    alter default privileges for role postgres in schema private grant execute on functions to public,anon,authenticated,service_role;`);
  priorDefaults=(await db.query('select * from pg_default_acl order by oid')).rows;
  await db.query(await readFile(new URL(migration,migrations),'utf8'));
  console.log('Full ordered migration chain:',files.length);
},{timeout:60000});
after(async()=> {
  try { await Promise.all(clients.map(c=>c.end())); }
  finally { if(started) await pg.stop(); await Promise.all(writes); await rm(directory,{recursive:true,force:true}); console.log('MC-04 own cluster stopped/removed; logs',logs); }
});

test('migration creates no instruments/markets/versions, changes only the exact submit veto, no old grant/default',async()=> {
  const after=await snapshot(); assert.deepEqual(after['public.market_core_instruments'],[]);
  for (const [table,rows] of Object.entries(prior)) assert.deepEqual(after[table],table==='public.market_core_markets' ? rows.map(r=>({...r,instrument_ref:null,book_key:null})) : rows,table);
  const current=await functions(); assertFunctionsPreserved(current,priorFunctions,true);
  const acl=(await db.query("select oid,relacl from pg_class where relnamespace in ('public'::regnamespace,'private'::regnamespace) order by oid")).rows;
  for(const row of priorACL) assert.deepEqual(acl.find(r=>r.oid===row.oid),row);
  assert.deepEqual((await db.query('select * from pg_default_acl order by oid')).rows,priorDefaults);
});

test('RLS, exact roots/FKs, no market run, no symbol uniqueness and hostile default grants removed',async()=> {
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.market_core_instruments'::regclass")).rows[0].relrowsecurity,true);
  const cols=(await db.query("select column_name from information_schema.columns where table_name='market_core_instruments' order by ordinal_position")).rows.map(r=>r.column_name);
  assert.deepEqual(cols,['id','issuer_organization_id','protocol_version_id','run_id','symbol','name','instrument_type','status','created_at','created_by']);
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='market_core_markets' and column_name='run_id'")).rows[0].n,0);
  const fks=(await db.query("select conname,confupdtype,confdeltype,convalidated from pg_constraint where contype='f' and (conrelid='public.market_core_instruments'::regclass or conname='market_core_markets_instrument_ref_fkey')")).rows;
  assert.equal(fks.length,4); for(const fk of fks) { assert.equal(fk.confupdtype,'r'); assert.equal(fk.confdeltype,'r'); assert.equal(fk.convalidated,true); }
  for (const role of ['mc04_public_only','anon','authenticated','service_role']) {
    for (const p of privileges) assert.equal((await db.query("select has_table_privilege($1,'public.market_core_instruments',$2) allowed",[role,p])).rows[0].allowed,false,`${role} ${p}`);
    const funcs=(await db.query("select p.proname,p.prosecdef,p.proconfig,has_function_privilege($1,p.oid,'execute') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'mc04_%'",[role])).rows;
    assert.equal(funcs.length,10); for(const f of funcs) { assert.equal(f.allowed,false,f.proname); assert.deepEqual(f.proconfig,['search_path=""']); assert.equal(f.prosecdef,f.proname==='mc04_legacy_execution_only'); }
  }
});

test('missing exact version refuses even the known catalog ID and rolls back its seal; explicit test import only',async()=> {
  const issuer=await org();
  await unchanged(()=>instrument(issuer,null,db,'F2F-V1.1'),{code:'23503'});
  assert.equal((await sealed(issuer)).market_identity_sealed,false);
  assert.deepEqual((await db.query('select * from public.protocol_version_records')).rows,[]);
  const imported=(await db.query("select * from private.import_known_protocol_version('F2F-V1.1')")).rows[0];
  version=imported.id;
  const synthetic={...imported.snapshot,id:'SYNTH-'+randomUUID()};
  alternateVersion=(await db.query('select * from private.record_protocol_version($1,$2,$3,$4)',[synthetic.id,synthetic.protocolId,synthetic,imported.provenance])).rows[0].id;
  const operator=randomUUID(); await db.query('insert into auth.users(id) values($1)',[operator]);
  const runs=(await db.query("insert into public.demo_reset_run_instances(operator_principal_user_id,environment_name,dataset_id,database_ref,lifecycle_status) values($1,'local','synthetic-a','synthetic','CURRENT'),($1,'local','synthetic-b','synthetic','CURRENT') returning id",[operator])).rows;
  [runA,runB]=runs.map(r=>r.id);
  buyer=await actor('GRAIN-DESK','TRADER','TRADING_FIRM'); seller=await actor('INVESTOR-0001','INVESTOR','INVESTMENT_FUND');
});

test('equal symbol/version across runs and within one run creates distinct permanent identities; NON_RUN works',async()=> {
  const a=await org(runA), b=await org(runB), non=await org();
  const roots=[await instrument(a,runA),await instrument(b,runB),await instrument(a,runA),await instrument(non)];
  assert.equal(new Set(roots.map(r=>r.id)).size,4);
  for (const r of roots) {
    assert.match(r.id,/^INS-[0-9a-f-]{36}$/); assert.equal(r.status,'STRUCTURING'); assert.equal(r.symbol,'SAME'); assert.equal(r.protocol_version_id,version);
    assert.equal(r.created_by,'postgres'); assert.equal((await sealed(r.issuer_organization_id)).market_identity_sealed,true);
    assert.equal((await db.query('select count(*)::int n from public.market_core_participants where organization_id=$1',[r.issuer_organization_id])).rows[0].n,0);
  }
  assert.deepEqual(roots.map(r=>r.run_id),[runA,runB,runA,null]);
  const before=roots[0]; await db.query("update public.market_core_instruments set symbol='RENAMED',name='New label' where id=$1",[before.id]);
  assert.equal((await db.query('select id from public.market_core_instruments where id=$1',[before.id])).rows[0].id,before.id);
});

test('different runs, Run/NULL and NULL/Run refuse without unjustified sealing',async()=> {
  for (const [issuerRun,instrumentRun] of [[runA,runB],[runA,null],[null,runA]]) {
    const issuer=await org(issuerRun);
    await unchanged(()=>instrument(issuer,instrumentRun),/issuer_context_mismatch/);
    assert.equal((await sealed(issuer)).market_identity_sealed,false);
  }
  await unchanged(()=>instrument(randomUUID()),/market_core_organization_unavailable/);
});

test('one instrument supports multiple books/assets, exact duplicate conflicts with no partial counters',async()=> {
  const i=await instrument(await org()); const a=await market(i.id), b=await market(i.id,'SECOND'), c=await market(i.id,'PRIMARY',db,'SECOND-QUOTE');
  assert.equal(new Set([a.id,b.id,c.id]).size,3);
  for(const m of [a,b,c]) {
    assert.match(m.id,/^MKT-[0-9a-f-]{36}$/); assert.equal(m.instrument_ref,i.id); assert.equal(m.instrument_id,i.id);
    assert.equal(m.phase,'CLOSED'); assert.equal(m.transacting,false); assert.equal(m.matching_enabled,false); assert.equal(m.settlement_enabled,false);
    const counter=(await db.query('select * from public.market_core_counters where market_id=$1',[m.id])).rows[0];
    assert.equal(counter.market_id,m.id); for (const [key,val] of Object.entries(counter)) if(key!=='market_id') assert.equal(val,'0');
  }
  await unchanged(()=>market(i.id),{code:'23505'});
  await unchanged(()=>market('INS-'+randomUUID()),{code:'23503'});
});

for (const mode of ['owner','definer']) test(`${mode}: immutable root fields, bridge presence, CLOSED configuration and deletion/truncation`,async()=> {
  const issuer=await org(); const i=await instrument(issuer); const other=await instrument(await org()); const m=await market(i.id);
  if(mode==='definer') await db.query("create function private.mc04_test_dml(s text) returns void language plpgsql security definer set search_path='' as $$begin execute s; end$$");
  const run=sql=>mode==='owner'?db.query(sql):db.query('select private.mc04_test_dml($1)',[sql]);
  const changes={id:`'INS-${randomUUID()}'`,issuer_organization_id:`'${other.issuer_organization_id}'`,protocol_version_id:`'${alternateVersion}'`,run_id:`'${runA}'`,instrument_type:"'PROTOCOL_INVESTMENT'",created_by:"'pretend'",created_at:"created_at + interval '1 second'",status:"'ISSUED'"};
  for(const [key,value] of Object.entries(changes)) await unchanged(()=>run(`update public.market_core_instruments set ${key}=${value} where id='${i.id}'`),/immutable|check constraint|foreign key/);
  const config={id:`'MKT-${randomUUID()}'`,instrument_ref:`'${other.id}'`,instrument_id:"'OTHER'",book_key:"'SECOND'",settlement_asset_id:"'OTHER'",settlement_asset_label:"'Changed'",settlement_has_monetary_value:'true',market_type:"'OTHER'",allowed_order_types:"array['OTHER']",whole_quantity_only:'false',created_at:"created_at + interval '1 second'"};
  for(const [key,value] of Object.entries(config)) await unchanged(()=>run(`update public.market_core_markets set ${key}=${value} where id='${m.id}'`),/immutable|check constraint|foreign key/);
  for(const clause of ["phase='SECONDARY_OPEN'","transacting=true","matching_enabled=true","settlement_enabled=true","demonstrator_status='DEMO_OPEN'","instrument_ref=null,book_key=null"]) await unchanged(()=>run(`update public.market_core_markets set ${clause} where id='${m.id}'`),/immutable|check constraint/);
  await unchanged(()=>run(`update public.market_core_markets set instrument_ref='${i.id}',instrument_id='${i.id}',book_key='ADOPT',phase='CLOSED',transacting=false,matching_enabled=false,settlement_enabled=false,demonstrator_status='DEMO_CLOSED' where id='${legacy}'`),/immutable|check constraint/);
  await unchanged(()=>run(`insert into public.market_core_markets(id,instrument_id,phase,settlement_asset_id) values('NEW-UNASSIGNED','UNKNOWN','CLOSED','QUOTE')`),/requires_instrument/);
  for(const sql of [`delete from public.market_core_instruments where id='${i.id}'`, 'truncate public.market_core_instruments cascade', `delete from public.market_core_markets where id='${m.id}'`, 'truncate public.market_core_markets cascade',`delete from public.market_core_counters where market_id='${m.id}'`,'truncate public.market_core_counters',`update public.market_core_counters set market_id='${legacy}' where market_id='${m.id}'`]) await unchanged(()=>run(sql),/preserved|foreign key|duplicate key/);
  await unchanged(()=>run(`delete from public.organizations where id='${issuer}'`),{code:'23001'});
  await run(`update public.market_core_markets set phase=phase where id='${m.id}'`);
  await run(`update public.market_core_instruments set id=id where id='${i.id}'`);
});

test('AFTER guards reject changes smuggled by BEFORE UPDATE outside the target list',async()=> {
  const i=await instrument(await org()); const m=await market(i.id);
  for(const [table,body,sql] of [
    ['market_core_instruments',`new.run_id:='${runA}';`,`update public.market_core_instruments set name=name where id='${i.id}'`],
    ['market_core_instruments',"new.created_by:='spoof';",`update public.market_core_instruments set name=name where id='${i.id}'`],
    ['market_core_markets',"new.book_key:='SNEAK';",`update public.market_core_markets set phase=phase where id='${m.id}'`],
    ['market_core_markets',"new.instrument_ref:=null; new.book_key:=null;",`update public.market_core_markets set phase=phase where id='${m.id}'`],
    ['organizations',`new.run_id:='${runA}';`,`update public.organizations set name=name where id='${i.issuer_organization_id}'`],
  ]) await probe(async()=> {
    await db.query(`create function private.mc04_sneak() returns trigger language plpgsql as $$begin ${body} return new; end$$;
      create trigger z_mc04_sneak before update on public.${table} for each row execute function private.mc04_sneak()`);
    await assert.rejects(()=>db.query(sql),/immutable|write-once/);
  });
});

test('insert primitives validate final rows after BEFORE redirection/suppression and roll back every seal',async()=> {
  const requested=await org(), redirected=await org(), other=await instrument(await org());
  for(const [table,body,error] of [
    ['market_core_instruments',`new.issuer_organization_id:='${redirected}';`,/context_mismatch/],
    ['market_core_instruments',`new.issuer_organization_id:='${other.issuer_organization_id}';`,/insert_mismatch/],
    ['market_core_instruments',`new.run_id:='${runA}';`,/context_mismatch/],
    ['market_core_instruments',`new.protocol_version_id:='${alternateVersion}';`,/insert_mismatch/],
    ['market_core_instruments',"new.created_by:='spoof';",/insert_mismatch/],
    ['market_core_instruments',"new.id:='INS-'||gen_random_uuid()::text;",/insert_mismatch/],
    ['market_core_instruments','return null;',/insert_mismatch/],
    ['market_core_markets',`new.instrument_ref:='${other.id}'; new.instrument_id:='${other.id}';`,/insert_mismatch/],
    ['market_core_markets',"new.book_key:='redirected';",/insert_mismatch/],
    ['market_core_markets','return null;',/insert_mismatch/],
    ['market_core_counters','return null;',/counter_creation_failed/],
    ['market_core_counters','new.order_n:=1;',/counter_creation_failed/],
  ]) {
    const before=await snapshot();
    await probe(async()=> {
      await db.query(`create function private.mc04_sneak_insert() returns trigger language plpgsql as $$begin ${body} return new; end$$;
        create trigger z_mc04_sneak before insert on public.${table} for each row execute function private.mc04_sneak_insert()`);
      await assert.rejects(()=>compound(requested),error);
    });
    assert.deepEqual(await snapshot(),before);
    assert.equal((await sealed(requested)).market_identity_sealed,false); assert.equal((await sealed(redirected)).market_identity_sealed,false);
  }
});

test('late counter error and explicit transaction rollback leave no partial roots or seal',async()=> {
  const issuer=await org(); const before=await snapshot();
  await probe(async()=> {
    await db.query("create function private.mc04_late() returns trigger language plpgsql as $$begin raise exception 'mc04_test_late'; end$$; create trigger z_mc04_late after insert on public.market_core_counters for each row execute function private.mc04_late()");
    await assert.rejects(()=>compound(issuer),/mc04_test_late/);
  });
  assert.deepEqual(await snapshot(),before);
  await db.query('begin'); await compound(issuer); await db.query('rollback'); assert.deepEqual(await snapshot(),before);
  await unchanged(()=>compound(issuer,null,db,''),/check constraint/);
});

for(const isolation of ['READ COMMITTED','REPEATABLE READ']) {
  for(const desiredRun of [null,'ASSIGNED']) test(`${isolation}: assignment first; ${desiredRun===null?'NON_RUN rejects':'matching Run succeeds or serializes'}`,async()=> {
    const issuer=await org(), a=await connection(), b=await connection();
    await a.query('begin'); await a.query('update public.organizations set run_id=$2 where id=$1',[issuer,runA]);
    await b.query(`begin isolation level ${isolation}`);
    const pending=instrument(issuer,desiredRun===null?null:runA,b).then(value=>({value}),error=>({error}));
    await waitForLock(b); await a.query('commit'); const result=await pending;
    if(isolation==='REPEATABLE READ') { assert.equal(result.error?.code,'40001'); await b.query('rollback'); }
    else if(desiredRun===null) { assert.match(result.error?.message,/context_mismatch/); await b.query('rollback'); }
    else { assert.equal(result.value.run_id,runA); await b.query('commit'); }
    assert.deepEqual(await sealed(issuer),{run_id:runA,market_identity_sealed:isolation==='READ COMMITTED'&&desiredRun!==null});
  });
  test(`${isolation}: seal first prevents run assignment; rollback releases the seal`,async()=> {
    for(const commit of [true,false]) {
      const issuer=await org(), a=await connection(), b=await connection();
      await a.query('begin'); await compound(issuer,null,a); await b.query(`begin isolation level ${isolation}`);
      const pending=b.query('update public.organizations set run_id=$2 where id=$1',[issuer,runA]).then(value=>({value}),error=>({error}));
      await waitForLock(b); await a.query(commit?'commit':'rollback'); const result=await pending;
      if(commit) { assert.equal(result.error?.code,isolation==='REPEATABLE READ'?'40001':'P0001'); await b.query('rollback'); }
      else { assert.ok(result.value); await b.query('commit'); }
      assert.deepEqual(await sealed(issuer),{run_id:commit?null:runA,market_identity_sealed:commit});
    }
  });
  for(const presealed of [false,true]) test(`${isolation}: same issuer concurrent instrument creation (${presealed?'sealed':'unsealed'})`,async()=> {
    const issuer=await org(); if(presealed) await db.query('select private.market_core_seal_organization($1)',[issuer]);
    const a=await connection(), b=await connection(); await a.query('begin'); await b.query(`begin isolation level ${isolation}`);
    const first=await instrument(issuer,null,a); const pending=instrument(issuer,null,b).then(value=>({value}),error=>({error}));
    await waitForLock(b); await a.query('commit'); const second=await pending;
    if(isolation==='REPEATABLE READ') { assert.equal(second.error?.code,'40001'); await b.query('rollback'); }
    else { assert.notEqual(second.value.id,first.id); await b.query('commit'); }
    assert.equal((await db.query('select count(*)::int n from public.market_core_instruments where issuer_organization_id=$1',[issuer])).rows[0].n,isolation==='REPEATABLE READ'?1:2);
  });
  for(const commit of [true,false]) test(`${isolation}: competing identical book; first ${commit?'commits':'rolls back'}`,async()=> {
    const i=await instrument(await org()), a=await connection(),b=await connection();
    await a.query('begin'); await b.query(`begin isolation level ${isolation}`);
    const first=await market(i.id,'SAME',a); const pending=market(i.id,'SAME',b).then(value=>({value}),error=>({error}));
    await waitForLock(b); await a.query(commit?'commit':'rollback'); const second=await pending;
    if(commit) { assert.equal(second.error?.code,'23505'); await b.query('rollback'); }
    else { assert.notEqual(second.value.id,first.id); await b.query('commit'); }
    const rows=(await db.query('select m.id,c.market_id from public.market_core_markets m join public.market_core_counters c on c.market_id=m.id where m.instrument_ref=$1',[i.id])).rows;
    assert.deepEqual(rows,[{id:commit?first.id:second.value.id,market_id:commit?first.id:second.value.id}]);
  });
}

test('runtime roles cannot create/change roots despite existing service grants; old arbitrary-ID submit stays closed',async()=> {
  const issuer=await org(), i=await instrument(issuer), m=await market(i.id);
  for(const role of ['mc04_public_only','anon','authenticated','service_role']) {
    const c=await connection(role);
    for(const action of [()=>instrument(issuer,null,c),()=>market(i.id,'RUNTIME',c),()=>compound(issuer,null,c),
      ()=>c.query('select * from public.market_core_instruments'),()=>c.query("update public.market_core_instruments set name='Changed'"),
      ()=>c.query('delete from public.market_core_instruments'),()=>c.query('truncate public.market_core_instruments cascade'),
      ()=>c.query('update public.market_core_markets set phase=phase where id=$1',[m.id]),
      ()=>c.query("insert into public.market_core_markets select 'MKT-'||gen_random_uuid()::text,instrument_id,phase,transacting,matching_enabled,settlement_enabled,demonstrator_status,settlement_asset_id,settlement_asset_label,settlement_has_monetary_value,market_type,allowed_order_types,whole_quantity_only,created_at,instrument_ref,'RUNTIME' from public.market_core_markets where id=$1",[m.id])]) await unchanged(action,{code:'42501'});
  }
  const before=await snapshot();
  for(const key of [randomUUID(),'seed-submit-ORD-SEED-BUY-001']) {
    const result=await submit(buyer,m.id,'BUY',key); assert.equal(result.ok,false); assert.equal(result.error,'MARKET_CLOSED');
  }
  assert.deepEqual(await snapshot(),before);
});

test('direct orders, trade DML and old private fill cannot attach modern roots through either market or instrument',async()=> {
  const i=await instrument(await org()), m=await market(i.id);
  for(const [targetMarket,targetInstrument] of [[m.id,i.id],[m.id,'WHEAT-2027'],[legacy,i.id]]) {
    await unchanged(()=>db.query(`insert into public.market_core_orders(id,market_id,instrument_id,participant_id,side,order_type,price,original_quantity,remaining_quantity,filled_quantity,status,sequence,idempotency_key)
      values($1,$2,$3,'GRAIN-DESK','BUY','LIMIT',1,1,1,0,'OPEN',999,$1)`,['ORD-'+randomUUID(),targetMarket,targetInstrument]),/execution_not_available/);
    await unchanged(()=>db.query('update public.market_core_trades set market_id=$1,instrument_id=$2 where id=$3',[targetMarket,targetInstrument,'TRD-SEED-001']),/execution_not_available/);
  }
  // Reopen only local seed rows in a rolled-back fixture transaction, so the
  // old helper reaches the new trade guard instead of an unrelated overfill CHECK.
  const before=await snapshot();
  await probe(async()=> {
    await db.query("update public.market_core_orders set original_quantity=3,remaining_quantity=1,status='OPEN' where id in ('ORD-SEED-BUY-001','ORD-SEED-SELL-001')");
    await assert.rejects(()=>db.query(`select private.market_core_apply_fill(
      jsonb_populate_record(null::public.market_core_orders,to_jsonb(b)||jsonb_build_object('market_id',$1::text)),
      jsonb_populate_record(null::public.market_core_orders,to_jsonb(s)||jsonb_build_object('market_id',$1::text)),1)
      from public.market_core_orders b, public.market_core_orders s where b.id='ORD-SEED-BUY-001' and s.id='ORD-SEED-SELL-001'`,[m.id]),/execution_not_available/);
  });
  assert.deepEqual(await snapshot(),before);
});

test('legacy market still submits, matches and cancels; matching never changes Registrar owned amounts',async()=> {
  const before=(await snapshot())['public.registrar_registered_ownership'];
  const sold=await submit(seller,legacy,'SELL'); assert.equal(sold.ok,true);
  const bought=await submit(buyer,legacy,'BUY'); assert.equal(bought.ok,true);
  const trade=(await db.query('select * from public.market_core_trades where buy_order_id=$1',[bought.orderId])).rows[0];
  assert.equal(trade.status,'AWAITING_DEVNET_SETTLEMENT'); assert.equal(trade.quantity,'1');
  const open=await submit(buyer,legacy); assert.equal(open.ok,true);
  const cancelled=(await buyer.query('select public.market_core_cancel_order($1,$2) result',[open.orderId,randomUUID()])).rows[0].result;
  assert.equal(cancelled.ok,true);
  assert.deepEqual((await snapshot())['public.registrar_registered_ownership'],before);
  assert.equal((await db.query('select instrument_ref from public.market_core_markets where id=$1',[legacy])).rows[0].instrument_ref,null);
});

test('simultaneous issuer creators lock before FK checks, without a lock-upgrade deadlock',async()=> {
  const issuer=await org(), a=await connection(), b=await connection();
  // Put both FK checks ahead of an AFTER barrier if sealing happens too late.
  // With BEFORE sealing the second creator waits on the issuer before its FK.
  await db.query(`create function private.mc04_fk_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(740004); return new; end$$;
    create trigger aaa_mc04_fk_barrier after insert on public.market_core_instruments for each row execute function private.mc04_fk_barrier()`);
  await db.query('select pg_advisory_lock(740004)');
  try {
    await a.query('begin'); await b.query('begin');
    const finish=async(c)=>{try { const value=await instrument(issuer,null,c); await c.query('commit'); return {value}; } catch(error) { await c.query('rollback'); return {error}; }};
    const pa=finish(a); await waitForLock(a); const pb=finish(b); await waitForLock(b);
    await db.query('select pg_advisory_unlock(740004)');
    const results=await Promise.all([pa,pb]);
    for(const result of results) { assert.equal(result.error,undefined); assert.ok(result.value.id); }
    assert.notEqual(results[0].value.id,results[1].value.id);
  } finally {
    await db.query('select pg_advisory_unlock(740004)');
    await db.query('drop trigger aaa_mc04_fk_barrier on public.market_core_instruments; drop function private.mc04_fk_barrier()');
  }
});

test('direct owner INSERT seals an issuer without participant; existing valid version/run cannot replace identity',async()=> {
  const issuer=await org(runA);
  const i=(await db.query("insert into public.market_core_instruments(issuer_organization_id,protocol_version_id,run_id,symbol,name,instrument_type) values($1,$2,$3,'DIRECT','Synthetic direct','PROTOCOL_INVESTMENT') returning *",[issuer,version,runA])).rows[0];
  assert.match(i.id,/^INS-[0-9a-f-]{36}$/); assert.equal((await sealed(issuer)).market_identity_sealed,true);
  assert.equal((await db.query('select count(*)::int n from public.market_core_participants where organization_id=$1',[issuer])).rows[0].n,0);
  for(const run of [null,runB]) await unchanged(()=>db.query('update public.market_core_instruments set run_id=$2 where id=$1',[i.id,run]),/identity_immutable/);
  await unchanged(()=>db.query('update public.market_core_instruments set protocol_version_id=$2 where id=$1',[i.id,alternateVersion]),/identity_immutable/);
  await unchanged(()=>db.query('delete from public.demo_reset_run_instances where id=$1',[runA]),/foreign key/);
});

test('BEFORE trigger cannot adopt a legacy row even if it also closes every operational flag',async()=> {
  const i=await instrument(await org());
  await probe(async()=> {
    await db.query(`create function private.mc04_adopt() returns trigger language plpgsql as $$begin
      new.instrument_ref:='${i.id}'; new.instrument_id:='${i.id}'; new.book_key:='ADOPT';
      new.phase:='CLOSED'; new.transacting:=false; new.matching_enabled:=false; new.settlement_enabled:=false; new.demonstrator_status:='DEMO_CLOSED'; return new; end$$;
      create trigger z_mc04_adopt before update on public.market_core_markets for each row execute function private.mc04_adopt()`);
    await assert.rejects(()=>db.query('update public.market_core_markets set phase=phase where id=$1',[legacy]),/configuration_immutable/);
  });
});

// MC-03: complete ordered migration chain, disposable native PostgreSQL only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { before, after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (!process.env.GP01_EMBEDDED_POSTGRES_MODULE?.startsWith('/')) throw new Error('Absolute GP01_EMBEDDED_POSTGRES_MODULE required');
const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.GP01_EMBEDDED_POSTGRES_MODULE).href);
const directory = await mkdtemp('/private/tmp/mc03-postgres-');
const logs = await mkdtemp('/private/tmp/mc03-sql-logs-');
const logWrites = [];
const pg = new EmbeddedPostgres({ databaseDir: join(directory,'data'), user:'postgres', password:randomUUID(),
  port:5432, persistent:true, createPostgresUser:false, initdbFlags:['--encoding=UTF8'], postgresFlags:['-h','','-k',directory],
  onLog(message) { logWrites.push(appendFile(join(logs,'server.log'),`${message}\n`)); },
  onError(message) { logWrites.push(appendFile(join(logs,'server.log'),`${message}\n`)); } });
const migrations = new URL('../migrations/',import.meta.url);
const migration = '20260910045213_mc03_immutable_protocol_version_reference.sql';
const sql = await readFile(new URL(migration,migrations),'utf8');
// The unit suite independently compares this complete SQL literal with catalog.protocolVersions.
const known = JSON.parse(sql.split('$mc03_snapshot$')[1]);
const provenance = JSON.parse(sql.split('$mc03_provenance$')[1]);
const clients=[];
let db, started=false, previousRows, previousFunctions;
const privileges=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
async function connection(role) {
  const c=pg.getPgClient('postgres',directory); await c.connect(); clients.push(c);
  await c.query("set statement_timeout='15s'");
  if(role) await c.query(`set role ${role}`); // Closed test-owned roles only.
  return c;
}
function version() { return {...structuredClone(known),id:`SYNTH-${randomUUID()}`,protocolId:'SYNTHETIC'}; }
async function record(s,c=db,p=provenance) {
  return (await c.query('select * from private.record_protocol_version($1,$2,$3,$4)',[s.id,s.protocolId,JSON.stringify(s),JSON.stringify(p)])).rows[0];
}
async function importKnown(c=db) {
  return (await c.query("select * from private.import_known_protocol_version('F2F-V1.1')")).rows[0];
}
async function rows() { return (await db.query('select * from public.protocol_version_records order by id')).rows; }
async function businessRows() {
  const result={};
  for(const {schemaname,tablename} of (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','private','auth','storage') and tablename <> 'protocol_version_records' order by 1,2")).rows) {
    result[`${schemaname}.${tablename}`]=(await db.query(`select to_jsonb(t) as row from ${schemaname}.${tablename} t order by to_jsonb(t)::text`)).rows;
  }
  return result;
}
async function functionRows() {
  return (await db.query("select p.oid,pg_get_functiondef(p.oid) as definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' order by p.oid")).rows;
}
async function probe(body) {
  await db.query('begin');
  try { await body(); } finally { await db.query('rollback'); }
}
async function unchanged(action,error) {
  const prior=await rows(); await assert.rejects(action,error); assert.deepEqual(await rows(),prior);
}
async function waitForLock(c) {
  for(let i=0;i<400;i++) {
    if((await db.query('select wait_event_type from pg_stat_activity where pid=$1',[c.processID])).rows[0]?.wait_event_type==='Lock') return;
    await delay(10);
  }
  assert.fail('Competing native PostgreSQL session did not wait for lock');
}
before(async()=> {
  await pg.initialise(); await pg.start(); started=true; db=await connection();
  const settings=(await db.query("select current_setting('server_version') as version,current_setting('listen_addresses') as listen,current_setting('unix_socket_directories') as socket")).rows[0];
  assert.match(settings.version,/^18\.4/); assert.equal(settings.listen,''); assert.equal(settings.socket,directory);
  console.log('MC-03 native PostgreSQL',settings,'logs',logs);
  await db.query(`create role anon; create role authenticated; create role service_role inherit nosuperuser bypassrls; create role mc03_public_only;
    alter default privileges for role postgres in schema public grant all on tables to service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text);`);
  const files=(await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort();
  assert.equal(files.at(-1),migration);
  for(const file of files.slice(0,-1)) await db.query(await readFile(new URL(file,migrations),'utf8'));
  previousRows=await businessRows(); previousFunctions=await functionRows();
  await db.query(`alter default privileges for role postgres in schema public grant all on tables to public,anon,authenticated,service_role;
    alter default privileges for role postgres in schema private grant execute on functions to public,anon,authenticated,service_role;`);
  await db.query(sql);
  console.log('Complete ordered migration chain:',files.length);
},{timeout:60000});
after(async()=> {
  try { await Promise.all(clients.map(c=>c.end())); }
  finally {
    if(started) await pg.stop();
    await Promise.all(logWrites);
    await rm(directory,{recursive:true,force:true});
    console.log('Own cluster stopped/removed; logs retained:',logs);
  }
});

test('additive migration has no automatic import, business mutation or existing function/grant change',async()=> {
  assert.deepEqual(await rows(),[]);
  assert.deepEqual(await businessRows(),previousRows);
  const current=await functionRows();
  for(const f of previousFunctions) assert.deepEqual(current.find(x=>x.oid===f.oid),f);
});

test('full schema and exact effective privileges despite hostile Supabase defaults',async()=> {
  const columns=(await db.query("select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='protocol_version_records' order by ordinal_position")).rows;
  assert.deepEqual(columns.map(c=>[c.column_name,c.data_type,c.is_nullable]),[
    ['id','text','NO'],['protocol_id','text','NO'],['snapshot','jsonb','NO'],['activated_at','text','YES'],['frozen_at','text','YES'],
    ['provenance','jsonb','NO'],['recorded_at','timestamp with time zone','NO'],['recorded_by','text','NO']]);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.protocol_version_records'::regclass")).rows[0].relrowsecurity,true);
  const policy=(await db.query("select cmd,roles::text[] as roles,qual,with_check from pg_policies where tablename='protocol_version_records'")).rows;
  assert.deepEqual(policy,[{cmd:'SELECT',roles:['authenticated'],qual:'true',with_check:null}]);
  for(const role of ['mc03_public_only','anon','authenticated','service_role']) {
    for(const p of privileges) assert.equal((await db.query("select has_table_privilege($1,'public.protocol_version_records',$2) as allowed",[role,p])).rows[0].allowed,role==='authenticated'&&p==='SELECT',`${role} ${p}`);
    const funcs=(await db.query(`select p.proname,has_function_privilege($1,p.oid,'execute') as allowed,p.proconfig,p.prosecdef
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
      and (p.proname like 'protocol_version_%' or p.proname in ('record_protocol_version','import_known_protocol_version'))`,[role])).rows;
    assert.equal(funcs.length,6);
    for(const f of funcs) { assert.equal(f.allowed,false,f.proname); assert.equal(f.prosecdef,false); assert.deepEqual(f.proconfig,['search_path=""']); }
  }
});

test('explicit known import preserves exact full snapshot, null governance and database recording event',async()=> {
  const before=Date.now(), a=await connection(), b=await connection();
  await a.query('begin'); const first=await importKnown(a);
  const pending=importKnown(b); await waitForLock(b); await a.query('commit');
  assert.deepEqual(await pending,first); const after=Date.now();
  assert.equal(first.id,'F2F-V1.1'); assert.equal(first.protocol_id,'F2F'); assert.deepEqual(first.snapshot,known);
  assert.equal(first.activated_at,null); assert.equal(first.frozen_at,null);
  assert.deepEqual(first.provenance,provenance); assert.equal(first.recorded_by,'postgres');
  assert.ok(first.recorded_at.getTime()>=before-1000&&first.recorded_at.getTime()<=after+1000);
  await delay(15); assert.deepEqual(await importKnown(),first);
  assert.deepEqual(await record(known,db,{...provenance,commit:'a'.repeat(40)}),first);
  for(const id of ['WATER-V1','MUSIC-V1','GAMING-V1',null,'']) await unchanged(()=>db.query('select private.import_known_protocol_version($1)',[id]),/source_not_established/);
  assert.deepEqual(await businessRows(),previousRows);
});

test('same identity with any different immutable snapshot field conflicts, never overwrites',async()=> {
  const first=await importKnown();
  const changes={protocolId:'OTHER',displayVersion:'99',state:'RETIRED',activatedAt:'2026-09-10T00:00:00Z',frozenAt:'2026-09-10T00:00:00Z',
    supersedesVersionId:'EARLIER',supersededByVersionId:'LATER',governanceNote:'Different source'};
  for(const [key,value] of Object.entries(changes)) await unchanged(()=>record({...known,[key]:value}),/import_conflict/);
  for(const key of Object.keys(known.rules)) {
    const value=Array.isArray(known.rules[key])?[...known.rules[key],'changed']:'Changed rule';
    await unchanged(()=>record({...known,rules:{...known.rules,[key]:value}}),/import_conflict/);
  }
  assert.deepEqual(await importKnown(),first);
});

test('missing/extra keys, wrong types and invalid dates cannot enter through import or direct owner INSERT',async()=> {
  const bad=[null,[],{},'json', {...known,frozen:false},{...known,frozen:'true'},{...known,id:12},{...known,protocolId:[]},
    {...known,state:'ADMITTED'},{...known,governanceNote:null},{...known,rules:'link'}, {...known,extra:true},
    {...known,activatedAt:'2026-02-30T00:00:00Z'},{...known,frozenAt:'2026-09-10'}, {...known,rules:{...known.rules,modules:[null]}}];
  for(const key of Object.keys(known)) { const s=structuredClone(known); delete s[key]; bad.push(s); }
  for(const key of Object.keys(known.rules)) { const s=structuredClone(known); delete s.rules[key]; bad.push(s); }
  for(const s of bad) {
    await unchanged(()=>db.query('select private.record_protocol_version($1,$2,$3,$4)',['BAD','F2F',s===null?null:JSON.stringify(s),provenance]),/import_invalid/);
    await unchanged(()=>db.query('insert into public.protocol_version_records(id,protocol_id,snapshot,provenance) values($1,$2,$3,$4)',['BAD','F2F',s===null?null:JSON.stringify(s),provenance]),{code:s===null?'23502':'23514'});
  }
  await unchanged(()=>db.query('select private.record_protocol_version($1,$2,$3,$4)',['OTHER','F2F',known,provenance]),/import_invalid/);
  await unchanged(()=>db.query('select private.record_protocol_version($1,$2,$3,$4)',['F2F-V1.1','OTHER',known,provenance]),/import_invalid/);
  for(const p of [null,{},'bad',{...provenance,commit:123},{...provenance,extra:true}]) await unchanged(()=>record(version(),db,p),/import_invalid/);
});

for(const mode of ['owner','definer']) test(`${mode}: identity, full snapshot, governance and provenance immutable; no delete/reinsert`,async()=> {
  const s=version(); const first=await record(s);
  async function execute(statement) {
    if(mode==='owner') return db.query(statement);
    await db.query(`create or replace function private.mc03_mutate() returns void language plpgsql security definer set search_path='' as $fn$ begin ${statement}; end $fn$`);
    return db.query('select private.mc03_mutate()');
  }
  const updates=[`id=id||'-x',snapshot=jsonb_set(snapshot,'{id}',to_jsonb(id||'-x'))`,
    `protocol_id='OTHER',snapshot=jsonb_set(snapshot,'{protocolId}','"OTHER"')`,
    `snapshot=jsonb_set(snapshot,'{rules,riskModel}','"changed"')`,
    `snapshot=jsonb_set(snapshot,'{governanceNote}','"changed"')`,
    `activated_at='2026-09-10T00:00:00Z',snapshot=jsonb_set(snapshot,'{activatedAt}','"2026-09-10T00:00:00Z"')`,
    `frozen_at='2026-09-10T00:00:00Z',snapshot=jsonb_set(snapshot,'{frozenAt}','"2026-09-10T00:00:00Z"')`,
    `provenance=jsonb_set(provenance,'{commit}','"${'a'.repeat(40)}"')`,
    `recorded_at=recorded_at+interval '1 second'`,`recorded_by='another-role'`];
  for(const update of updates) await unchanged(()=>execute(`update public.protocol_version_records set ${update} where id='${s.id}'`),/record_immutable/);
  await execute(`update public.protocol_version_records set id=id,snapshot=snapshot where id='${s.id}'`);
  assert.deepEqual(await record(s),first);
  for(const statement of ['delete from public.protocol_version_records','delete from public.protocol_version_records where false','truncate public.protocol_version_records cascade']) await unchanged(()=>execute(statement),/record_preserved/);
});

for(const timing of ['a','z']) test(`${timing} BEFORE UPDATE cannot smuggle final changes via an untouched column`,async()=> {
  const s=version(); await record(s);
  for(const body of ["new.recorded_at:=new.recorded_at+interval '1 day';","new.snapshot:=jsonb_set(new.snapshot,'{rules,riskModel}','\"smuggled\"');"]) await probe(async()=> {
    await db.query(`create function private.mc03_smuggle() returns trigger language plpgsql as $$begin ${body} return new; end$$;
      create trigger ${timing}_mc03_smuggle before update on public.protocol_version_records for each row execute function private.mc03_smuggle()`);
    await assert.rejects(()=>db.query('update public.protocol_version_records set id=id where id=$1',[s.id]),/record_immutable/);
  });
});

for(const timing of ['a','z']) test(`${timing} BEFORE INSERT cannot redirect requested snapshot, identity or first provenance`,async()=> {
  for(const body of ["new.id:=new.id||'-x'; new.snapshot:=jsonb_set(new.snapshot,'{id}',to_jsonb(new.id));",
    "new.snapshot:=jsonb_set(new.snapshot,'{rules,riskModel}','\"redirected\"');",
    "new.provenance:=jsonb_set(new.provenance,'{commit}','\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"');",
    "new.recorded_by:='redirected';", "new.recorded_at:=new.recorded_at+interval '1 second';", 'return null;']) {
    const prior=await rows();
    await probe(async()=> {
      await db.query(`create function private.mc03_redirect() returns trigger language plpgsql as $$begin ${body} return new; end$$;
        create trigger ${timing}_mc03_redirect before insert on public.protocol_version_records for each row execute function private.mc03_redirect()`);
      await assert.rejects(()=>record(version()),/import_redirected|import_not_visible/);
    });
    assert.deepEqual(await rows(),prior);
  }
});

test('runtime roles cannot import, mutate, delete/reinsert or truncate; authenticated exact reads are shared',async()=> {
  const first=await importKnown();
  for(const role of ['anon','authenticated','service_role']) {
    const c=await connection(role);
    for(const query of ["select private.import_known_protocol_version('F2F-V1.1')",'delete from public.protocol_version_records',
      'truncate public.protocol_version_records','update public.protocol_version_records set id=id',
      "insert into public.protocol_version_records select * from public.protocol_version_records"]) {
      await unchanged(()=>c.query(query),{code:'42501'});
    }
    if(role==='authenticated') {
      assert.deepEqual((await c.query('select * from public.protocol_version_records where id=$1',[known.id])).rows,[first]);
      assert.deepEqual((await c.query("select * from public.protocol_version_records where id='F2F-V9.9'")).rows,[]);
    } else await assert.rejects(()=>c.query('select * from public.protocol_version_records'),{code:'42501'});
  }
});

for(const isolation of ['read committed','repeatable read']) for(const different of [false,true]) test(`concurrent same ID ${different?'different':'same'} content at ${isolation}`,async()=> {
  const s=version(), a=await connection(), b=await connection();
  await a.query('begin'); await b.query(`begin isolation level ${isolation}`);
  await b.query('select count(*) from public.protocol_version_records');
  const first=await record(s,a);
  const contender=different?{...s,rules:{...s.rules,riskModel:'competing content'}}:s;
  const pending=record(contender,b).then(value=>({value}),error=>({error}));
  await waitForLock(b); await a.query('commit'); const outcome=await pending;
  if(isolation==='repeatable read') { assert.equal(outcome.error?.code,'40001'); await b.query('rollback'); }
  else if(different) { assert.match(outcome.error?.message,/import_conflict/); await b.query('rollback'); }
  else { assert.deepEqual(outcome.value,first); await b.query('commit'); }
  assert.deepEqual((await db.query('select * from public.protocol_version_records where id=$1',[s.id])).rows,[first]);
});

test('waiting import succeeds with its own original content/provenance after first creator rollback',async()=> {
  const s=version(), a=await connection(), b=await connection();
  await a.query('begin'); await record(s,a);
  const contender={...s,governanceNote:'Second transaction content'};
  const pending=record(contender,b); await waitForLock(b); await a.query('rollback');
  const result=await pending; assert.deepEqual(result.snapshot,contender); assert.deepEqual(await record(contender),result);
});

test('explicit rollback and trigger failure leave no partial row; restrictive future FK remains possible',async()=> {
  const s=version(); await db.query('begin'); await record(s); await db.query('rollback');
  assert.equal((await db.query('select count(*)::int as n from public.protocol_version_records where id=$1',[s.id])).rows[0].n,0);
  const prior=await rows();
  await probe(async()=> {
    await db.query(`create function private.mc03_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic_failure'; end$$;
      create trigger mc03_failure after insert on public.protocol_version_records for each row execute function private.mc03_failure()`);
    await assert.rejects(()=>record(version()),/synthetic_failure/);
  });
  assert.deepEqual(await rows(),prior);
  await probe(async()=> {
    await db.query('create table private.mc03_future_binding(version_id text references public.protocol_version_records(id) on delete restrict on update restrict)');
    await db.query('insert into private.mc03_future_binding values($1)',[known.id]);
    await assert.rejects(()=>db.query("insert into private.mc03_future_binding values('MISSING')"),{code:'23503'});
  });
});

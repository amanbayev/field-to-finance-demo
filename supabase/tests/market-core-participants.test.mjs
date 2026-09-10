// MC-02 full migration chain on disposable PostgreSQL; TCP disabled, private socket.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (!process.env.GP01_EMBEDDED_POSTGRES_MODULE?.startsWith('/')) throw new Error('Absolute GP01_EMBEDDED_POSTGRES_MODULE required');
const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.GP01_EMBEDDED_POSTGRES_MODULE).href);
const directory = await mkdtemp('/private/tmp/mc02-postgres-');
const pg = new EmbeddedPostgres({ databaseDir: join(directory, 'data'), user: 'postgres', password: randomUUID(),
  port: 5432, persistent: true, createPostgresUser: false, postgresFlags: ['-h', '', '-k', directory],
  onLog() {}, onError(message) { console.error(message); } });
const migrations = new URL('../migrations/', import.meta.url);
const migration = '20260908133317_mc02_institutional_participant_root.sql';
const clients = [];
let db, service, runA, runB, historical, beforeRows, beforeFunctions, beforeGrants;
const operator = randomUUID();
const users = { producer: randomUUID(), issuer: randomUUID(), investor: randomUUID() };
const names = { producer: 'Synthetic producer', issuer: 'Synthetic issuer', investor: 'Synthetic investor' };
const tablePrivileges = ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
async function connection(role, user) {
  const c = pg.getPgClient('postgres', directory); await c.connect(); clients.push(c);
  await c.query("set statement_timeout='15s'");
  if (role) await c.query(`set role ${role}`); // Closed test-owned roles only.
  if (user) await c.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  return c;
}
async function org(run = null) {
  return (await db.query("insert into public.organizations(slug,name,type,run_id) values($1,'Synthetic institution','INVESTMENT_FUND',$2) returning id",[randomUUID(),run])).rows[0].id;
}
async function create(id, c = db) {
  // FROM evaluates this volatile composite-returning function exactly once.
  return (await c.query('select * from private.market_core_get_or_create_participant($1)',[id])).rows[0];
}
async function state(id) {
  return (await db.query(`select o.id,o.run_id,o.market_identity_sealed,to_jsonb(p) as participant
    from public.organizations o left join public.market_core_participants p on p.organization_id=o.id where o.id=$1`,[id])).rows[0];
}
async function snapshot() {
  const tables = (await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','private','auth','storage') order by 1,2")).rows;
  const result = {};
  for (const {schemaname,tablename} of tables) {
    result[`${schemaname}.${tablename}`] = (await db.query(`select to_jsonb(t) as row from ${schemaname}.${tablename} t order by to_jsonb(t)::text`)).rows.map(r=>r.row);
  }
  return result;
}
async function functions() {
  return (await db.query(`select p.oid,pg_get_functiondef(p.oid) as definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind='f' order by p.oid`)).rows;
}
async function grants() {
  return (await db.query(`select r,t,p,has_table_privilege(r,t,p) as allowed from
    unnest(array['anon','authenticated','service_role']) r cross join
    unnest(array['public.organizations','public.memberships','public.membership_roles']) t cross join unnest($1::text[]) p order by 1,2,3`,[tablePrivileges])).rows;
}
async function noEffect(action, error) {
  const before = await snapshot(); await assert.rejects(action, error); assert.deepEqual(await snapshot(), before);
}
async function issue(dataset, c = service) {
  return (await c.query('select public.demo_reset_issue_run($1,$2,$3,$4,$5,$6) as receipt',
    [operator,'local-development',dataset,'examplerefabcdefghij',randomUUID(),names])).rows[0].receipt;
}
async function bind(dataset, c = service) {
  return (await c.query('select public.demo_reset_bind_run_participants($1,$2,$3,$4,$5,$6,$7,$8) as receipt',
    [operator,'local-development',dataset,'examplerefabcdefghij',randomUUID(),users.producer,users.issuer,users.investor])).rows[0].receipt;
}
async function waitForLock(c) {
  for (let i=0;i<400;i++) {
    const row=(await db.query('select wait_event_type from pg_stat_activity where pid=$1',[c.processID])).rows[0];
    if (row?.wait_event_type==='Lock') return;
    await delay(10);
  }
  assert.fail('Competing PostgreSQL connection did not wait for lock');
}
async function probe(body) {
  await db.query('begin');
  try { await body(); } finally { await db.query('rollback'); }
}

before(async()=> {
  await pg.initialise(); await pg.start(); db=await connection();
  const settings=(await db.query("select current_setting('server_version') as version,current_setting('listen_addresses') as listen,current_setting('unix_socket_directories') as socket")).rows[0];
  assert.match(settings.version,/^18\./); assert.equal(settings.listen,''); assert.equal(settings.socket,directory);
  console.log('MC-02 disposable PostgreSQL:', settings);
  await db.query(`create role anon; create role authenticated; create role service_role inherit nosuperuser bypassrls;
    -- Reproduce repository-evidenced Supabase defaults, not a powerless service role.
    alter default privileges for role postgres in schema public grant all on tables to service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text);`);
  const allFiles=(await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort();
  const files=allFiles.filter(f=>f<=migration);
  assert.equal(files.at(-1),migration,'Review the new full-chain boundary');
  for (const file of files.filter(f=>f!==migration)) await db.query(await readFile(new URL(file,migrations),'utf8'));
  await db.query('insert into auth.users(id) select unnest($1::uuid[])',[[operator,...Object.values(users)]]);
  const platform=await org();
  await db.query("update public.organizations set type='PLATFORM' where id=$1",[platform]);
  const mem=(await db.query('insert into public.memberships(user_id,organization_id) values($1,$2) returning id',[operator,platform])).rows[0].id;
  await db.query("insert into public.membership_roles(membership_id,role_id) values($1,'SYSTEM_ADMIN')",[mem]);
  service=await connection('service_role');
  runA=await issue('mc02-seal-runs'); runB=await issue('mc02-seal-runs');
  historical=await org(); beforeRows=await snapshot(); beforeFunctions=await functions(); beforeGrants=await grants();
  // Stress accidental defaults on the NEW table/functions as well as service_role.
  await db.query(`alter default privileges for role postgres in schema public grant all on tables to anon,authenticated;
    alter default privileges for role postgres in schema private grant execute on functions to anon,authenticated,service_role;`);
  await db.query(await readFile(new URL(migration,migrations),'utf8'));
  if (process.env.MC03_FULL_SCHEMA === '1') {
    assert.equal(allFiles.at(-1),'20260910045213_mc03_immutable_protocol_version_reference.sql');
    for (const file of allFiles.filter(f=>f>migration)) await db.query(await readFile(new URL(file,migrations),'utf8'));
  }
  console.log('Full ordered migrations applied:',process.env.MC03_FULL_SCHEMA === '1' ? allFiles.length : files.length);
}, {timeout:60000});
after(async()=> {
  try { await Promise.all(clients.map(c=>c.end())); }
  finally {
    await pg.stop();
    await rm(directory,{recursive:true,force:true});
    console.log('MC-02 cluster stopped and removed:', directory);
  }
});

test('migration has no business-row backfill and preserves every unrelated function/grant',async()=> {
  const after=await snapshot(); assert.deepEqual(after['public.market_core_participants'],[]);
  for (const [table,rows] of Object.entries(beforeRows)) {
    if (table==='public.organizations') assert.deepEqual(after[table],rows.map(r=>({...r,market_identity_sealed:false})));
    else assert.deepEqual(after[table],rows,table);
  }
  const current=await functions();
  const guard=(await db.query("select 'private.demo_reset_guard_organization_run()'::regprocedure::oid as oid")).rows[0].oid;
  for (const f of beforeFunctions.filter(f=>f.oid!==guard)) assert.deepEqual(current.find(g=>g.oid===f.oid),f);
  assert.deepEqual(await grants(),beforeGrants);
});

test('exact schema, restrictive FK, unconditional uniqueness, RLS and closed runtime privileges',async()=> {
  const columns=(await db.query("select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='market_core_participants' order by ordinal_position")).rows;
  assert.deepEqual(columns.map(c=>[c.column_name,c.data_type,c.is_nullable]),[
    ['id','text','NO'],['organization_id','uuid','NO'],['status','text','NO'],['created_at','timestamp with time zone','NO']]);
  assert.match(columns[0].column_default,/PAR-.*gen_random_uuid/);
  const fk=(await db.query("select confdeltype,confupdtype,convalidated from pg_constraint where conrelid='public.market_core_participants'::regclass and contype='f'")).rows;
  assert.deepEqual(fk,[{confdeltype:'r',confupdtype:'r',convalidated:true}]);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.market_core_participants'::regclass")).rows[0].relrowsecurity,true);
  for (const role of ['anon','authenticated','service_role']) {
    for (const p of tablePrivileges) assert.equal((await db.query("select has_table_privilege($1,'public.market_core_participants',$2) as allowed",[role,p])).rows[0].allowed,role==='authenticated'&&p==='SELECT',`${role} ${p}`);
    const funcs=(await db.query(`select p.oid::regprocedure::text as name,has_function_privilege($1,p.oid,'execute') as allowed,proconfig,prosecdef
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
      and (p.proname like 'market_core_participant_%' or p.proname in ('market_core_get_or_create_participant','market_core_seal_organization'))`,[role])).rows;
    assert.equal(funcs.length,5);
    for (const f of funcs) { assert.equal(f.allowed,false,f.name); assert.deepEqual(f.proconfig,['search_path=""']); assert.equal(f.prosecdef,false); }
  }
});

test('create/get generates one permanent PAR UUID per exact organization; status never reactivates',async()=> {
  const id=await org(); const first=await create(id);
  assert.match(first.id,/^PAR-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.organization_id,id); assert.equal(first.status,'ACTIVE'); assert.equal((await state(id)).market_identity_sealed,true);
  assert.deepEqual(await create(id),first);
  for (const status of ['SUSPENDED','RETIRED','ACTIVE']) {
    await db.query('update public.market_core_participants set status=$2 where id=$1',[first.id,status]);
    assert.deepEqual(await create(id),{...first,status});
  }
  await noEffect(()=>db.query('insert into public.market_core_participants(organization_id) values($1)',[id]),{code:'23505'});
  await noEffect(()=>create(randomUUID()),/market_core_organization_unavailable/);
});

for (const mode of ['owner','definer']) test(`${mode} DML freezes every participant identity field and rejects deletion/truncation`,async()=> {
  const id=await org(), other=await org(), p=await create(id);
  async function execute(sql) {
    if (mode==='owner') return db.query(sql);
    await db.query(`create or replace function private.mc02_test_mutate() returns void language plpgsql security definer set search_path='' as $fn$ begin ${sql}; end $fn$`);
    return db.query('select private.mc02_test_mutate()');
  }
  for (const set of [`id='PAR-${randomUUID()}'`,`organization_id='${other}'`,`created_at=created_at+interval '1 second'`]) {
    await assert.rejects(()=>execute(`update public.market_core_participants set ${set} where id='${p.id}'`),/identity_immutable/);
    assert.deepEqual(await create(id),p);
  }
  await execute(`update public.market_core_participants set id=id,organization_id=organization_id,created_at=created_at,status='SUSPENDED' where id='${p.id}'`);
  assert.deepEqual(await create(id),{...p,status:'SUSPENDED'});
  for (const sql of ['delete from public.market_core_participants','truncate public.market_core_participants']) await assert.rejects(()=>execute(sql),/identity_preserved/);
  await assert.rejects(()=>execute(`update public.market_core_participants set status='ELIGIBLE' where id='${p.id}'`),{code:'23514'});
});

test('unsealed run guard and every sealed transition, including NON_RUN retirement',async()=> {
  assert.equal((await state(historical)).market_identity_sealed,false);
  await service.query('update public.organizations set run_id=$2 where id=$1',[historical,runA.runId]);
  await service.query("update public.organizations set name='Compatible',status='SUSPENDED',run_id=run_id where id=$1",[historical]);
  for (const run of [runB.runId,null]) await noEffect(()=>service.query('update public.organizations set run_id=$2 where id=$1',[historical,run]),/write-once/);
  for (const run of [null,runA.runId]) {
    const id=await org(run); const p=await create(id);
    await db.query("update public.market_core_participants set status='RETIRED' where id=$1",[p.id]);
    for (const newRun of [runB.runId,...(run===null?[runA.runId]:[null])]) await noEffect(()=>db.query('update public.organizations set run_id=$2 where id=$1',[id,newRun]),/write-once/);
    await noEffect(()=>service.query('update public.organizations set market_identity_sealed=false where id=$1',[id]),/seal is permanent/);
    await service.query("update public.organizations set name='Renamed',status='SUSPENDED',run_id=run_id,market_identity_sealed=true where id=$1",[id]);
    assert.equal((await state(id)).run_id,run);
  }
  const id=await org();
  await noEffect(()=>db.query('update public.organizations set run_id=$2,market_identity_sealed=true where id=$1',[id,runA.runId]),/write-once/);
  await db.query('update public.organizations set market_identity_sealed=true where id=$1',[id]);
  assert.equal((await state(id)).run_id,null);
});

test('BEFORE UPDATE smuggling and suppressed seal updates fail closed',async()=> {
  for (const body of ["new.run_id:='"+runA.runId+"';",'new.market_identity_sealed:=false;','return null;']) {
    const id=await org();
    await probe(async()=> {
      await db.query(`create function private.mc02_smuggle_seal() returns trigger language plpgsql as $$begin ${body} return new; end$$;
        create trigger z_mc02_smuggle before update on public.organizations for each row execute function private.mc02_smuggle_seal()`);
      await assert.rejects(()=>create(id),/write-once|seal_failed/);
    });
    assert.equal((await state(id)).market_identity_sealed,false); assert.equal((await state(id)).participant,null);
  }
  const id=await org(); await create(id);
  await probe(async()=> {
    await db.query(`create function private.mc02_smuggle_identity() returns trigger language plpgsql as $$begin new.created_at:=new.created_at+interval '1 day'; return new; end$$;
      create trigger z_mc02_smuggle before update on public.market_core_participants for each row execute function private.mc02_smuggle_identity()`);
    await assert.rejects(()=>db.query("update public.market_core_participants set status='RETIRED' where organization_id=$1",[id]),/identity_immutable/);
  });
});

for (const timing of ['a','z']) test(`final INSERT redirection (${timing} BEFORE trigger) cannot change primitive request`,async()=> {
  for (const sealed of [false,true]) {
    const requested=await org(), redirected=await org();
    if (sealed) await db.query('update public.organizations set market_identity_sealed=true where id=$1',[redirected]);
    await probe(async()=> {
      await db.query(`create function private.mc02_redirect() returns trigger language plpgsql as $$begin new.organization_id:='${redirected}'; return new; end$$;
        create trigger ${timing}_mc02_redirect before insert on public.market_core_participants for each row execute function private.mc02_redirect()`);
      await assert.rejects(()=>create(requested),/organization_mismatch|organization_unsealed/);
    });
    assert.equal((await state(requested)).market_identity_sealed,false);
    assert.equal((await state(redirected)).market_identity_sealed,sealed);
    assert.equal((await state(redirected)).participant,null);
  }
});

test('direct privileged INSERT seals its final parent or rejects late redirection separately from primitive',async()=> {
  const id=await org();
  await db.query('insert into public.market_core_participants(organization_id) values($1)',[id]);
  assert.equal((await state(id)).market_identity_sealed,true);
  for (const timing of ['a','z']) {
    const initial=await org(), target=await org();
    await probe(async()=> {
      await db.query(`create function private.mc02_redirect_direct() returns trigger language plpgsql as $$begin new.organization_id:='${target}'; return new; end$$;
        create trigger ${timing}_mc02_redirect before insert on public.market_core_participants for each row execute function private.mc02_redirect_direct()`);
      if (timing==='z') await assert.rejects(()=>db.query('insert into public.market_core_participants(organization_id) values($1)',[initial]),/organization_unsealed/);
      else {
        await db.query('insert into public.market_core_participants(organization_id) values($1)',[initial]);
        assert.equal((await state(target)).market_identity_sealed,true);
        assert.equal((await state(initial)).market_identity_sealed,false);
      }
    });
    assert.equal((await state(initial)).participant,null); assert.equal((await state(target)).participant,null);
  }
});

test('ID collision, late insertion failure and explicit rollback undo sealing and all insert effects',async()=> {
  const other=await org(); const existing=await create(other);
  for (const body of [`new.id:='${existing.id}';`,"raise exception 'mc02_test_late_failure';"]) {
    const id=await org();
    await probe(async()=> {
      await db.query(`create function private.mc02_insert_failure() returns trigger language plpgsql as $$begin ${body} return new; end$$;
        create trigger z_mc02_failure before insert on public.market_core_participants for each row execute function private.mc02_insert_failure()`);
      await assert.rejects(()=>create(id),/duplicate key|mc02_test_late_failure/);
    });
    assert.deepEqual(await state(id),{id,run_id:null,market_identity_sealed:false,participant:null});
    assert.deepEqual(await create(other),existing);
  }
  const id=await org(); await db.query('begin'); await create(id); await db.query('rollback');
  assert.equal((await state(id)).market_identity_sealed,false); assert.equal((await state(id)).participant,null);
});

for (const isolation of ['READ COMMITTED','REPEATABLE READ']) {
  for (const presealed of [false,true]) test(`${isolation}: simultaneous same-organization create/get (${presealed?'sealed':'unsealed'})`,async()=> {
    const id=await org(); if (presealed) await db.query('update public.organizations set market_identity_sealed=true where id=$1',[id]);
    const a=await connection(), b=await connection();
    await a.query(`begin isolation level ${isolation}`); await b.query(`begin isolation level ${isolation}`);
    const first=await create(id,a); const waiting=create(id,b).then(value=>({value}),error=>({error}));
    await waitForLock(b); await a.query('commit'); const second=await waiting;
    if (isolation==='REPEATABLE READ') { assert.equal(second.error?.code,'40001'); await b.query('rollback'); }
    else { assert.deepEqual(second.value,first); await b.query('commit'); }
    assert.equal((await db.query('select count(*)::int as n from public.market_core_participants where organization_id=$1',[id])).rows[0].n,1);
  });
  test(`${isolation}: independent organizations create independent identities concurrently`,async()=> {
    const ids=[await org(),await org()]; const a=await connection(),b=await connection();
    await a.query(`begin isolation level ${isolation}`); await b.query(`begin isolation level ${isolation}`);
    const rows=await Promise.all([create(ids[0],a),create(ids[1],b)]);
    await Promise.all([a.query('commit'),b.query('commit')]);
    assert.notEqual(rows[0].id,rows[1].id); assert.deepEqual(rows.map(r=>r.organization_id),ids);
  });
  test(`${isolation}: run assignment first is observed, or stale snapshot serializes`,async()=> {
    const id=await org(); const a=await connection(),b=await connection();
    await a.query('begin'); await a.query('update public.organizations set run_id=$2 where id=$1',[id,runA.runId]);
    await b.query(`begin isolation level ${isolation}`);
    const waiting=create(id,b).then(value=>({value}),error=>({error})); await waitForLock(b); await a.query('commit');
    const second=await waiting;
    if (isolation==='REPEATABLE READ') { assert.equal(second.error?.code,'40001'); await b.query('rollback'); assert.equal((await state(id)).market_identity_sealed,false); }
    else { assert.equal(second.value.organization_id,id); await b.query('commit'); assert.equal((await state(id)).market_identity_sealed,true); }
    assert.equal((await state(id)).run_id,runA.runId);
  });
  test(`${isolation}: seal first prevents later NULL-to-run assignment`,async()=> {
    const id=await org(); const a=await connection(),b=await connection();
    await a.query('begin'); await create(id,a); await b.query(`begin isolation level ${isolation}`);
    const waiting=b.query('update public.organizations set run_id=$2 where id=$1',[id,runA.runId]).then(value=>({value}),error=>({error}));
    await waitForLock(b); await a.query('commit'); const second=await waiting;
    assert.equal(second.error?.code,isolation==='REPEATABLE READ'?'40001':'P0001'); await b.query('rollback');
    assert.equal((await state(id)).run_id,null); assert.equal((await state(id)).market_identity_sealed,true);
  });
  test(`${isolation}: creator rollback releases seal and lets competing assignment commit`,async()=> {
    const id=await org(); const a=await connection(),b=await connection();
    await a.query('begin'); await create(id,a); await b.query(`begin isolation level ${isolation}`);
    const waiting=b.query('update public.organizations set run_id=$2 where id=$1',[id,runA.runId]);
    await waitForLock(b); await a.query('rollback'); await waiting; await b.query('commit');
    assert.equal((await state(id)).run_id,runA.runId); assert.equal((await state(id)).market_identity_sealed,false); assert.equal((await state(id)).participant,null);
  });
}

test('runtime calls/writes are denied for anon, authenticated/admin and BYPASSRLS service_role',async()=> {
  const id=await org(); await create(id);
  for (const role of ['anon','authenticated','service_role']) {
    const c=await connection(role,operator);
    await assert.rejects(()=>create(id,c),{code:'42501'});
    for (const sql of ["insert into public.market_core_participants(organization_id) values('"+id+"')",
      "update public.market_core_participants set status='RETIRED'",'delete from public.market_core_participants','truncate public.market_core_participants']) {
      await assert.rejects(()=>c.query(sql),{code:'42501'});
    }
    if (role!=='authenticated') await assert.rejects(()=>c.query('select * from public.market_core_participants'),{code:'42501'});
    else assert.deepEqual((await c.query('select * from public.market_core_participants')).rows,[]);
  }
});

// Relational equivalent of the server's single PostgREST embedded SELECT. Both
// authorization and nullable identity are observed inside one read-only statement.
async function lookup(c,id,user) {
  return (await c.query(`select s.principal_user_id,o.id, to_jsonb(mp) as participant
    from public.session_contexts s join public.profiles p on p.user_id=s.principal_user_id
    join public.organizations o on o.id=s.active_organization_id
    join public.memberships m on m.organization_id=o.id and m.user_id=p.user_id
    left join public.market_core_participants mp on mp.organization_id=o.id
    where s.principal_user_id=$1 and s.active_organization_id=$2 and s.effective_demo_persona_id is null
    and p.status='ACTIVE' and o.status='ACTIVE' and m.status='ACTIVE'`,[user,id])).rows;
}
test('RLS and read-only lookup distinguish authorized absence/status and deny stale, suspended, persona or foreign context',async()=> {
  const user=randomUUID(); await db.query('insert into auth.users(id) values($1)',[user]);
  const one=await org(), two=await org(),foreign=await org();
  await db.query('insert into public.memberships(user_id,organization_id) values($1,$2),($1,$3)',[user,one,two]);
  await db.query('insert into public.session_contexts(principal_user_id,active_organization_id) values($1,$2)',[user,one]);
  const c=await connection('authenticated',user);
  const before=await snapshot(); await c.query('begin read only');
  assert.equal((await lookup(c,one,user))[0].participant,null); await c.query('commit'); assert.deepEqual(await snapshot(),before);
  const p=await create(one); await create(two); await create(foreign);
  for (const status of ['ACTIVE','SUSPENDED','RETIRED']) {
    await db.query('update public.market_core_participants set status=$2 where id=$1',[p.id,status]);
    assert.equal((await lookup(c,one,user))[0].participant.status,status);
    assert.deepEqual((await c.query('select id from public.market_core_participants')).rows,[{id:p.id}]);
  }
  assert.deepEqual(await lookup(c,two,user),[]); assert.deepEqual(await lookup(c,foreign,user),[]);
  for (const [table,key,value] of [['memberships','user_id',user],['profiles','user_id',user],['organizations','id',one]]) {
    await db.query(`update public.${table} set status='SUSPENDED' where ${key}=$1`,[value]);
    assert.deepEqual(await lookup(c,one,user),[]); assert.deepEqual((await c.query('select * from public.market_core_participants')).rows,[]);
    await db.query(`update public.${table} set status='ACTIVE' where ${key}=$1`,[value]);
  }
  for (const selection of [foreign,null]) {
    await db.query('update public.session_contexts set active_organization_id=$2 where principal_user_id=$1',[user,selection]);
    assert.deepEqual(await lookup(c,one,user),[]); assert.deepEqual((await c.query('select * from public.market_core_participants')).rows,[]);
  }
  await db.query("insert into public.demo_personas(id,display_name,group_key,organization_id,role_id) values('mc02-test','Test','market',$1,'INVESTOR')",[one]);
  await db.query("update public.session_contexts set active_organization_id=$2,effective_demo_persona_id='mc02-test' where principal_user_id=$1",[user,one]);
  assert.deepEqual(await lookup(c,one,user),[]); assert.deepEqual((await c.query('select * from public.market_core_participants')).rows,[]);
});

test('supported GP issuance/binding reuses humans in A/B with fresh immutable institutions and no market activation',async()=> {
  const baseline=await snapshot(), dataset='mc02-human-reuse';
  const a=await issue(dataset), bindingA=await bind(dataset); const pA=await create(a.investorOrganizationId);
  const afterA=await snapshot(); const b=await issue(dataset),bindingB=await bind(dataset); const pB=await create(b.investorOrganizationId);
  assert.notEqual(a.investorOrganizationId,b.investorOrganizationId); assert.notEqual(pA.id,pB.id);
  assert.equal((await state(a.investorOrganizationId)).run_id,a.runId); assert.equal((await state(b.investorOrganizationId)).run_id,b.runId);
  for (const who of Object.keys(users)) {
    assert.equal(bindingA[who].userId,users[who]); assert.equal(bindingB[who].userId,users[who]);
    assert.notEqual(bindingA[who].membershipId,bindingB[who].membershipId);
    assert.notEqual(bindingA[who].organizationId,bindingB[who].organizationId);
  }
  const final=await snapshot();
  assert.equal(final['public.market_core_participants'].length,baseline['public.market_core_participants'].length+2);
  for (const run of [a,b]) {
    for (const who of ['producer','issuer']) {
      const root=await state(run[`${who}OrganizationId`]);
      assert.equal(root.market_identity_sealed,false); assert.equal(root.participant,null);
    }
  }
  for (const table of ['public.profiles','auth.users','public.session_contexts','public.demo_personas']) assert.deepEqual(final[table],baseline[table],table);
  for (const table of ['public.organizations','public.memberships','public.membership_roles','public.market_core_participants']) {
    for (const row of afterA[table]) assert.ok(final[table].some(r=>JSON.stringify(r)===JSON.stringify(row)),`${table} historical row retained`);
  }
  for (const table of Object.keys(baseline).filter(t=>(t.startsWith('public.market_core_')&&t!=='public.market_core_participants')||t==='public.registrar_registered_ownership')) assert.deepEqual(final[table],baseline[table],table);
  for (const participant of [pA,pB]) {
    assert.equal((await db.query("select private.market_core_is_eligible($1,'WHEAT-2027') as eligible",[participant.id])).rows[0].eligible,false);
  }
  // Target unused pairs so uniqueness does not reject before the AFTER identity guard.
  for (const [table,assignment,id] of [['memberships',`organization_id='${b.issuerOrganizationId}'`,bindingA.investor.membershipId],
    ['memberships',`user_id='${users.issuer}'`,bindingA.investor.membershipId],
    ['membership_roles',`membership_id='${bindingB.issuer.membershipId}'`,bindingA.investor.membershipRoleId]]) {
    await assert.rejects(()=>db.query(`update public.${table} set ${assignment} where id=$1`,[id]),/immutable/);
  }
  console.log('Run A/B proof:',{runA:a.runId,organizationA:pA.organization_id,participantA:pA.id,runB:b.runId,organizationB:pB.organization_id,participantB:pB.id});
});

test('SECURITY DEFINER cannot unseal or rewrite run ownership through ordinary DML',async()=> {
  const id=await org(); await create(id);
  for (const set of ['market_identity_sealed=false',`run_id='${runA.runId}'`]) {
    await db.query(`create or replace function private.mc02_seal_definer() returns void language sql security definer set search_path='' as $$
      update public.organizations set ${set} where id='${id}' $$`);
    await noEffect(()=>db.query('select private.mc02_seal_definer()'),/seal is permanent|write-once/);
  }
});

test('generic create/status RPCs and retained-root deletion dependency on full schema',async()=> {
  const admin=await connection('authenticated',operator);
  const id=(await admin.query("select public.create_organization('MC02 generic','INVESTMENT_FUND',null,'explicit-legacy-ref') as r")).rows[0].r.organization_id;
  assert.equal((await state(id)).run_id,null); assert.equal((await state(id)).market_identity_sealed,false);
  const p=await create(id); await admin.query("select public.set_organization_status($1,'SUSPENDED')",[id]);
  assert.equal((await create(id)).id,p.id); assert.equal((await state(id)).run_id,null);
  const runOrg=await org(runA.runId); await create(runOrg);
  await noEffect(()=>db.query('delete from public.organizations where id=$1',[runOrg]),{code:'23001',constraint:'market_core_participants_organization_id_fkey'});
  await noEffect(()=>db.query('update public.organizations set id=$2 where id=$1',[runOrg,randomUUID()]),{code:'23001',constraint:'market_core_participants_organization_id_fkey'});
  await assert.rejects(()=>service.query("select public.demo_reset_count_rows('market_core_participants','ENVIRONMENT',null)"),/object_not_countable/);
});

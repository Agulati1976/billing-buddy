import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

export const root = path.resolve(import.meta.dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const roles = `DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;

async function postgresDatabase(url) {
  const {Client}=await import('pg');
  const admin=new Client({connectionString:url});await admin.connect();
  const name='billlook_test_'+randomUUID().replaceAll('-','');
  const target=new URL(url);target.pathname='/'+name;
  const client=new Client({connectionString:target.href});
  let created=false;
  try {
    // Roles belong to the cluster. All test workers lock in the same admin
    // database before creating them, rather than racing in separate fixtures.
    await admin.query('BEGIN');
    await admin.query('SELECT pg_advisory_xact_lock(746238901)');
    await admin.query(roles);
    await admin.query('COMMIT');
    await admin.query(`CREATE DATABASE ${quote(name)}`);created=true;
    await client.connect();
  } catch(error) {
    await client.end().catch(()=>{});
    await admin.query('ROLLBACK').catch(()=>{});
    if(created)await admin.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`).catch(()=>{});
    await admin.end();
    throw error;
  }
  return {
    connectionString:target.href,
    query:(sql,params)=>client.query(sql,params),
    exec:sql=>client.query(sql),
    async close(){try {await client.end();await admin.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);} finally {await admin.end();}},
  };
}

export async function database({ migrate = true, onStatement } = {}) {
  const db = process.env.BILLLOOK_TEST_POSTGRES ? await postgresDatabase(process.env.BILLLOOK_TEST_POSTGRES) : new PGlite();
  if (onStatement) {
    const execute = db.exec.bind(db);
    db.exec = async sql => { onStatement(sql); return execute(sql); };
  }
  try {
  if(!process.env.BILLLOOK_TEST_POSTGRES)await db.exec(roles);
  await db.exec(`
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;`);
  const snapshot = readJson('tests/fixtures/schema-baseline.json');
  const enums = new Map();
  for (const entry of snapshot.enums) enums.set(entry.name, [...(enums.get(entry.name) || []), entry.value]);
  for (const [name, values] of enums) await db.exec(`CREATE TYPE public.${quote(name)} AS ENUM (${values.map(literal).join(',')});`);
  for (const name of snapshot.sequences || []) await db.exec(`CREATE SEQUENCE public.${quote(name)};`);
  const tables = new Map();
  for (const column of snapshot.columns) tables.set(column.table, [...(tables.get(column.table) || []), column]);
  for (const [name, columns] of tables) {
    await db.exec(`CREATE TABLE public.${quote(name)} (${columns.map(c => `${quote(c.name)} ${c.type}${c.default ? ` DEFAULT ${c.default}` : ''}${c.notnull ? ' NOT NULL' : ''}`).join(',')});`);
  }
  const constraints = readJson('audit/evidence/live-constraints.json');
  for (const c of constraints.sort((a,b) => (a.contype === 'f') - (b.contype === 'f'))) {
    await db.exec(`ALTER TABLE public.${quote(c.table_name)} ADD CONSTRAINT ${quote(c.conname)} ${c.definition};`);
  }
  for (const definition of snapshot.indexes) await db.exec(definition.replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ').replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ') + ';');
  for (const f of readJson('audit/evidence/live-functions.json')) await db.exec(f.definition);
  for (const trigger of snapshot.triggers) await db.exec(trigger + ';');
  for (const table of tables.keys()) await db.exec(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;`);
  for (const p of readJson('audit/evidence/live-policies.json')) {
    const roles = Array.isArray(p.roles) ? p.roles : p.roles.replace(/[{}]/g,'').split(',');
    await db.exec(`CREATE POLICY ${quote(p.policyname)} ON public.${quote(p.tablename)} FOR ${p.cmd} TO ${roles.map(quote).join(',')}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''};`);
  }
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;');
  for(const plan of readJson('tests/fixtures/plans-baseline.json')){
    await db.exec(`INSERT INTO public.subscription_plans(id,code,name,price_inr,features) VALUES(${literal(plan.id)},${literal(plan.code)},${literal(plan.name)},${plan.price_inr},${literal(JSON.stringify(plan.features))}::jsonb);`);
  }
  if (migrate) {
    const migrations = fs.readdirSync(path.join(root,'supabase/migrations')).filter(name => /^20261023.*\.sql$/.test(name)).sort();
    for (const migration of migrations) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
  }
  return db;
  } catch(error) {
    await db.close();
    throw error;
  }
}

export async function asUser(db, user, sql, params = []) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec('SET ROLE authenticated');
  try { return await db.query(sql, params); }
  finally {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
  }
}

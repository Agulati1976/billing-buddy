import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, asUser } from './database-helpers.mjs';

const owner = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const business = '20000000-0000-4000-8000-000000000001';
test('live-schema fixture and stabilization migration compile in PostgreSQL', async () => {
  const db = await database();
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4)',[owner,'owner@example.invalid',other,'other@example.invalid']);
  await db.query('INSERT INTO businesses(id,owner_id,name) VALUES($1,$2,$3)',[business,owner,'Test business']);
  const allowed = await asUser(db,owner,'SELECT app_has_access($1,$2) allowed',[business,'sales']);
  assert.equal(allowed.rows[0].allowed,true);
  const denied = await asUser(db,other,'SELECT app_has_access($1,$2) allowed',[business,'sales']);
  assert.equal(denied.rows[0].allowed,false);
  await db.close();
});

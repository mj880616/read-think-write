import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DeletionError,
  RTW_OWNER_TABLES,
  WEB2_MARKERS,
  deletionErrorBody,
  runAccountDeletion
} from '../supabase/functions/rtw-delete-account/account-deletion.js';

const UID = '00000000-0000-4000-8000-000000000001';
const TOKEN = 'user-jwt';

// Minimal stand-in for the service-role Supabase client. It records every call
// so tests can assert that Web2 tables are only read and auth is only deleted
// when allowed.
function fakeAdmin({ web2Rows = {}, failDelete = {}, failSelect = {}, failAuthDelete = 0, validTokens = [TOKEN] } = {}) {
  const log = [];
  const state = { authDeleted: false, authDeleteFailuresLeft: failAuthDelete };
  const admin = {
    log,
    state,
    auth: {
      async getUser(token) {
        if (!validTokens.includes(token) || state.authDeleted) return { data: { user: null }, error: { message: 'invalid' } };
        return { data: { user: { id: UID, email: ' Reader@Example.com ' } }, error: null };
      },
      admin: {
        async deleteUser(uid) {
          log.push(['auth.deleteUser', uid]);
          if (state.authDeleteFailuresLeft > 0) {
            state.authDeleteFailuresLeft -= 1;
            return { data: null, error: { status: 500, message: 'boom' } };
          }
          state.authDeleted = true;
          return { data: {}, error: null };
        }
      }
    },
    from(table) {
      return {
        select(column) {
          return {
            eq(col, value) {
              return {
                async limit() {
                  log.push(['select', table, col, value]);
                  if (failSelect[table]) return { data: null, error: { message: 'select failed' } };
                  return { data: web2Rows[table] ? [{ [column]: value }] : [], error: null };
                }
              };
            }
          };
        },
        delete() {
          return {
            async eq(col, value) {
              log.push(['delete', table, col, value]);
              if (failDelete[table] > 0) {
                failDelete[table] -= 1;
                return { error: { message: 'delete failed' } };
              }
              return { error: null };
            }
          };
        }
      };
    }
  };
  return admin;
}

const web2Tables = new Set(WEB2_MARKERS.map(m => m.table));
const deletes = admin => admin.log.filter(e => e[0] === 'delete');
const authDeletes = admin => admin.log.filter(e => e[0] === 'auth.deleteUser');

// --- Web2 account: 읽생기 data + beta only, auth kept ---------------------------
for (const marker of WEB2_MARKERS) {
  const admin = fakeAdmin({ web2Rows: { [marker.table]: true } });
  const result = await runAccountDeletion(admin, TOKEN);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'rtw_data_only', `${marker.table} must mark a Web2 account`);
  assert.deepEqual(result.deleted, { rtwData: true, betaAccess: true, authUser: false });
  assert.equal(authDeletes(admin).length, 0, `auth user must survive when ${marker.table} has a row`);
  assert.deepEqual(
    deletes(admin).map(e => e[1]),
    [...RTW_OWNER_TABLES, 'rtw_beta_access']
  );
  assert.deepEqual(deletes(admin).at(-1), ['delete', 'rtw_beta_access', 'email', 'reader@example.com']);
  for (const [, table] of deletes(admin)) assert.ok(!web2Tables.has(table), `must never delete from ${table}`);
}

// --- Normal user: 읽생기 data -> beta -> auth ----------------------------------
{
  const admin = fakeAdmin();
  const result = await runAccountDeletion(admin, TOKEN);
  assert.equal(result.mode, 'full_account');
  assert.deepEqual(result.deleted, { rtwData: true, betaAccess: true, authUser: true });
  const order = admin.log.filter(e => e[0] !== 'select').map(e => (e[0] === 'delete' ? e[1] : e[0]));
  assert.deepEqual(order, [...RTW_OWNER_TABLES, 'rtw_beta_access', 'auth.deleteUser']);
  for (const [, , col, value] of deletes(admin).slice(0, RTW_OWNER_TABLES.length)) {
    assert.equal(col, 'owner_id');
    assert.equal(value, UID);
  }
  // Web2 is checked (twice: before any delete and right before auth delete), never written.
  const selects = admin.log.filter(e => e[0] === 'select');
  assert.equal(selects.length, WEB2_MARKERS.length * 2);
  const firstMutation = admin.log.findIndex(e => e[0] !== 'select');
  assert.ok(firstMutation >= WEB2_MARKERS.length, 'Web2 check must run before any delete');
}

// --- Web2 check cannot complete: fail closed, nothing deleted ------------------
{
  const admin = fakeAdmin({ failSelect: { app_pages: true } });
  await assert.rejects(runAccountDeletion(admin, TOKEN), e => e instanceof DeletionError && e.code === 'web2_check_failed');
  assert.equal(deletes(admin).length, 0);
  assert.equal(authDeletes(admin).length, 0);
}

// --- Mid-way failure then retry finishes the job -------------------------------
{
  // rtw data delete fails once, beta/auth untouched; retry completes.
  const admin = fakeAdmin({ failDelete: { rtw_notes: 1 } });
  await assert.rejects(runAccountDeletion(admin, TOKEN), e => {
    const { status, body } = deletionErrorBody(e);
    assert.equal(status, 500);
    assert.equal(body.code, 'rtw_data_delete_failed');
    assert.equal(body.stage, 'rtw_data');
    assert.match(body.error, /다시 누르면 남은 항목을 이어서 삭제합니다/);
    return true;
  });
  assert.equal(authDeletes(admin).length, 0);
  assert.ok(!deletes(admin).some(e => e[1] === 'rtw_beta_access'));
  const retry = await runAccountDeletion(admin, TOKEN);
  assert.equal(retry.mode, 'full_account');
  assert.equal(admin.state.authDeleted, true);
}
{
  // beta delete fails once.
  const admin = fakeAdmin({ failDelete: { rtw_beta_access: 1 } });
  await assert.rejects(runAccountDeletion(admin, TOKEN), e => e.code === 'beta_access_delete_failed');
  assert.equal(authDeletes(admin).length, 0);
  assert.equal((await runAccountDeletion(admin, TOKEN)).mode, 'full_account');
}
{
  // auth delete fails once after data + beta are gone; retry re-runs safely.
  const admin = fakeAdmin({ failAuthDelete: 1 });
  await assert.rejects(runAccountDeletion(admin, TOKEN), e => e.code === 'auth_delete_failed' && e.stage === 'auth_user');
  const retry = await runAccountDeletion(admin, TOKEN);
  assert.equal(retry.mode, 'full_account');
  assert.equal(admin.state.authDeleted, true);
}
{
  // Web2 account retry after partial failure stays rtw_data_only.
  const admin = fakeAdmin({ web2Rows: { app_workspace_members: true }, failDelete: { rtw_resources: 1 } });
  await assert.rejects(runAccountDeletion(admin, TOKEN), e => e.code === 'rtw_data_delete_failed');
  assert.equal((await runAccountDeletion(admin, TOKEN)).mode, 'rtw_data_only');
  assert.equal(authDeletes(admin).length, 0);
}

// --- Not logged in -------------------------------------------------------------
for (const token of ['', 'expired-or-anon-key']) {
  const admin = fakeAdmin();
  await assert.rejects(runAccountDeletion(admin, token), e => {
    const { status, body } = deletionErrorBody(e);
    assert.equal(status, 401);
    assert.equal(body.code, 'not_authenticated');
    return true;
  });
  assert.equal(admin.log.length, 0, 'nothing may be read or deleted without a valid session');
}

// --- Unexpected errors do not leak internals -----------------------------------
{
  const { status, body } = deletionErrorBody(new Error('relation "secret" does not exist'));
  assert.equal(status, 500);
  assert.equal(body.code, 'unexpected');
  assert.doesNotMatch(body.error, /secret/);
}

// --- Static guards ---------------------------------------------------------------
{
  const plan = fs.readFileSync(new URL('../supabase/functions/rtw-delete-account/account-deletion.js', import.meta.url), 'utf8');
  const edge = fs.readFileSync(new URL('../supabase/functions/rtw-delete-account/index.ts', import.meta.url), 'utf8');
  // Web2 tables appear only in the read-only marker list.
  assert.doesNotMatch(plan, /from\(['"]app_/);
  assert.doesNotMatch(edge, /app_(profiles|workspace|pages|spaces)/);
  assert.match(edge, /runAccountDeletion\(admin, token\)/);
  assert.doesNotMatch(edge, /deleteUser/, 'auth deletion must go through the Web2-guarded plan');
  // rtw_personal_mode is a system setting and must not be touched.
  assert.ok(!RTW_OWNER_TABLES.includes('rtw_personal_mode'));
  // Every owner-scoped rtw_* table from migrations is covered.
  const migrations = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .map(f => fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'))
    .join('\n');
  for (const [, table] of migrations.matchAll(/create table if not exists public\.(rtw_\w+)\s*\([^;]*?owner_id/g)) {
    assert.ok(RTW_OWNER_TABLES.includes(table), `${table} missing from RTW_OWNER_TABLES`);
  }
}

console.log('Account deletion Web2 safety ok');

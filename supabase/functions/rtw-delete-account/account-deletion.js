// Account deletion plan for Read Think Write (읽생기).
//
// auth.users is shared with Web2 (private work system). A Web2 account must
// never lose its auth user because of 읽생기 탈퇴, so every run first checks
// for Web2 rows with the service role and only deletes the auth user when none
// exist. Every step is idempotent: a retry after a partial failure re-runs the
// same deletes and continues to the end.

// Web2 tables are only read here — never updated or deleted.
// app_workspaces has no owner column; workspace ownership lives in
// app_workspace_members (role = 'owner'), which the member check covers.
export const WEB2_MARKERS = Object.freeze([
  { table: 'app_profiles', column: 'user_id' },
  { table: 'app_workspace_members', column: 'user_id' },
  { table: 'app_pages', column: 'owner_id' },
  { table: 'app_spaces', column: 'owner_id' }
]);

// Children before parents so no FK blocks a delete. rtw_personal_mode is a
// system setting (external GPT write owner), not user data, and is left alone.
export const RTW_OWNER_TABLES = Object.freeze([
  'rtw_relations',
  'rtw_bookmarks',
  'rtw_records',
  'rtw_notes',
  'rtw_questions',
  'rtw_topics',
  'rtw_note_types',
  'rtw_resources',
  'rtw_writing_context',
  'rtw_feedback',
  'rtw_ai_usage'
]);

export const DELETION_MODES = Object.freeze({
  RTW_DATA_ONLY: 'rtw_data_only',
  FULL_ACCOUNT: 'full_account'
});

const RETRY_HINT = '다시 누르면 남은 항목을 이어서 삭제합니다.';

export class DeletionError extends Error {
  constructor(code, stage, message, status = 500) {
    super(message);
    this.code = code;
    this.stage = stage;
    this.status = status;
  }
}

export async function hasWeb2Footprint(admin, uid) {
  for (const { table, column } of WEB2_MARKERS) {
    const { data, error } = await admin.from(table).select(column).eq(column, uid).limit(1);
    // Fail closed: if the check cannot finish we must not risk deleting a Web2 user.
    if (error) {
      throw new DeletionError(
        'web2_check_failed',
        'web2_check',
        '계정 상태를 확인하지 못해 아무것도 삭제하지 않았습니다. 잠시 후 다시 시도해주세요.'
      );
    }
    if (Array.isArray(data) && data.length > 0) return true;
  }
  return false;
}

export async function deleteRtwData(admin, uid) {
  for (const table of RTW_OWNER_TABLES) {
    const { error } = await admin.from(table).delete().eq('owner_id', uid);
    if (error) {
      throw new DeletionError(
        'rtw_data_delete_failed',
        'rtw_data',
        `읽생기 데이터 일부를 삭제하지 못했습니다. ${RETRY_HINT}`
      );
    }
  }
}

export async function deleteBetaAccess(admin, email) {
  if (!email) return;
  const { error } = await admin.from('rtw_beta_access').delete().eq('email', email);
  if (error) {
    throw new DeletionError(
      'beta_access_delete_failed',
      'beta_access',
      `읽생기 데이터는 삭제되었지만 베타 권한을 정리하지 못했습니다. ${RETRY_HINT}`
    );
  }
}

export async function deleteAuthUser(admin, uid) {
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (!error) return;
  // Already gone (e.g. a concurrent retry finished first) counts as done.
  if (error.status === 404 || /not.?found/i.test(String(error.message || ''))) return;
  throw new DeletionError(
    'auth_delete_failed',
    'auth_user',
    `읽생기 데이터와 베타 권한은 삭제되었지만 로그인 계정을 삭제하지 못했습니다. ${RETRY_HINT}`
  );
}

export async function resolveUser(admin, token) {
  if (!token) throw new DeletionError('not_authenticated', 'auth', '로그인이 필요합니다.', 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw new DeletionError('not_authenticated', 'auth', '로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 시도해주세요.', 401);
  }
  return data.user;
}

// Returns the JSON body for a successful deletion; throws DeletionError otherwise.
export async function runAccountDeletion(admin, token) {
  const user = await resolveUser(admin, token);
  const uid = user.id;
  const email = String(user.email || '').trim().toLowerCase();

  const web2 = await hasWeb2Footprint(admin, uid);

  await deleteRtwData(admin, uid);
  await deleteBetaAccess(admin, email);

  // Re-check right before the irreversible step so a Web2 row created during
  // this run still protects the auth user.
  if (web2 || await hasWeb2Footprint(admin, uid)) {
    return {
      ok: true,
      mode: DELETION_MODES.RTW_DATA_ONLY,
      deleted: { rtwData: true, betaAccess: true, authUser: false }
    };
  }

  await deleteAuthUser(admin, uid);
  return {
    ok: true,
    mode: DELETION_MODES.FULL_ACCOUNT,
    deleted: { rtwData: true, betaAccess: true, authUser: true }
  };
}

export function deletionErrorBody(error) {
  if (error instanceof DeletionError) {
    return { status: error.status, body: { ok: false, code: error.code, stage: error.stage, error: error.message } };
  }
  return {
    status: 500,
    body: { ok: false, code: 'unexpected', stage: 'unknown', error: `계정 삭제 중 오류가 발생했습니다. ${RETRY_HINT}` }
  };
}

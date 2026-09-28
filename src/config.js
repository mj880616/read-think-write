export const SUPABASE_URL = 'https://xmlkxfjeagycwttklxjw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_X-0lXJztIQUriUidBZ1PLQ_QemTRSpA';

const host = globalThis.location?.hostname || '';
export const ROOT_APP_HOSTS = Object.freeze(['read.bokdoong.com', 'read-test.bokdoong.com']);
export const APP_BASE = ROOT_APP_HOSTS.includes(host) ? '/' : '/read-think-write/';

export const APP_BUILD = '2026-09-21-beta-access-diag-1';

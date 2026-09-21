export const SUPABASE_URL = 'https://xmlkxfjeagycwttklxjw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_X-0lXJztIQUriUidBZ1PLQ_QemTRSpA';

const host = globalThis.location?.hostname || '';
export const APP_BASE = host === 'read.bokdoong.com' ? '/' : '/read-think-write/';

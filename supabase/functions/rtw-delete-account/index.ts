import { createClient } from 'npm:@supabase/supabase-js@2';

const SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } });

const ALLOWED_ORIGINS = new Set([
  'https://read.bokdoong.com',
  'https://mj880616.github.io'
]);

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://read.bokdoong.com';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json'
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'origin_not_allowed' }, 403, origin);
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  try {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, origin);
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'origin_not_allowed' }, 403, origin);

    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('로그인이 필요합니다.');

    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) throw new Error('로그인 세션을 확인할 수 없습니다.');

    const uid = data.user.id;
    const email = String(data.user.email || '').trim().toLowerCase();

    // rtw_* owner rows use ON DELETE CASCADE from auth.users.
    // rtw_beta_access is keyed by email and therefore must be removed explicitly.
    if (email) {
      const betaDelete = await admin.from('rtw_beta_access').delete().eq('email', email);
      if (betaDelete.error) throw betaDelete.error;
    }

    const deleted = await admin.auth.admin.deleteUser(uid);
    if (deleted.error) throw deleted.error;

    return json({ ok: true }, 200, origin);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 400, origin);
  }
});

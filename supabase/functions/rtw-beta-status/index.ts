import { createClient } from 'npm:@supabase/supabase-js@2';

const SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SB, SERVICE, { auth: { persistSession: false } });

const allowedOrigins = new Set([
  'https://read.bokdoong.com',
  'https://mj880616.github.io'
]);

function cors(origin: string | null) {
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : 'https://read.bokdoong.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json'
  };
}

const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: cors(origin) });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });

  try {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, origin);
    if (origin && !allowedOrigins.has(origin)) return json({ error: 'origin_not_allowed' }, 403, origin);

    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: '로그인이 필요합니다.' }, 401, origin);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ error: '로그인 세션을 확인할 수 없습니다.' }, 401, origin);

    const email = String(user.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'Google 계정 이메일을 확인할 수 없습니다.' }, 400, origin);

    const { data, error } = await admin
      .from('rtw_beta_access')
      .select('email,role,active,invited_at,note')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;
    return json({ access: data ?? null }, 200, origin);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, origin);
  }
});

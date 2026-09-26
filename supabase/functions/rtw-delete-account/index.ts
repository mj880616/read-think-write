import { createClient } from 'npm:@supabase/supabase-js@2';
import { deletionErrorBody, runAccountDeletion } from './account-deletion.js';

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

    // Web2 accounts share auth.users: only 읽생기 data and beta access are
    // removed for them. See account-deletion.js for the full plan.
    const result = await runAccountDeletion(admin, token);
    return json(result, 200, origin);
  } catch (error) {
    console.error(error);
    const { status, body } = deletionErrorBody(error);
    return json(body, status, origin);
  }
});

const ALLOWED_ORIGIN = 'https://mj880616.github.io';
const headers = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  return new Response(JSON.stringify({
    error: 'setup_flow_retired',
    message: '이 초기 설정 방식은 종료되었습니다. 사이트의 Google 로그인을 이용해 주세요.'
  }), { status: 410, headers });
});

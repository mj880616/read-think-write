const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8'};
Deno.serve((req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  return new Response(JSON.stringify({error:'새 글 추천 기능은 현재 사용하지 않습니다.'}),{status:410,headers:cors});
});

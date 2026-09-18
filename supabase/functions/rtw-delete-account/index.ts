import { createClient } from 'npm:@supabase/supabase-js@2';
const SB=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(SB,SERVICE,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'https://mj880616.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  if(req.method!=='POST')return json({error:'POST only'},405);
  const origin=req.headers.get('origin');if(origin&&origin!=='https://mj880616.github.io')return json({error:'origin_not_allowed'},403);
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('로그인이 필요합니다.');
  const {data,error}=await admin.auth.getUser(token);if(error||!data.user)throw new Error('로그인 세션을 확인할 수 없습니다.');
  const uid=data.user.id;
  for(const table of ['rtw_bookmarks','rtw_relations','rtw_notes','rtw_questions','rtw_topics','rtw_resources','rtw_ai_usage']){
    const result=await admin.from(table).delete().eq('owner_id',uid);if(result.error)throw result.error;
  }
  const deleted=await admin.auth.admin.deleteUser(uid);if(deleted.error)throw deleted.error;
  return json({ok:true});
 }catch(error){console.error(error);return json({error:error instanceof Error?error.message:String(error)},400);}
});
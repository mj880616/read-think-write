import { createClient } from 'npm:@supabase/supabase-js@2';
const SB=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(SB,SERVICE,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'https://mj880616.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 if(req.method!=='POST')return json({error:'POST only'},405);
 const origin=req.headers.get('origin');if(origin&&origin!=='https://mj880616.github.io')return json({error:'origin_not_allowed'},403);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('로그인이 필요합니다.');
 const {data,error}=await admin.auth.getUser(token);if(error||!data.user)throw new Error('로그인 세션을 확인할 수 없습니다.');
 const {data:existing,error:readError}=await admin.from('rtw_personal_mode').select('owner_id').eq('id','owner').maybeSingle();if(readError)throw readError;
 if(existing?.owner_id&&existing.owner_id!==data.user.id)throw new Error('개인 owner가 이미 지정되어 있습니다.');
 if(!existing){const {error:insertError}=await admin.from('rtw_personal_mode').insert({id:'owner',owner_id:data.user.id});if(insertError)throw insertError;}
 return json({ok:true});
}catch(error){console.error(error);return json({error:error instanceof Error?error.message:String(error)},400);}});
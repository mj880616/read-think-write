import { createClient } from 'npm:@supabase/supabase-js@2';
const ORIGIN='https://mj880616.github.io';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const respond=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return respond(405,{error:'method_not_allowed'});
 const origin=req.headers.get('origin');if(origin&&origin!==ORIGIN)return respond(403,{error:'origin_not_allowed'});
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,authorization=req.headers.get('authorization');
 if(!authorization)return respond(401,{error:'not_authenticated'});
 const auth=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await auth.auth.getUser();if(error||!data.user)return respond(401,{error:'not_authenticated'});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:setup}=await admin.from('rtw_setup_state').select('owner_user_id').eq('id','owner').maybeSingle();
 const legacyOwner=setup?.owner_user_id===data.user.id;
 return respond(200,{status:legacyOwner?'legacy-owner':'ready'});
});
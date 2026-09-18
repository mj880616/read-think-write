import { createClient } from 'npm:@supabase/supabase-js@2';
const SB=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(SB,SERVICE,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'https://mj880616.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
async function ownerId(){const {data,error}=await admin.from('rtw_personal_mode').select('owner_id').eq('id','owner').single();if(error||!data?.owner_id)throw new Error('개인 owner가 설정되지 않았습니다.');return data.owner_id;}
Deno.serve(async(req:Request)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{
 if(req.method!=='POST')return json({error:'POST only'},405);
 const key=Deno.env.get('RTW_PERSONAL_WRITE_KEY')||'';const supplied=req.headers.get('x-rtw-write-key')||'';if(!key||supplied!==key)return json({error:'unauthorized'},401);
 const owner=await ownerId();const input=await req.json();
 if(input?.action==='resource'){const row={owner_id:owner,title:String(input.title||'').trim(),original_title:String(input.original_title||'').trim()||null,author:String(input.author||'').trim()||null,source_name:String(input.source_name||'').trim()||null,published_on:input.published_on||null,original_url:String(input.original_url||'').trim()||null,body_md:String(input.body_md||''),visibility:'private'};if(!row.title)throw new Error('제목이 필요합니다.');const {data,error}=await admin.from('rtw_resources').insert(row).select('id,title').single();if(error)throw error;return json({ok:true,resource:data});}
 if(input?.action==='note'){const body=String(input.body||'').trim();if(!body)throw new Error('메모 내용이 필요합니다.');const {data,error}=await admin.from('rtw_notes').insert({owner_id:owner,body,note_type:input.note_type||'생각',resource_id:input.resource_id||null}).select('id').single();if(error)throw error;return json({ok:true,note:data});}
 if(input?.action==='question'){const body=String(input.body||'').trim();if(!body)throw new Error('질문 내용이 필요합니다.');const {data,error}=await admin.from('rtw_questions').insert({owner_id:owner,body,current_thought:String(input.current_thought||''),status:'open'}).select('id').single();if(error)throw error;return json({ok:true,question:data});}
 return json({error:'unsupported_action'},400);
}catch(error){console.error(error);return json({error:error instanceof Error?error.message:String(error)},400);}});
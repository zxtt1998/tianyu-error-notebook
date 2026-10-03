const allowedOrigins=new Set(['https://zxtt1998.github.io','http://127.0.0.1:8765','http://localhost:8765']);
const reply=(body:unknown,status:number,headers:Record<string,string>)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'';
 const cors={'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://zxtt1998.github.io','Vary':'Origin','Access-Control-Allow-Headers':'content-type,x-notebook-key','Access-Control-Allow-Methods':'GET,PUT,OPTIONS'};
 if(origin&&!allowedOrigins.has(origin))return reply({error:'origin_not_allowed'},403,cors);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!['GET','PUT'].includes(req.method))return reply({error:'method_not_allowed'},405,cors);
 const key=req.headers.get('X-Notebook-Key')||'';
 // Custom capability authentication: 256-bit key is never included in public source.
 if(!/^[a-f0-9]{64}$/.test(key))return reply({error:'not_authorized'},401,cors);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
 const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
 const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const api=Deno.env.get('SUPABASE_URL')+'/rest/v1/tianyu_sync_vault?id=eq.'+id;
 const headers:Record<string,string>={apikey:secret,'Content-Type':'application/json'};
 if(!secret.startsWith('sb_secret_'))headers.Authorization='Bearer '+secret;
 try{
  if(req.method==='GET'){
   const r=await fetch(api+'&select=revision,encrypted,updated_at',{headers});
   if(!r.ok)return reply({error:'storage_unavailable'},503,cors);
   const rows=await r.json();if(rows.length!==1)return reply({error:'not_authorized'},401,cors);
   return reply(rows[0],200,cors);
  }
  if(Number(req.headers.get('Content-Length')||0)>4_000_000)return reply({error:'too_large'},413,cors);
  const raw=await req.text();if(raw.length>4_000_000)return reply({error:'too_large'},413,cors);
  const body=JSON.parse(raw);const enc=body.encrypted;
  if(!Number.isSafeInteger(body.revision)||body.revision<0||!enc||enc.version!==1||typeof enc.iv!=='string'||!(/^[A-Za-z0-9+/=]{16}$/.test(enc.iv))||typeof enc.data!=='string'||enc.data.length>3_800_000||!(/^[A-Za-z0-9+/=]+$/.test(enc.data)))return reply({error:'invalid_payload'},400,cors);
  const r=await fetch(api+'&revision=eq.'+body.revision+'&select=revision,updated_at',{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({encrypted:enc,revision:body.revision+1,updated_at:new Date().toISOString()})});
  if(!r.ok)return reply({error:'storage_unavailable'},503,cors);
  const rows=await r.json();if(rows.length===1)return reply(rows[0],200,cors);
  // Distinguish stale revision from missing authentication without disclosing any other vault.
  const check=await fetch(api+'&select=revision',{headers});const existing=check.ok?await check.json():[];
  return reply({error:existing.length?'conflict':'not_authorized'},existing.length?409:401,cors);
 }catch{return reply({error:'storage_unavailable'},503,cors)}
});

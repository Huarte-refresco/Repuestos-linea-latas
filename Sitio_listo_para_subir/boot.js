/* Arranque de la web: acceso por correo (código de un solo uso), datos y planos en Supabase privado. */
(function(){
const CFG=window.MAPA_CONFIG||{};
const $=s=>document.querySelector(s);
const login=$('#login'),lmsg=$('#lmsg');
let sb=null,ROLE=null,EMAIL='';
const say=(t,err)=>{lmsg.textContent=t||'';lmsg.className=err?'err':''};
function show(step){['stEmail','stCode','stPass'].forEach(i=>$('#'+i).hidden=i!==step)}

if(!CFG.url||!CFG.key||/PEGA/.test(CFG.url+CFG.key)){say('Falta configurar config.js (URL y clave de Supabase).',true);return}
sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true}});

// ---------- Capa de compatibilidad: la app original usa claude.use('db' | 'user' | 'downloads') ----------
const subs={},vers={};
async function fetchDoc(path){
  const r=await sb.from('kv').select('data,version').eq('id',path).maybeSingle();
  if(r.error)throw r.error;return r.data;
}
function emit(path,row){(subs[path]||[]).forEach(s=>{try{s.next({exists:!!row,data:()=>row?JSON.parse(JSON.stringify(row.data)):undefined})}catch(e){}})}
async function refresh(path){try{const row=await fetchDoc(path);vers[path]=row?row.version:0;emit(path,row)}catch(e){(subs[path]||[]).forEach(s=>s.err&&s.err(e))}}
async function poll(){
  const paths=Object.keys(subs);if(!paths.length)return;
  try{const r=await sb.from('kv').select('id,version').in('id',paths);if(r.error)throw r.error;
    const cur={};(r.data||[]).forEach(x=>cur[x.id]=x.version);
    for(const p of paths){const v=cur[p]||0;if(vers[p]!==v)await refresh(p)}
  }catch(e){}
}
const dbApi={doc:path=>({
  set:async d=>{const r=await sb.rpc('kv_set',{p_id:path,p_data:d});if(r.error)throw r.error;refresh(path)},
  update:async d=>{const r=await sb.rpc('kv_update',{p_id:path,p_patch:d});
    if(r.error){const e=new Error(r.error.message);e.code=/doc_missing/.test(r.error.message)?'invalid_argument':r.error.code;throw e}refresh(path)},
  onSnapshot:(next,err)=>{(subs[path]=subs[path]||[]).push({next,err});refresh(path);return()=>{subs[path]=(subs[path]||[]).filter(s=>s.next!==next)}}
})};
const userApi={
  me:async()=>({id:EMAIL,name:EMAIL}),
  id:async()=>EMAIL,
  can:async()=>ROLE==='editor',
  profiles:async ids=>Object.fromEntries(ids.map(i=>[i,{id:i,name:i}]))
};
window.claude={use:async n=>{
  if(n==='db')return dbApi;if(n==='user')return userApi;
  if(n==='downloads')return {save:async({filename,data})=>{
    const b=new Blob([data],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');
    a.href=URL.createObjectURL(b);a.download=filename;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);return {status:'saved'}}};
  return null}};
window.PACKFETCH=async(id,pk)=>{
  const r=await sb.storage.from('mapa').download('d/'+id+'/pk'+pk+'.json');
  if(r.error)throw r.error;return JSON.parse(await r.data.text());
};

window.ELECFETCH=async()=>{
  const r=await sb.storage.from('mapa').download('elec.json');
  if(r.error)throw r.error;return JSON.parse(await r.data.text());
};
window.PDFFETCH=async f=>{
  const r=await sb.storage.from('mapa').download(f);
  if(r.error)throw r.error;return await r.data.arrayBuffer();
};

// ---------- Arranque tras iniciar sesión ----------
let started=false,starting=false;
async function start(session){
  if(started||starting)return;
  starting=true;
  try{await start2(session)}finally{starting=false}
}
async function start2(session){
  if(started)return;
  EMAIL=(session.user.email||'').toLowerCase();
  say('Comprobando acceso…');
  const r=await sb.from('allowed_emails').select('role').maybeSingle();
  if(r.error||!r.data){say('El correo '+EMAIL+' no tiene acceso. Pide a Aitor que lo añada.',true);
    $('#stOut').hidden=false;return}
  ROLE=r.data.role;started=true;
  say('Cargando mapa de la línea…');
  const f=await sb.storage.from('mapa').download('data.json');
  if(f.error){say('No se pudieron cargar los datos: '+f.error.message,true);started=false;return}
  window.__DATA=JSON.parse(await f.data.text());
  login.hidden=true;
  const out=document.createElement('button');out.className='cbtn ghost';out.textContent='Salir ('+EMAIL+')';out.title='Cerrar sesión';
  out.onclick=async()=>{await sb.auth.signOut();location.reload()};
  document.querySelector('header .btns').appendChild(out);
  const s=document.createElement('script');s.src='app.js?v='+(CFG.v||'1');
  s.onload=()=>{const e=document.createElement('script');e.src='elec.js?v='+(CFG.v||'1');document.body.appendChild(e)};
  document.body.appendChild(s);
  setInterval(poll,20000);
  try{sb.channel('kv-watch').on('postgres_changes',{event:'*',schema:'public',table:'kv'},()=>poll()).subscribe()}catch(e){}
}
sb.auth.getSession().then(({data})=>{if(data&&data.session)start(data.session);else{say('');show('stEmail')}});
sb.auth.onAuthStateChange((ev,session)=>{if(session&&!started)start(session)});

$('#fEmail').onsubmit=async e=>{e.preventDefault();
  const em=$('#iEmail').value.trim().toLowerCase();if(!em)return;
  say('Enviando código…');
  const r=await sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:true}});
  if(r.error){say('No se pudo enviar el código: '+r.error.message,true);return}
  EMAIL=em;$('#codeTo').textContent=em;show('stCode');say('');$('#iCode').focus();
};
$('#fCode').onsubmit=async e=>{e.preventDefault();
  say('Comprobando…');
  const r=await sb.auth.verifyOtp({email:EMAIL,token:$('#iCode').value.trim(),type:'email'});
  if(r.error){say('Código incorrecto o caducado.',true);return}
};
$('#fPass').onsubmit=async e=>{e.preventDefault();
  say('Entrando…');
  const r=await sb.auth.signInWithPassword({email:$('#pEmail').value.trim().toLowerCase(),password:$('#pPass').value});
  if(r.error){say('Correo o contraseña incorrectos.',true);return}
};
$('#toPass').onclick=()=>{show('stPass');say('')};
$('#toEmail').onclick=()=>{show('stEmail');say('')};
$('#backEmail').onclick=()=>{show('stEmail');say('')};
$('#bOut2').onclick=async()=>{await sb.auth.signOut();location.reload()};
})();

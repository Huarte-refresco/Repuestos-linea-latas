const MACH=window.__DATA.MACH;
const LINE=window.__DATA.LINE;
// Datos de la máquina activa
let M=null,N=[],ROOT=0,VIEWS=[],CODEIDX=new Map(),EQUIPO='',totalParts=0,wear=[];
// RAW fila: [l,pos,code,desc,qty,unit,mark,hours,obs,parent,pages]
const ST={};
MACH.forEach(m=>{ST[m.id]={critmap:m.seed.crit.items||{},critmeta:m.seed.crit.meta||{},stockrows:m.seed.stock.rows||{},stockmeta:m.seed.stock.meta||{},spots:null}});
const dp=k=>'shared/'+k+(M.suffix||'');
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
const K=c=>String(c==null?'':c).replace(/\s+/g,'').toUpperCase();
const fmtQ=q=>q==null||q===''?'':(Math.round(q*1000)/1000).toString().replace('.',',');
const fmtD=iso=>{try{return new Date(iso).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'})}catch(e){return ''}};
const critKey=(code,sap)=>(K(code)+'~'+(sap||'x')).replace(/[^A-Za-z0-9_\-.~:@+]/g,'_').slice(0,190);
function leaves(id,acc=[]){const n=N[id];n.kids.forEach(k=>{if(N[k].kids.length)leaves(k,acc);else acc.push(k)});return acc}
function path(id){const p=[];let c=id;while(c!=null&&c>=0){if(N[c].l>=2)p.unshift(c);c=N[c].parent}return p}
function pathTxt(id){return path(id).map(i=>N[i].pos+' '+N[i].desc).join(' › ')}
// ---------- Imágenes de los planos (paquetes por máquina) ----------
const PK={},IMGC={};
function getPage(m,page){
  const pk=m.pix[page];if(pk==null)return Promise.resolve(null);
  const key=m.id+':'+pk;
  if(!PK[key])PK[key]=window.PACKFETCH(m.id,pk).catch(e=>{delete PK[key];throw e});
  return PK[key].then(o=>{const b=o[page]||null;if(b)IMGC[m.id+':'+page]=b;return b});
}
function loadImgs(root,m){
  root.querySelectorAll('img[data-load]').forEach(img=>{
    const pg=img.dataset.load;
    getPage(m,pg).then(b=>{if(img.isConnected&&b){img.removeAttribute('data-load');img.src='data:image/webp;base64,'+b}}).catch(()=>{if(img.isConnected)img.alt='No se pudo cargar el plano. Recarga la página.'});
  });
}
function imgTag(m,pg,alt){const b=IMGC[m.id+':'+pg];return b?`<img src="data:image/webp;base64,${b}" alt="${alt}">`:`<img data-load="${pg}" alt="Cargando plano…" style="min-height:160px">`}

// ---------- Estado compartido ----------
let DB=null,USER=null,ME=null,CAN=false,LIVE=false;
let CRITMAP={},CRITMETA={},STOCKROWS={},STOCKMETA={};
let CRIT=[];
let critOpen=false;
let dragging=false,modalKind='',cur=null,flat=false,pageIdx=0,hlId=null,zoom=false;
let cf={sel:'all',q:'',edit:null,del:null};
function rebuildCrit(){
  CRIT=Object.entries(CRITMAP).filter(([,v])=>v&&v.code).map(([key,v])=>{
    const r=v.sap?STOCKROWS[v.sap]:null;
    return Object.assign({key,occ:CODEIDX.get(K(v.code))||[],stock:r?r[0]:null,ub:r?r[1]:'',pp:r?r[2]:null,cq:r?r[3]:null,hasRow:!!r},v);
  }).sort((a,b)=>(a.occ[0]??1e9)-(b.occ[0]??1e9));
  N.forEach(n=>{n.crit=[];n.cs=new Set();n.cc=0});
  CRIT.forEach((c,i)=>{c.occ.forEach(o=>{N[o].crit.push(i);let p=o;while(p!=null&&p>=0){N[p].cs.add(i);p=N[p].parent}})});
  N.forEach(n=>{n.cc=n.cs.size});
  $('#nCrit').textContent=CRIT.length;
}
function syncGlobals(){const s=ST[M.id];CRITMAP=s.critmap;CRITMETA=s.critmeta;STOCKROWS=s.stockrows;STOCKMETA=s.stockmeta}
const nameCache={};
async function nameOf(id){if(!id)return '';if(nameCache[id]!==undefined)return nameCache[id];
  try{const ps=await USER.profiles([id]);nameCache[id]=(ps[id]&&ps[id].name)||'';}catch(e){nameCache[id]='';}return nameCache[id]}
async function drawInfo(){
  if(!M){$('#info').textContent=LIVE?'Datos compartidos. Elige una máquina en el esquema o en la lista.':'Instantánea de la publicación (solo lectura). Elige una máquina.';return}
  const c=CRITMETA||{},s=STOCKMETA||{};
  const who=async m=>m.by?await nameOf(m.by):'';
  const wc=await who(c),ws=await who(s);
  const part=(t,m,w)=>m.at?`${t} ${fmtD(m.at)}${w?' por '+esc(w):''}${m.file?' ('+esc(m.file)+')':''}`:`${t} sin cargar`;
  $('#info').innerHTML=(LIVE?'Datos compartidos. ':'Instantánea de la publicación (solo lectura). ')+part('Críticos:',c,wc)+' · '+part('Stock y consumos:',s,ws)+(LIVE&&!CAN?' · Tienes acceso de lectura; para editar pide permiso de colaborador.':'');
}
function toast(t,ms=4200){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{e.hidden=true},ms)}
function onData(){if(!M)return;rebuildCrit();drawInfo();drawGroups();if(!dragging)drawPlan();refreshModal()}

let wq=Promise.resolve();
function enqueue(fn){wq=wq.then(fn).catch(e=>{toast('No se pudo guardar: '+((e&&(e.message||e.code))||'error'))});return wq}
async function dbMerge(path,patch,full){
  try{await DB.doc(path).update(patch)}catch(e){if(e&&e.code==='invalid_argument'){await DB.doc(path).set(full)}else throw e}
}
function metaNow(files){return {at:new Date().toISOString(),by:(ME&&ME.id)||'',file:files||''}}
function saveItems(changes){
  if(!DB||!CAN)return;
  Object.entries(changes).forEach(([k,v])=>{if(v)CRITMAP[k]=v;else delete CRITMAP[k]});ST[M.id].critmap=CRITMAP;
  ST[M.id].critmeta=CRITMETA=metaNow(CRITMETA&&CRITMETA.file||'');onData();
  const items={};Object.entries(changes).forEach(([k,v])=>{items[k]=v||null});
  const meta=metaNow('edición manual');
  return enqueue(()=>dbMerge(dp('crit'),{items,meta},{items:Object.fromEntries(Object.entries(CRITMAP)),meta}));
}
function addCrit(n){
  const key=critKey(n.code,'');
  if(CRITMAP[key]){toast('Ya está en la lista de críticos');return}
  saveItems({[key]:{code:n.code,desc:n.desc,sap:'',match:'',src:['Añadido en el mapa'],by:(ME&&ME.id)||'',at:new Date().toISOString()}});
  toast('Marcada como crítica. Añade su Nº SAP en la lista de críticos para ver el stock.');
}
function removeCrit(idx){const ch={};idx.forEach(i=>{ch[CRIT[i].key]=null});saveItems(ch)}
function editSap(key,sap){
  const it=CRITMAP[key];if(!it)return;sap=String(sap||'').trim();
  if(sap===it.sap)return;
  const nk=critKey(it.code,sap);
  const ni=Object.assign({},it,{sap,match:sap?'Manual':'',by:(ME&&ME.id)||'',at:new Date().toISOString()});
  saveItems({[key]:null,[nk]:ni});
  if(sap&&!STOCKROWS[sap])toast('Ese SAP no tiene stock cargado todavía. Carga el Excel de stock para verlo.');
}

// ---------- Plano ----------
let curView=0;
function spotKey(s){return (s.pos+'_'+s.code).replace(/[^A-Za-z0-9_\-.~:@+]/g,'_')}
function drawTabs(){
  const t=$('#tabs');t.innerHTML='';
  if(!VIEWS.length){t.innerHTML='<b>Grupos de la máquina</b><span class="hint">Pulsa un grupo para abrir su despiece</span>';return}
  const mk=(i,txt)=>{const b=document.createElement('button');b.className='tab'+(i===curView?' on':'');b.textContent=txt;b.onclick=()=>{curView=i;drawTabs();drawPlan()};t.appendChild(b)};
  mk(-1,'Todos los módulos');
  VIEWS.forEach((v,i)=>mk(i,v.name));
  const h=document.createElement('span');h.className='hint';h.textContent=curView<0?'Todos los módulos con sus puntos':'Arrastra los puntos para recolocarlos';t.appendChild(h);
}
function fillPlan(p,v){
  p.insertAdjacentHTML('afterbegin',imgTag(M,v.page,esc(v.name)));
  const tip=document.createElement('div');tip.className='tip';tip.style.display='none';p.appendChild(tip);
  v.spots.forEach(s=>{
    const n=N[s.id];const d=document.createElement('div');
    d.className='hs'+(s.est?' est':'')+(n.kids.length?'':' leaf');d.textContent=n.pos;
    d.style.left=s.x+'%';d.style.top=s.y+'%';
    if(n.cc){const b=document.createElement('span');b.className='cb';b.textContent='★'+n.cc;d.appendChild(b)}
    d.addEventListener('mouseenter',()=>{tip.textContent=n.pos+' · '+n.desc+(n.kids.length?' ('+leaves(n.id).length+' piezas)':'')+(n.cc?' · ★ '+n.cc+' críticas':'');tip.style.display='block'});
    d.addEventListener('mousemove',()=>{tip.style.left=d.offsetLeft+'px';tip.style.top=d.offsetTop+'px'});
    d.addEventListener('mouseleave',()=>{tip.style.display='none'});
    let sx,sy,moved=false;
    d.addEventListener('pointerdown',e=>{d.setPointerCapture(e.pointerId);sx=e.clientX;sy=e.clientY;moved=false;d.classList.add('drag')});
    d.addEventListener('pointermove',e=>{if(!d.hasPointerCapture(e.pointerId))return;
      if(!moved&&Math.hypot(e.clientX-sx,e.clientY-sy)<5)return;
      if(!CAN&&LIVE){return}
      moved=true;dragging=true;
      const r=p.getBoundingClientRect();s.x=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));s.y=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));
      d.style.left=s.x+'%';d.style.top=s.y+'%'});
    d.addEventListener('pointerup',e=>{d.classList.remove('drag');
      if(moved){dragging=false;s.est=false;d.classList.remove('est');saveSpot(v,s);return}
      if(n.kids.length)openNode(n.id);else openNode(n.parent,n.id)});
    d.addEventListener('pointercancel',()=>{d.classList.remove('drag');dragging=false});
    p.appendChild(d);
  });
}
function viewGroup(v){const s=v.spots.find(x=>x.id>=0);return s?N[s.id].parent:null}
function drawPlan(){
  const p=$('#plan');
  if(!VIEWS.length){
    p.className='plan';
    p.innerHTML='<div class="grid">'+N[ROOT].kids.map(k=>{const n=N[k];const c=n.kids.length?leaves(k).length:1;return `<div class="g" data-id="${k}"><b>${n.pos}</b><span class="d">${esc(n.desc)}</span><span class="p">${esc(n.code)}</span><span class="c">${c} pz${n.cc?`<span class="cb2">★${n.cc}</span>`:''}</span></div>`}).join('')+'</div>';
    p.style.userSelect='auto';
    $('#planNote').innerHTML='Esta máquina todavía no tiene plano general con puntos; entra por los grupos. <b style="color:var(--crit-ink)">★n</b> = n repuestos críticos dentro.';
    return}
  if(curView<0){
    p.className='genv';p.innerHTML='';
    const shown=new Set();
    const io=('IntersectionObserver' in window)?new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);loadImgs(e.target,M)}}),{rootMargin:'600px'}):null;
    VIEWS.forEach(v=>{
      const gid=viewGroup(v);if(gid!=null)shown.add(gid);
      const blk=document.createElement('div');blk.className='blk';
      const g=gid!=null?N[gid]:null;
      const h=document.createElement('div');h.className='gh';
      h.innerHTML=`<b>${esc(v.name)}</b>${g&&g.cc?`<span class="cb2">★${g.cc}</span>`:''}<span class="gr">${v.spots.length} puntos</span>${g?`<button class="mini go" data-og="${g.id}">Abrir módulo ›</button>`:''}`;
      blk.appendChild(h);
      const pl=document.createElement('div');pl.className='plan';blk.appendChild(pl);
      p.appendChild(blk);
      fillPlan(pl,v);
      if(io&&pl.querySelector('img[data-load]'))io.observe(pl);else loadImgs(pl,M);
    });
    const rest=N[ROOT].kids.filter(k=>!shown.has(k));
    if(rest.length){
      const o=document.createElement('div');o.className='blk';
      o.innerHTML='<div class="gh"><b>Otros grupos sin plano con puntos</b><span class="gr">pulsa para abrir su despiece</span></div><div class="grid">'+rest.map(k=>{const n=N[k];const c=n.kids.length?leaves(k).length:1;return `<div class="g" data-id="${k}"><b>${n.pos}</b><span class="d">${esc(n.desc)}</span><span class="p">${esc(n.code)}</span><span class="c">${c} pz${n.cc?`<span class="cb2">★${n.cc}</span>`:''}</span></div>`}).join('')+'</div>';
      p.appendChild(o);
    }
    $('#planNote').innerHTML='Vista general: todos los módulos con sus puntos. Un clic en un punto abre ese subconjunto. <b>Naranja</b> = subconjunto, <b style="color:var(--blue)">azul</b> = pieza suelta, <b style="color:var(--crit-ink)">★n</b> = n repuestos críticos dentro.';
    return}
  const v=VIEWS[curView];p.className='plan';p.innerHTML='';
  fillPlan(p,v);loadImgs(p,M);
  const est=v.spots.filter(s=>s.est).length;
  $('#planNote').innerHTML='Un clic abre el subconjunto. <b>Naranja</b> = subconjunto, <b style="color:var(--blue)">azul</b> = pieza suelta, <b style="color:var(--crit-ink)">★n</b> = n repuestos críticos dentro. '+(CAN?'Las posiciones que muevas se guardan para todos.':'Las posiciones las guarda quien tenga permiso de edición.')+(est?` ${est} puntos con borde discontinuo están sin colocar o estimados.`:'');
}
$('#plan').addEventListener('click',e=>{const b=e.target.closest('[data-og]');if(b)openNode(+b.dataset.og)});
function saveSpot(v,s){
  if(!DB||!CAN)return;
  const patch={pos:{[v.id]:{[spotKey(s)]:{x:+s.x.toFixed(2),y:+s.y.toFixed(2)}}}};
  enqueue(()=>dbMerge(dp('spots'),patch,patch));
}
function applySpots(d){
  const pos=(d&&d.pos)||{};
  VIEWS.forEach(v=>{v.spots.forEach(s=>{const r=pos[v.id]&&pos[v.id][spotKey(s)];if(r){s.x=r.x;s.y=r.y;s.est=false}})});
}

// ---------- Lista de grupos / buscador ----------
function drawGroups(){
  $('#groups').innerHTML=N[ROOT].kids.map(k=>{const n=N[k];const c=n.kids.length?leaves(k).length:1;
    return `<div class="it" data-id="${k}"><b>${n.pos}</b><span class="d">${esc(n.desc)}<span class="p">${esc(n.code)}</span></span><span class="c">${c} pz${n.cc?`<span class="cb2">★${n.cc}</span>`:''}</span></div>`}).join('');
}
$('#plan').addEventListener('click',e=>{const g=e.target.closest('.g');if(!g)return;const id=+g.dataset.id;N[id].kids.length?openNode(id):openNode(ROOT,id)});
$('#groups').onclick=e=>{const it=e.target.closest('.it');if(!it)return;const id=+it.dataset.id;N[id].kids.length?openNode(id):openNode(ROOT,id)};
$('#q').addEventListener('input',e=>{
  const q=norm(e.target.value);const box=$('#res');
  if(q.length<2){box.style.display='none';return}
  const out=[];for(const n of N){if(n.l<2)continue;if(norm(n.code).includes(q)||norm(n.desc).includes(q)){out.push(n);if(out.length>=80)break}}
  box.style.display='block';
  box.innerHTML=out.length?out.map(n=>`<div class="it" data-id="${n.id}"><b>${esc(n.pos)}</b><span class="d">${esc(n.desc)}<span class="p">${esc(n.code)} · ${esc(pathTxt(n.parent))}</span></span></div>`).join(''):'<div class="it">Sin resultados</div>';
});
$('#res').onclick=e=>{const it=e.target.closest('.it');if(!it||!it.dataset.id)return;const n=N[+it.dataset.id];openNode(n.parent,n.id)};

// ---------- Panel superpuesto ----------
const ov=$('#ov'),modal=$('#modal');
function openNode(id,hl,keepFlat){modalKind='node';cur=id;hlId=hl==null?null:hl;pageIdx=0;zoom=false;if(!keepFlat)flat=false;ov.classList.add('on');renderNode()}
function close(){ov.classList.remove('on');modalKind=''}
function refreshModal(){if(!ov.classList.contains('on'))return;if(modalKind==='node')renderNode();else if(modalKind==='crit')critModal(true);else if(modalKind==='list'&&lastList)listModal(...lastList)}
ov.addEventListener('click',e=>{if(e.target===ov)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
function critInfo(n){
  return n.crit.map(i=>CRIT[i]).map(c=>`<span class="sub"><b>★ Crítica</b> · SAP ${c.sap?esc(c.sap):'<i>sin cruzar</i>'}${c.sap&&c.hasRow?' · stock '+(c.stock===0?'<span class="z">0</span>':fmtQ(c.stock)):''}${c.ub?' · '+esc(c.ub):''}</span>`).join('');
}
function actBtn(n){
  if(!CAN)return '';
  return n.crit.length?`<button class="mini danger" data-unmark="${n.id}">Quitar de críticos</button>`:`<button class="mini" data-mark="${n.id}">☆ Marcar como crítica</button>`;
}
function row(n,ind){
  const isA=n.kids.length>0;
  const cr=n.crit.map(i=>CRIT[i]);
  const ci=critInfo(n)+actBtn(n);
  if(isA){const c=leaves(n.id).length;
    return `<tr class="asm${cr.length?' crit':''}" data-open="${n.id}" data-row="${n.id}"><td class="n">${n.pos}</td><td class="code">${esc(n.code)}</td><td style="padding-left:${8+ind*14}px">▸ ${esc(n.desc)}${ci}</td><td class="n">${fmtQ(n.qty)}</td><td></td><td class="n"></td><td><span class="open">abrir · ${c} pz${n.pages.length?' · p.'+n.pages[0]:''}</span>${n.cc?`<span class="cb2">★${n.cc}</span>`:''}</td></tr>`}
  return `<tr data-row="${n.id}" class="${(n.mark==='V'?'v ':'')+(cr.length?'crit':'')}"><td class="n">${n.pos}</td><td class="code">${esc(n.code)}</td><td style="padding-left:${8+ind*14}px">${esc(n.desc)}${ci}</td><td class="n">${fmtQ(n.qty)}</td><td>${n.mark?`<span class="tag ${n.mark}">${n.mark}</span>`:''}</td><td class="n">${n.hours?n.hours.toLocaleString('es-ES'):''}</td><td style="text-align:center">${n.obs==='J'?'✓':''}</td></tr>`;
}
function csvQ(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'}
function dlCsv(name,h,rows){saveFile(name,'\ufeff'+[h].concat(rows).map(r=>r.map(csvQ).join(';')).join('\n'))}
function csvSub(){
  const n=N[cur],rows=[];
  [...n.cs].forEach(i=>{const c=CRIT[i];c.occ.filter(o=>inSub(o,cur)).forEach(o=>rows.push([pathTxt(N[o].parent),c.code,c.desc,c.sap,c.stock,c.ub,c.cq]))});
  dlCsv('criticos_'+M.id+'_'+String(n.pos).replace(/\W+/g,'')+'.csv',['Subconjunto','Código KHS','Descripción','Nº SAP','Stock','Ubicación','Consumo 4 años'],rows);
}
function csvList(){
  if(!lastList)return;const [title,items,cols]=lastList;
  dlCsv(title.replace(/[^\wáéíóúñÁÉÍÓÚ]+/g,'_').slice(0,50)+'.csv',['Código KHS','Descripción','Subconjunto','Uds','Duración (h)','Crítica','Nº SAP','Stock'],
   items.map(n=>{const c=n.crit.length?CRIT[n.crit[0]]:null;return [n.code,n.desc,pathTxt(n.parent),n.qty,n.hours||'',c?'Sí':'',c?c.sap:'',c&&c.hasRow?c.stock:'']}));
}
function inSub(o,r){let p=o;while(p!=null&&p>=0){if(p===r)return true;p=N[p].parent}return false}
function subCrit(){
  const ids=[...N[cur].cs];if(!ids.length)return '';
  let rows='';
  ids.forEach(i=>{const c=CRIT[i];
    c.occ.filter(o=>inSub(o,cur)).forEach(o=>{const p=N[o].parent;
      const stk=c.sap?(c.hasRow?(c.stock===0?'<span class="z">0</span>':fmtQ(c.stock)):'<span class="gr">—</span>'):'';
      rows+=`<tr><td><a class="lnk" data-gohl="${p},${o}">${esc(N[p].pos+' '+N[p].desc)}</a></td><td class="code">${esc(c.code)}</td><td>${esc(c.desc)}</td><td class="code">${c.sap?esc(c.sap):'<span class="gr">sin cruzar</span>'}</td><td class="n">${stk}</td><td>${esc(c.ub)}</td></tr>`})});
  return `<details class="cdet"${critOpen?' open':''}><summary>★ Piezas críticas en este subnivel (${ids.length})</summary><div style="padding:4px 12px"><button class="mini" data-dlsub>⬇ Descargar lista (CSV)</button></div><div style="max-height:240px;overflow:auto"><table><thead><tr><th>Dónde está</th><th>Código KHS</th><th>Descripción</th><th>Nº SAP</th><th class="n">Stock</th><th>Ubic.</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
function renderNode(){
  const n=N[cur];const pth=path(cur);
  const crumb=['<a data-go="'+ROOT+'">'+esc(M.short)+'</a>'].concat(pth.map((i,k)=>k===pth.length-1?esc(N[i].pos+' '+N[i].desc):`<a data-go="${i}">${esc(N[i].pos+' '+N[i].desc)}</a>`)).join(' › ');
  let body='';
  if(flat){
    const walk2=(id,d)=>{N[id].kids.forEach(k=>{const c=N[k];if(c.kids.length){body+=`<tr class="asm${c.crit.length?' crit':''}" data-open="${c.id}" data-row="${c.id}"><td class="n">${c.pos}</td><td class="code">${esc(c.code)}</td><td style="padding-left:${8+d*14}px">▸ ${esc(c.desc)}${critInfo(c)}${actBtn(c)}</td><td class="n">${fmtQ(c.qty)}</td><td></td><td></td><td><span class="open">abrir${c.pages.length?' · p.'+c.pages[0]:''}</span>${c.cc?`<span class="cb2">★${c.cc}</span>`:''}</td></tr>`;walk2(k,d+1)}else body+=row(c,d)})};
    walk2(cur,0)}
  else body=n.kids.map(k=>row(N[k],0)).join('');
  const lv=leaves(cur),nv=lv.filter(i=>N[i].mark==='V').length;
  const pgs=n.pages.length;
  let pic;
  if(!pgs||M.pix[n.pages[Math.min(pageIdx,pgs-1)]]==null)pic='<div class="nopic">Este elemento no tiene plano propio en el PDF.<br>Consulta el plano del subconjunto superior.</div>';
  else pic=(pgs>1?`<div class="pgs"><span>Planos:</span>${n.pages.map((p,i)=>`<button class="${i===pageIdx?'on':''}" data-pg="${i}">pág. ${p}</button>`).join('')}</div>`:'')+imgTag(M,n.pages[Math.min(pageIdx,pgs-1)],'Despiece');
  const keepScroll=modal.querySelector('.tbl')?modal.querySelector('.tbl').scrollTop:0;
  modal.innerHTML=`<div class="mh"><div><h2>${esc(n.pos)} · ${esc(n.desc)}</h2><div class="crumb">${crumb} · <span class="code">${esc(n.code)}</span></div></div><button class="x" data-close aria-label="Cerrar">✕</button></div>
  <div class="mb"><div class="pic${zoom?' zoom':''}" id="pic">${pic}</div>
  <div class="tbl"><div class="tt"><label><input type="checkbox" id="chFlat" ${flat?'checked':''}> Ver todos los niveles</label><span class="sum">${lv.length} piezas · ${nv} de desgaste${n.cc?` · <b style="color:var(--crit-ink)">★ ${n.cc} críticas</b>`:''}</span></div>
  ${subCrit()}<div class="legend"><i style="background:var(--wear)"></i>Pieza de desgaste (V) con duración en horas<i style="background:var(--crit)"></i>Repuesto crítico<i style="background:var(--tag-e)"></i>E = pieza de repuesto<span style="margin-left:10px">✓ = KHS recomienda tener stock</span></div>
  <table><thead><tr><th class="n">Pos.</th><th>Código</th><th>Descripción</th><th class="n">Uds</th><th>Tipo</th><th class="n">Duración (h)</th><th>Stock cliente</th></tr></thead><tbody>${body||'<tr><td colspan="7" class="nopic">Sin componentes</td></tr>'}</tbody></table></div></div>`;
  loadImgs(modal,M);
  if(hlId!=null){const r=modal.querySelector(`[data-row="${hlId}"]`);if(r){r.classList.add('hl');setTimeout(()=>r.scrollIntoView({block:'center'}),30)}}
  else if(keepScroll){const t=modal.querySelector('.tbl');if(t)t.scrollTop=keepScroll}
}
modal.addEventListener('click',e=>{
  const t=e.target;
  if(t.closest('[data-close]'))return close();
  const mk=t.closest('[data-mark]');if(mk){e.stopPropagation();return addCrit(N[+mk.dataset.mark])}
  const um=t.closest('[data-unmark]');if(um){e.stopPropagation();return removeCrit(N[+um.dataset.unmark].crit.slice())}
  if(t.closest('[data-dlsub]'))return csvSub();
  const gh=t.closest('[data-gohl]');if(gh){const [a,b]=gh.dataset.gohl.split(',').map(Number);return openNode(a,b)}
  const g=t.closest('[data-go]');if(g)return openNode(+g.dataset.go);
  const o=t.closest('[data-open]');if(o)return openNode(+o.dataset.open);
  const pg=t.closest('[data-pg]');if(pg){pageIdx=+pg.dataset.pg;return renderNode()}
  if(t.id==='chFlat'){flat=t.checked;return openNode(cur,null,true)}
  if(t.tagName==='IMG'&&t.closest('#pic')){zoom=!zoom;$('#pic').classList.toggle('zoom',zoom)}
});

modal.addEventListener('toggle',e=>{if(e.target.classList&&e.target.classList.contains('cdet'))critOpen=e.target.open},true);
// ---------- Descargas ----------
async function saveFile(filename,data){
  try{const dl=await claude.use('downloads');if(!dl){toast('Este visor no permite descargas');return}await dl.save({filename,data})}
  catch(e){if(!e||e.code!=='declined')toast('No se pudo descargar el archivo')}
}

// ---------- Lista de críticos ----------
function critLinks(c){
  const seen=new Set(),L=[];
  c.occ.forEach(o=>{const p=N[o].parent;if(seen.has(p))return;seen.add(p);L.push([p,o])});
  if(!L.length)return '<span class="gr">No figura en el despiece</span>';
  const f=x=>`<a class="lnk" data-p="${x[0]}" data-o="${x[1]}">${esc(pathTxt(x[0]).split(' › ').slice(-2).join(' › '))}</a>`;
  return L.slice(0,3).map(f).join('')+(L.length>3?`<span class="gr">+${L.length-3} ubicaciones más</span>`:'');
}
// Origen de cada crítico: según parada, según manual o eléctrico (los eléctricos los aporta elec.js)
function critAll(){
  CRIT.forEach(c=>{c.isElec=false});
  const x=window.CRITEXTRA?window.CRITEXTRA():null;
  if(!x||!x.length)return CRIT;
  const idx=new Map();CRIT.forEach(c=>idx.set(K(c.code),c));
  const extra=[];
  x.forEach(p=>{const c=idx.get(K(p.code));if(c){c.isElec=true;c.epg=p.epg;c.etag=p.etag}else extra.push(p)});
  return CRIT.concat(extra);
}
function critOrig(c){
  const s=c.src||[],o=[];
  if(s.some(x=>/parada/i.test(x)))o.push('parada');
  if(s.some(x=>/manual/i.test(x)))o.push('manual');
  if(c.elec||c.isElec)o.push('elec');
  if(!o.length)o.push('otro');
  return o;
}
const ORIG_LAB={parada:'Parada',manual:'Manual',elec:'⚡ Eléctrico',otro:'Otro'};
const ORIG_COL={parada:'var(--blue,#1c64c8)',manual:'#b7791f',elec:'var(--crit-ink,#c92a2a)',otro:'var(--mut,#667)'};
const origBadges=c=>critOrig(c).map(k=>`<span title="${k==='otro'?esc((c.src||[]).join(' + ')):''}" style="display:inline-block;margin:1px 3px 1px 0;padding:0 7px;border:1px solid ${ORIG_COL[k]};color:${ORIG_COL[k]};border-radius:10px;font-size:11px;white-space:nowrap">${ORIG_LAB[k]}</span>`).join('');
function critFiltered(){
  const q=norm(cf.q);
  return critAll().filter(c=>{
    if(cf.sel==='o_parada'&&!critOrig(c).includes('parada'))return false;if(cf.sel==='o_manual'&&!critOrig(c).includes('manual'))return false;if(cf.sel==='o_elec'&&!critOrig(c).includes('elec'))return false;if(cf.sel==='o_otro'&&!critOrig(c).includes('otro'))return false;
    if(cf.sel==='sap'&&!c.sap)return false;if(cf.sel==='nosap'&&c.sap)return false;if(cf.sel==='s0'&&!(c.sap&&c.hasRow&&!c.stock))return false;if(cf.sel==='nodesp'&&c.occ.length)return false;
    if(q&&!(norm(c.code).includes(q)||norm(c.desc).includes(q)||norm(c.sap).includes(q)))return false;return true});
}
function critModal(refresh){
  modalKind='crit';
  const ae=document.activeElement;const aid=ae&&ae.id&&modal.contains(ae)?ae.id:'';const asel=aid&&ae.selectionStart!=null?ae.selectionStart:0;
  const q=norm(cf.q);
  const list=critFiltered();
  const conSap=CRIT.filter(c=>c.sap).length,s0=CRIT.filter(c=>c.sap&&c.hasRow&&!c.stock).length;
  const ALL=critAll(),nOr=k=>ALL.filter(c=>critOrig(c).includes(k)).length;
  const rows=list.map(c=>{
    let sapCell;
    if(cf.edit===c.key)sapCell=`<input id="eSap" class="code" style="width:110px" value="${esc(c.sap)}" placeholder="Nº SAP"><br><button class="mini go" data-esave="${esc(c.key)}">Guardar</button> <button class="mini" data-ecancel>Cancelar</button>`;
    else sapCell=(c.sap?esc(c.sap)+(c.match==='Aproximada'?' <span class="gr" title="Coincidencia aproximada (Contiene)">~</span>':''):'<span class="gr">sin cruzar</span>');
    let act='';
    if(CAN&&!c.elec){
      if(cf.del===c.key)act=`<span class="gr">¿Quitar?</span> <button class="mini danger" data-dyes="${esc(c.key)}">Sí</button> <button class="mini" data-dno>No</button>`;
      else act=`<button class="mini" data-edit="${esc(c.key)}">SAP</button> <button class="mini danger" data-del="${esc(c.key)}">Quitar</button>`;
    }
    const stk=c.sap?(c.hasRow?(c.stock===0?'<span class="z">0</span>':fmtQ(c.stock)):'<span class="gr" title="Sin stock cargado para este SAP">—</span>'):'';
    const eln=(c.elec||c.isElec)&&c.epg?`<br><a data-epg2="${c.epg}" data-tag="${esc(c.etag||'')}" style="color:var(--crit-ink,#c92a2a);cursor:pointer;text-decoration:underline;font-size:12px">⚡ Ver en el esquema · pág. ${c.epg}</a>`:'';
    return `<tr><td>${c.elec?'<span class="gr">Esquema eléctrico</span>':critLinks(c)}${eln}</td><td class="code">${esc(c.code)}</td><td>${esc(c.desc)}</td><td>${origBadges(c)}</td><td class="code">${sapCell}</td><td class="n stk" title="${c.pp!=null?'Punto de pedido: '+fmtQ(c.pp):''}">${stk}</td><td>${esc(c.ub)}</td><td class="n">${c.cq==null?'':fmtQ(c.cq)}</td>${CAN?`<td>${act}</td>`:''}</tr>`}).join('');
  modal.innerHTML=`<div class="mh"><div><h2>★ Repuestos críticos · ${esc(M.name)}${EQUIPO?` (equipo ${esc(EQUIPO)})`:''}</h2><div class="crumb">${ALL.length} críticos (${nOr('parada')} según parada · ${nOr('manual')} según manual · ${nOr('elec')} eléctricos${nOr('otro')?' · '+nOr('otro')+' otros':''}) · ${conSap} con SAP · ${s0} con stock 0 · ${CRIT.filter(c=>c.occ.length).length} localizados en el despiece</div></div><button class="x" data-close aria-label="Cerrar">✕</button></div>
  <div class="fbar"><select id="cfSel" aria-label="Filtro"><option value="all">Todos</option><option value="o_parada">Origen: según parada (libro de operaciones)</option><option value="o_manual">Origen: según manual</option><option value="o_elec">Origen: ⚡ eléctricos (esquema)</option><option value="o_otro">Origen: otros</option><option value="sap">Con SAP</option><option value="nosap">Sin cruzar con SAP</option><option value="s0">Con SAP y stock 0</option><option value="nodesp">No figuran en el despiece</option></select><input id="cfQ" type="search" placeholder="Filtrar código, descripción o SAP…" value="${esc(cf.q)}"><button id="cfCsv">Descargar CSV</button>${CAN?'<button id="cfUp">Cargar Excel</button>':''}<span class="crumb">${list.length} filas · consumo = unidades consumidas en este equipo en los últimos 4 años</span></div>
  <div class="tbl" style="max-height:72vh"><table><thead><tr><th style="top:0">Subconjunto</th><th style="top:0">Código KHS</th><th style="top:0">Descripción</th><th style="top:0">Origen</th><th style="top:0">Nº SAP</th><th class="n" style="top:0">Stock</th><th style="top:0">Ubic.</th><th class="n" style="top:0">Consumo 4 años</th>${CAN?'<th style="top:0"></th>':''}</tr></thead><tbody>${rows||`<tr><td colspan="9" class="nopic">${ALL.length?'Ninguna fila con ese filtro.':'Todavía no hay repuestos críticos cargados. Usa «Cargar Excel» para subir la lista.'}</td></tr>`}</tbody></table></div>`;
  $('#cfSel').value=cf.sel;
  if(aid){const el=document.getElementById(aid);if(el){el.focus();if(el.setSelectionRange&&asel!=null)try{el.setSelectionRange(asel,asel)}catch(e){}}}
  if(cf.edit&&!refresh){const el=$('#eSap');if(el){el.focus();el.select()}}
  ov.classList.add('on');
}
modal.addEventListener('change',e=>{if(modalKind==='crit'&&e.target.id==='cfSel'){cf.sel=e.target.value;critModal()}});
modal.addEventListener('input',e=>{if(modalKind==='crit'&&e.target.id==='cfQ'){cf.q=e.target.value;critModal(true)}});
modal.addEventListener('click',e=>{
  if(modalKind!=='crit')return;const t=e.target;
  const a=t.closest('.lnk');if(a)return openNode(+a.dataset.p,+a.dataset.o);
  if(t.id==='cfCsv')return csvCrit();
  if(t.id==='cfUp')return openUpload();
  const ed=t.closest('[data-edit]');if(ed){cf.edit=ed.dataset.edit;cf.del=null;return critModal()}
  if(t.closest('[data-ecancel]')){cf.edit=null;return critModal()}
  const sv=t.closest('[data-esave]');if(sv){const v=$('#eSap').value;cf.edit=null;editSap(sv.dataset.esave,v);return critModal()}
  const dl=t.closest('[data-del]');if(dl){cf.del=dl.dataset.del;cf.edit=null;return critModal()}
  if(t.closest('[data-dno]')){cf.del=null;return critModal()}
  const dy=t.closest('[data-dyes]');if(dy){const k=dy.dataset.dyes;cf.del=null;saveItems({[k]:null});return}
});
function csvCrit(){
  const list=critFiltered();const h=['Subconjunto','Código KHS','Descripción','Nº SAP','Stock','Ubicación','Consumo 4 años','Fuente','Origen'];
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const csv='﻿'+[h.map(q).join(';')].concat(list.map(c=>[c.occ.length?[...new Set(c.occ.map(o=>pathTxt(N[o].parent)))].join(' | '):'No figura en el despiece',c.code,c.desc,c.sap,c.stock,c.ub,c.cq,(c.src||[]).join(' + '),critOrig(c).map(k=>ORIG_LAB[k]).join(' + ')].map(q).join(';'))).join('\n');
  saveFile('repuestos_criticos_'+M.id+'.csv',csv);
}
$('#bCrit').onclick=()=>{cf={sel:'all',q:'',edit:null,del:null};critModal()};

// ---------- Otras listas ----------
let lastList=null;
function listModal(title,items,cols){
  modalKind='list';lastList=[title,items,cols];
  const cc=n=>n.crit.length?n.crit.map(i=>CRIT[i]).map(c=>`<b style="color:var(--crit-ink)">★ Crítica</b>${c.sap?' · SAP '+esc(c.sap):' · <i>sin SAP</i>'}${c.sap&&c.hasRow?' · stock '+(c.stock===0?'<span class="z">0</span>':fmtQ(c.stock)):''}`).join('<br>'):'';
  const rows=items.map(n=>`<tr data-jump="${n.id}"${n.crit.length?' class="crit"':''}><td class="code">${esc(n.code)}</td><td>${esc(n.desc)}</td><td>${esc(pathTxt(n.parent).split(' › ').slice(-2).join(' › '))}</td><td class="n">${fmtQ(n.qty)}</td>${cols==='w'?`<td class="n">${n.hours?n.hours.toLocaleString('es-ES'):''}</td>`:''}<td>${cc(n)}</td></tr>`).join('');
  modal.innerHTML=`<div class="mh"><h2>${esc(title)}</h2><span class="crumb">${items.length} piezas · ${items.filter(n=>n.crit.length).length} críticas · clic en una fila para abrir su subconjunto</span><button class="mini" id="lsCsv">⬇ CSV</button><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="tbl" style="max-height:78vh"><table><thead><tr><th style="top:0">Código</th><th style="top:0">Descripción</th><th style="top:0">Subconjunto</th><th class="n" style="top:0">Uds</th>${cols==='w'?'<th class="n" style="top:0">Duración (h)</th>':''}<th style="top:0">¿Crítica?</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const lb=$('#lsCsv');if(lb)lb.onclick=csvList;
  modal.querySelector('tbody').onclick=e=>{const r=e.target.closest('[data-jump]');if(r){const n=N[+r.dataset.jump];openNode(n.parent,n.id)}};
  ov.classList.add('on');
}
$('#bWear').onclick=()=>listModal('Piezas de desgaste (V), ordenadas por duración',[...wear].sort((a,b)=>(a.hours||1e9)-(b.hours||1e9)),'w');
$('#bAll').onclick=()=>listModal('Todas las piezas · '+M.short,N.filter(n=>n.l>1&&!n.kids.length),'a');

// ---------- Carga de Excel ----------
function detect(rows){
  for(let r=0;r<Math.min(8,rows.length);r++){
    const cells=(rows[r]||[]).map(norm);
    const ci=(...alts)=>cells.findIndex(c=>alts.includes(c));
    const cMat=ci('material','n sap','nº sap','no sap','numero sap','sap');
    const cStock=ci('stock real'),cPP=ci('punto pedido'),cEq=ci('equipo'),cQ=ci('cantidad consumida');
    if(cMat>=0&&cStock>=0&&cPP>=0)return {kind:'stock',hdr:r,c:{mat:cMat,stock:cStock,pp:cPP,ub:ci('ubic.','ubic','ubicacion'),alt:cells.map((c,i)=>(c.includes('material antiguo')||/^n.?fb$/.test(c))?i:-1).filter(i=>i>=0)}};
    if(cEq>=0&&cMat>=0&&cQ>=0)return {kind:'cons',hdr:r,c:{eq:cEq,mat:cMat,q:cQ,ref:ci('referencia proveedor'),desc:ci('texto breve de material'),crit:ci('critico')}};
    const cCode=ci('codigo fabricante','codigo khs','cod. khs','codigo','n fabricante');
    if(cCode>=0&&cMat>=0)return {kind:'crit',hdr:r,c:{code:cCode,desc:ci('descripcion','denominacion'),sap:cMat,match:ci('tipo coincidencia'),stock:ci('stock real')}};
  }
  return null;
}
const S=v=>v==null?'':(typeof v==='number'?String(v):String(v).trim());
// Excel de críticos con hojas «según parada» (RC con x), «según manual» (todas) y «esquema eléctrico» (RC con x)
const rcName=n=>{n=norm(n);return /esquema/.test(n)?'el':/manual/.test(n)?'all':/parada|libro de operaciones/.test(n)?'x':''};
function resolveRc(f,all){
  const H=all.slice(0,5).map(r=>(r||[]).map(norm));
  const W=all.slice(0,400).reduce((m,r)=>Math.max(m,(r||[]).length),0);
  let hdr=-1;
  H.forEach((r,i)=>{if(r.some(c=>c==='rc'||c==='codigo'||c==='codigo khs'||c.startsWith('numero de identificat')||c.startsWith('descripcion')||c.startsWith('denominacion')))hdr=i});
  const colBy=fn=>{for(let i=0;i<W;i++)for(let r=0;r<=hdr;r++)if(fn(H[r][i]||''))return i;return -1};
  let cCode=colBy(c=>c.startsWith('numero de identificat'));
  if(cCode<0)cCode=colBy(c=>c==='codigo khs'||c==='cod. khs');
  if(cCode<0)cCode=colBy(c=>c==='codigo');
  if(cCode<0)cCode=colBy(c=>c==='identificacion');
  const data=all.slice(hdr+1);
  if(cCode<0){let best=0;const re=/^([A-Za-z]?\d{6,}[A-Za-z]?\d*)$/;
    for(let i=0;i<Math.min(W,40);i++){const v=new Set();data.forEach(r=>{const x=S(r[i]);if(re.test(x))v.add(x)});if(v.size>best){best=v.size;cCode=i}}
    if(best<3)cCode=-1}
  if(cCode<0)return;
  let cDesc=colBy(c=>c.startsWith('descripcion')||c.startsWith('denominacion'));if(cDesc<0)cDesc=cCode+1;
  let cRc=f.t==='all'?-1:colBy(c=>c==='rc');
  if(f.t!=='all'&&cRc<0){for(let i=Math.min(W,60)-1;i>=0;i--){if(data.some(r=>norm(r[i])==='x')){cRc=i;break}}}
  if(f.t!=='all'&&cRc<0)return;
  f.kind=f.t==='el'?'rcel':f.t==='all'?'rcall':'rcx';
  f.c={code:cCode,desc:cDesc,rc:cRc,sap:colBy(c=>c==='sap'||c==='n sap'||c==='nº sap')};f.hdr=hdr;delete f.alt;
  f.rows=data.filter(r=>S(r[cCode])&&(f.t==='all'?/^\S+$/.test(S(r[cCode])):norm(r[cRc])==='x'));
}
async function readFile(file){
  if(!window.XLSX)throw new Error('No se pudo cargar el lector de Excel. Revisa la conexión y recarga la página.');
  const buf=await file.arrayBuffer();
  const probe=XLSX.read(buf,{type:'array',sheetRows:8});
  const found=[];
  for(const name of probe.SheetNames){
    const rows=XLSX.utils.sheet_to_json(probe.Sheets[name],{header:1,defval:null,raw:true});
    const t=rcName(name);let d=t?{kind:'rc',t,hdr:-1,alt:detect(rows)}:detect(rows);
    if(d)found.push(Object.assign({name,file:file.name},d));
  }
  if(!found.length)return {file:file.name,found:[]};
  const wb=XLSX.read(buf,{type:'array',sheets:found.map(f=>f.name)});
  found.forEach(f=>{const all=XLSX.utils.sheet_to_json(wb.Sheets[f.name],{header:1,defval:null,raw:true});
    if(f.kind==='rc'){resolveRc(f,all);if(f.kind==='rc'&&f.alt){const a=f.alt;delete f.alt;Object.assign(f,a);f.rows=all.slice(f.hdr+1)}}else f.rows=all.slice(f.hdr+1)});
  return {file:file.name,found:found.filter(f=>f.kind!=='rc')};
}
function openUpload(){
  modalKind='upload';
  modal.innerHTML=`<div class="mh"><h2>Cargar Excel</h2><span class="crumb">Se leen en tu navegador; solo se guardan los datos necesarios</span><button class="x" data-close aria-label="Cerrar">✕</button></div>
  <div class="up" id="upBody">
    <p>Datos de <b>${esc(M.name)}</b>. Sube el libro con las hojas de <b>críticos</b>, <b>Lista materiales</b> y <b>Consumos por equipo</b>, o cada una por separado. Se reconocen por sus cabeceras, no por el nombre del archivo.</p>
    <div class="drop"><label for="upFiles">Elige uno o varios archivos .xlsx</label><br><input id="upFiles" type="file" accept=".xlsx,.xlsm,.xls" multiple></div>
    <div id="upOut"></div>
  </div>`;
  ov.classList.add('on');
  $('#upFiles').onchange=async e=>{
    const out=$('#upOut');out.innerHTML='<p>Leyendo archivos…</p>';
    try{
      const res=[];for(const f of e.target.files)res.push(await readFile(f));
      showPlan(res);
    }catch(err){out.innerHTML=`<p class="err">${esc(err.message||'No se pudo leer el archivo')}</p>`}
  };
}
function showPlan(res){
  const all=res.flatMap(r=>r.found);
  const crit=all.find(f=>f.kind==='crit'),stock=all.find(f=>f.kind==='stock'),cons=all.find(f=>f.kind==='cons'),rcm=all.filter(f=>f.kind==='rcx'||f.kind==='rcall'),rcel=all.filter(f=>f.kind==='rcel');
  const out=$('#upOut');
  if(!all.length){out.innerHTML='<p class="err">No he encontrado ninguna hoja reconocible. Necesito cabeceras como «Codigo fabricante» y «Material» (críticos), «Material», «Stock Real» y «Punto pedido» (stock) o «Equipo», «Material» y «Cantidad consumida» (consumos).</p>';return}
  out.innerHTML=`<div class="found">${res.map(r=>r.found.length?r.found.map(f=>`<div><b>${esc(f.file)}</b> · hoja «${esc(f.name)}»: ${f.kind==='crit'?'repuestos críticos':f.kind==='rcx'?'críticos según parada (columna RC con x)':f.kind==='rcall'?'repuestos según manual (todos críticos)':f.kind==='rcel'?'críticos del esquema eléctrico (columna RC con x)':f.kind==='stock'?'lista de materiales (stock)':'consumos por equipo'}, ${f.rows.length.toLocaleString('es-ES')} filas</div>`).join(''):`<div><b>${esc(r.file)}</b>: sin hojas reconocibles</div>`).join('')}</div>
  <div class="opt">
    ${(crit||rcm.length)?`<label><input type="radio" name="mode" value="replace" checked> Sustituir la lista de críticos por la del Excel</label><label><input type="radio" name="mode" value="merge"> Añadir y actualizar (no quita los críticos que ya están)</label>`:''}
    ${cons?`<label><input type="checkbox" id="optFlag" checked> Incluir como críticos los materiales marcados «Sí» en Consumos por equipo</label>`:''}
     ${cons?`<label>Código(s) de equipo de esta máquina (separados por comas): <input id="optEq" value="${esc(EQUIPO)}" placeholder="p. ej. 10001349" style="width:200px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)"></label>`:''}
  </div>
  <div id="upSum"></div><div><button class="cbtn" id="upGo">Revisar cambios</button></div>`;
  $('#upGo').onclick=()=>compile({crit,rcm,rcel,stock,cons,files:[...new Set(all.map(f=>f.file))].join(', ')});
}
function compile(src){
  const mode=(document.querySelector('input[name=mode]:checked')||{}).value||'merge';
  const flag=!!($('#optFlag')&&$('#optFlag').checked);
  const eq=($('#optEq')&&$('#optEq').value.trim())||EQUIPO;
  if(src.cons&&!eq){$('#upSum').innerHTML='<p class="err">Escribe el código de equipo de esta máquina para filtrar los consumos.</p>';return}
  // consumos
  let cons=null;
  if(src.cons){cons={};const c=src.cons.c;const refs=[];
    const eqs=new Set(eq.split(/[,;\s]+/).filter(Boolean));
    src.cons.rows.forEach(r=>{if(!eqs.has(S(r[c.eq])))return;const m=S(r[c.mat]);if(!m)return;
      cons[m]=(cons[m]||0)+(Number(r[c.q])||0);
      if(c.crit>=0&&['si','sí'].includes(norm(r[c.crit]))){refs.push({sap:m,code:c.ref>=0?S(r[c.ref]):'',desc:c.desc>=0?S(r[c.desc]):''})}});
    cons.__flag=refs}
  // críticos
  let items=null;const fb={};
  if(src.crit){items={};const c=src.crit.c;
    src.crit.rows.forEach(r=>{const code=S(r[c.code]);if(!code&&!S(r[c.desc]))return;
      let sap=S(r[c.sap]);if(norm(sap)==='no encontrado'||norm(sap)==='')sap='';
      const key=critKey(code||sap,sap);if(items[key])return;
      const mt=c.match>=0?S(r[c.match]):'';
      items[key]={code:code||sap,desc:c.desc>=0?S(r[c.desc]).replace(/_+/g,' · ').replace(/[ ·]+$/,'').replace(/\s+/g,' '):'',sap,match:sap?(mt&&norm(mt)!=='exacta'?'Aproximada':'Exacta'):'',src:['Excel '+src.crit.file]};
      if(sap&&c.stock>=0&&r[c.stock]!=null&&r[c.stock]!=='')fb[sap]=Number(r[c.stock])});
  }
  if(src.rcm&&src.rcm.length){
    items=items||{};
    const fbm=new Map();
    Object.values(CRITMAP).forEach(i=>{if(i&&i.sap)fbm.set(K(i.code),i.sap)});
    if(src.stock&&src.stock.c.alt&&src.stock.c.alt.length)src.stock.rows.forEach(r=>{const m=S(r[src.stock.c.mat]);if(!m)return;src.stock.c.alt.forEach(a=>{const cd=S(r[a]);if(cd&&!fbm.has(K(cd)))fbm.set(K(cd),m)})});
    const byCode={};Object.values(items).forEach(i=>{byCode[K(i.code)]=i});
    src.rcm.forEach(f=>{const lab=f.kind==='rcall'?'RC según manual':'RC según parada';
      f.rows.forEach(r=>{const code=S(r[f.c.code]);if(!code)return;const kk=K(code);
        if(byCode[kk]){if(!(byCode[kk].src||[]).includes(lab))(byCode[kk].src=byCode[kk].src||[]).push(lab);return}
        let sap=(f.c.sap>=0?S(r[f.c.sap]):'').replace(/\.0$/,'');if(!/^\d+$/.test(sap))sap='';sap=sap||fbm.get(kk)||'';const key=critKey(code,sap);
        const it={code,desc:S(r[f.c.desc]).replace(/_+/g,' · ').replace(/[ ·]+$/,'').replace(/\s+/g,' '),sap,match:sap?'Exacta':'',src:[lab]};
        items[key]=it;byCode[kk]=it})})}
  let rcelCodes=null;
  if(src.rcel&&src.rcel.length){rcelCodes={};src.rcel.forEach(f=>f.rows.forEach(r=>{const c=S(r[f.c.code]);if(c)rcelCodes[K(c)]=c}))}
  if(items&&cons&&flag){
    const have=new Set(Object.values(items).map(i=>i.sap).filter(Boolean));
    cons.__flag.forEach(x=>{if(have.has(x.sap))return;const key=critKey(x.code||x.sap,x.sap);if(items[key])return;
      items[key]={code:x.code||x.sap,desc:x.desc,sap:x.sap,match:'Por consumos',src:['Consumos (marcado Sí)']};have.add(x.sap)})}
  // resultado de críticos
  let finalMap=Object.assign({},CRITMAP);
  const before=new Set(Object.keys(finalMap));
  if(items){finalMap=mode==='replace'?Object.assign({},items):Object.assign(finalMap,items)}
  const nuevos=Object.keys(finalMap).filter(k=>!before.has(k)).length,quitados=[...before].filter(k=>!(k in finalMap)).length;
  // stock
  const need=new Set(Object.values(finalMap).map(i=>i&&i.sap).filter(Boolean));
  if(cons)Object.keys(cons).forEach(k=>{if(k!=='__flag')need.add(k)});
  const rows={};let cambiados=0,sinStock=0;
  const stockMap=new Map();
  if(src.stock){const c=src.stock.c;src.stock.rows.forEach(r=>{const m=S(r[c.mat]);if(m&&!stockMap.has(m))stockMap.set(m,[Number(r[c.stock])||0,c.ub>=0?S(r[c.ub]):'',r[c.pp]==null||r[c.pp]===''?null:Number(r[c.pp])])})}
  need.forEach(s=>{
    const prev=STOCKROWS[s];let row;
    const cq=cons?(cons[s]!=null?cons[s]:null):(prev?prev[3]:null);
    if(stockMap.size){const m=stockMap.get(s);row=m?[m[0],m[1],m[2],cq]:(prev?[prev[0],prev[1],prev[2],cq]:null)}
    else row=prev?[prev[0],prev[1],prev[2],cq]:(fb[s]!=null?[fb[s],'',null,cq]:(cq!=null?[null,'',null,cq]:null));
    if(row){rows[s]=row;if(prev&&prev[0]!==row[0])cambiados++}else sinStock++;
  });
  const conSap=Object.values(finalMap).filter(i=>i&&i.sap).length,total=Object.keys(finalMap).length;
  const size=JSON.stringify({items:finalMap}).length;
  const warn=size>240000?'<p class="err">La lista de críticos es demasiado grande para guardarla (límite aproximado 240 KB).</p>':'';
  $('#upSum').innerHTML=`${warn}<div class="found">${rcelCodes?`<div><b>Críticos eléctricos</b>: ${Object.keys(rcelCodes).length} (columna RC del esquema eléctrico). Se guardan en el botón «Esquema eléctrico», aparte de los mecánicos.</div>`:''}<div><b>Críticos</b>: ${items?`${total} en total (${nuevos} nuevos, ${quitados} quitados). ${conSap} con SAP, ${total-conSap} sin cruzar.`:'sin cambios (no has subido la hoja de críticos).'}</div>
  <div><b>Stock y consumos</b>: ${Object.keys(rows).length} materiales guardados${src.stock?`, ${cambiados} con stock distinto al anterior`:' (stock sin cambios: no has subido la lista de materiales)'}${cons?`, consumo del equipo ${esc(eq)} actualizado`:''}.${sinStock?` ${sinStock} SAP sin stock en el Excel.`:''}</div></div>`;
  const go=$('#upGo');go.textContent='Guardar para todos';go.disabled=!!warn;
  go.onclick=()=>applyUpload({items:items?finalMap:null,rcel:rcelCodes,rows,files:src.files});
}
async function applyUpload(p){
  const go=$('#upGo');go.disabled=true;go.textContent='Guardando…';
  try{
    const meta=metaNow(p.files);
    const S0=ST[M.id];
    if(p.items){await DB.doc(dp('crit')).set({items:p.items,meta});S0.critmap=CRITMAP=p.items;S0.critmeta=CRITMETA=meta}
    if(p.rcel&&window.ELECSAVE)await window.ELECSAVE(p.rcel,meta);
    await DB.doc(dp('stock')).set({rows:p.rows,meta});S0.stockrows=STOCKROWS=p.rows;S0.stockmeta=STOCKMETA=meta;
    onData();close();toast('Datos guardados para todos');
  }catch(e){go.disabled=false;go.textContent='Guardar para todos';$('#upSum').insertAdjacentHTML('beforeend',`<p class="err">No se pudo guardar: ${esc((e&&(e.message||e.code))||'error')}</p>`)}
}
$('#bUp').onclick=openUpload;

// ---------- Línea y selección de máquina ----------
function stats(m){
  const t=ST[m.id],items=Object.values(t.critmap).filter(v=>v&&v.code);
  const z=items.filter(v=>v.sap&&t.stockrows[v.sap]&&!t.stockrows[v.sap][0]).length;
  return {crit:items.length,z};
}
function lineSpot(id){return LINE.spots.find(s=>s.id===id)}
function drawLine(){
  const p=$('#linePlan');p.innerHTML=`<img src="data:image/webp;base64,${LINE.img}" alt="Esquema de la línea">`;
  const tip=document.createElement('div');tip.className='tip';tip.style.display='none';p.appendChild(tip);
  MACH.forEach(m=>{
    const s=lineSpot(m.id),st=stats(m);const d=document.createElement('div');
    d.className='hs mach';d.textContent=m.short;d.style.left=s.x+'%';d.style.top=s.y+'%';
    if(st.crit){const b=document.createElement('span');b.className='cb';b.textContent='★'+st.crit;d.appendChild(b)}
    d.addEventListener('mouseenter',()=>{tip.textContent=m.name+(st.crit?' · '+st.crit+' críticos'+(st.z?' · '+st.z+' con stock 0':''):'');tip.style.display='block'});
    d.addEventListener('mousemove',()=>{tip.style.left=d.offsetLeft+'px';tip.style.top=d.offsetTop+'px'});
    d.addEventListener('mouseleave',()=>{tip.style.display='none'});
    let sx,sy,moved=false;
    d.addEventListener('pointerdown',e=>{d.setPointerCapture(e.pointerId);sx=e.clientX;sy=e.clientY;moved=false;d.classList.add('drag')});
    d.addEventListener('pointermove',e=>{if(!d.hasPointerCapture(e.pointerId))return;
      if(!moved&&Math.hypot(e.clientX-sx,e.clientY-sy)<5)return;
      if(!CAN)return;
      moved=true;dragging=true;
      const r=p.getBoundingClientRect();s.x=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));s.y=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));
      d.style.left=s.x+'%';d.style.top=s.y+'%'});
    d.addEventListener('pointerup',e=>{d.classList.remove('drag');
      if(moved){dragging=false;saveLineSpot(m.id,s);return}
      selectMachine(m.id)});
    d.addEventListener('pointercancel',()=>{d.classList.remove('drag');dragging=false});
    p.appendChild(d);
  });
  $('#lineHint').textContent=CAN?'Arrastra los puntos para colocarlos':'';
  $('#lineNote').innerHTML='Un clic en una máquina abre su mapa de piezas. <b style="color:var(--crit-ink)">★n</b> = n repuestos críticos registrados. '+(CAN?'Las posiciones que muevas se guardan para todos.':'');
  $('#mlist').innerHTML=MACH.map(m=>{const st=stats(m);const nodes=m.raw.length;
    return `<button class="m" data-m="${m.id}"><b>${esc(m.name)}</b><span class="s"><span>${esc(m.sub)}</span></span><span class="s"><span>${nodes.toLocaleString('es-ES')} componentes</span><span>★ ${st.crit} críticos</span>${st.z?`<span class="r">${st.z} con stock 0</span>`:''}</span></button>`}).join('');
}
$('#mlist').onclick=e=>{const b=e.target.closest('[data-m]');if(b)selectMachine(b.dataset.m)};
function saveLineSpot(id,s){if(!DB||!CAN)return;const patch={pos:{[id]:{x:+s.x.toFixed(2),y:+s.y.toFixed(2)}}};enqueue(()=>dbMerge('shared/line',patch,patch))}
function applyLine(d){const pos=(d&&d.pos)||{};LINE.spots.forEach(s=>{const r=pos[s.id];if(r){s.x=r.x;s.y=r.y}})}
function buildMachine(m){
  M=m;
  N=m.raw.map((r,i)=>({id:i,l:r[0],pos:r[1],code:r[2],desc:r[3],qty:r[4],unit:r[5],mark:r[6],hours:r[7],obs:r[8],parent:r[9],pages:r[10]||[],kids:[]}));
  N.forEach(n=>{if(n.parent!==null&&n.parent>=0)N[n.parent].kids.push(n.id)});
  ROOT=N.findIndex(n=>n.l===1);
  CODEIDX=new Map();N.forEach(n=>{if(n.l>1){const q=K(n.code);if(!CODEIDX.has(q))CODEIDX.set(q,[]);CODEIDX.get(q).push(n.id)}});
  VIEWS=m.views;VIEWS.forEach(v=>v.spots.forEach(s=>{if(s.id==null)s.id=N.findIndex(n=>n.code===s.code&&n.pos===s.pos&&n.l===3)}));
  if(ST[m.id].spots)applySpots(ST[m.id].spots);
  EQUIPO=m.equipo||'';
  totalParts=N.filter(n=>n.l>1&&!n.kids.length).length;wear=N.filter(n=>n.mark==='V'&&n.l>1);
  $('#nAll').textContent=totalParts;$('#nWear').textContent=wear.length;
  syncGlobals();curView=0;
}
function showLine(){
  M=null;close();
  $('#lineView').hidden=false;$('#machView').hidden=true;$('#bLine').hidden=true;$('#mSel').hidden=true;$('#mBtns').hidden=true;
  $('#hTitle').textContent='Línea de latas · Marcilla';$('#hSub').textContent='Mapa de paradas técnicas · '+MACH.length+' máquinas';
  document.title='Mapa de la línea · Paradas técnicas';
  try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
  drawLine();drawInfo();
}
function selectMachine(id){
  const m=MACH.find(x=>x.id===id);if(!m)return;
  close();buildMachine(m);
  $('#lineView').hidden=true;$('#machView').hidden=false;$('#bLine').hidden=false;$('#mSel').hidden=false;$('#mSel').value=id;$('#mBtns').hidden=false;
  $('#hTitle').textContent=m.name;$('#hSub').textContent=m.sub;document.title=m.name+' · Paradas técnicas';
  $('#bUp').hidden=!CAN;
  $('#q').value='';$('#res').style.display='none';
  try{history.replaceState(null,'','#'+id)}catch(e){}
  rebuildCrit();drawTabs();drawPlan();drawGroups();drawInfo();
  window.scrollTo(0,0);
}
$('#bLine').onclick=showLine;
$('#mSel').innerHTML=MACH.map(m=>`<option value="${m.id}">${esc(m.short)}</option>`).join('');
$('#mSel').onchange=e=>selectMachine(e.target.value);

// ---------- Arranque ----------
(function(){let h='';try{h=location.hash.slice(1)}catch(e){}
  if(h&&MACH.some(m=>m.id===h))selectMachine(h);else showLine()})();
(async()=>{
  try{
    DB=await claude.use('db');USER=await claude.use('user');
    if(USER){try{ME=await USER.me()}catch(e){}}
    if(!DB){return}
    let w=null;try{w=USER?await USER.can('data.write'):null}catch(e){}
    CAN=w!==false;LIVE=true;if(M)$('#bUp').hidden=!CAN;else drawLine();
    const err=e=>{LIVE=false;drawInfo()};
    const refreshAll=m=>{if(M&&M.id===m.id){syncGlobals();onData()}else if(!M){drawLine();drawInfo()}};
    MACH.forEach(m=>{
      const sfx=m.suffix||'';
      DB.doc('shared/crit'+sfx).onSnapshot(s=>{const d=s.exists?s.data():null;const t=ST[m.id];t.critmap=(d&&d.items)||{};t.critmeta=(d&&d.meta)||{};refreshAll(m)},err);
      DB.doc('shared/stock'+sfx).onSnapshot(s=>{const d=s.exists?s.data():null;const t=ST[m.id];t.stockrows=(d&&d.rows)||{};t.stockmeta=(d&&d.meta)||{};refreshAll(m)},err);
      DB.doc('shared/spots'+sfx).onSnapshot(s=>{const d=s.exists?s.data():null;ST[m.id].spots=d;if(M&&M.id===m.id){applySpots(d);if(!dragging)drawPlan()}},err);
    });
    DB.doc('shared/line').onSnapshot(s=>{applyLine(s.exists?s.data():null);if(!M&&!dragging)drawLine()},err);
  }catch(e){}
})();

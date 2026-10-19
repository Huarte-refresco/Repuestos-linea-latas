/* Esquema eléctrico: lista de piezas eléctricas por máquina + visor del PDF en la hoja donde está el componente.
   Se carga después de app.js y usa sus variables globales (M, N, CRIT, CRITMAP, modal, ov, CAN...). */
(function(){
if(typeof M==='undefined'||!window.ELECFETCH||!window.PDFFETCH)return;
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const EL={data:null,loading:null,libs:null,docs:{}};
let ef={sel:'all',q:'',more:{}};
let pv={page:1,tag:'',z:1,tok:0,from:'list'};

const Kn=s=>{const d=String(s==null?'':s).replace(/\D/g,'').replace(/^0+/,'');return d||K(s)};
function tagTok(t){t=String(t||'').replace(/­/g,'-');const i=t.lastIndexOf('-');return i>=0?t.slice(i):t}

// ---------- botón en la cabecera ----------
const b=document.createElement('button');b.className='cbtn';b.id='bElec';b.hidden=true;
b.innerHTML='⚡ Esquema eléctrico <span class="n" id="nElec">0</span>';
const after=document.getElementById('bAll');after.parentNode.insertBefore(b,after.nextSibling);

function load(){
  if(EL.data)return Promise.resolve(EL.data);
  if(!EL.loading)EL.loading=window.ELECFETCH().then(d=>{EL.data=d;return d}).catch(e=>{EL.loading=null;throw e});
  return EL.loading;
}
const cur=()=>EL.data&&M&&EL.data[M.id];
function upd(){
  const d=cur();b.hidden=!(M&&d);if(!d)return;
  document.getElementById('nElec').textContent=d.parts.length;
}
load().then(upd).catch(()=>{});
const _sel=selectMachine;selectMachine=function(id){_sel(id);upd()};
const _od=onData;onData=function(){_od();upd()};
const _rm=refreshModal;refreshModal=function(){if(ov.classList.contains('on')&&modalKind==='elec')return elecModal(true);if(modalKind==='pdf')return;_rm()};
if(M)upd();

// ---------- lista de piezas ----------
function critIdx(){const m=new Map();CRIT.forEach(c=>{const k=Kn(c.code);if(!m.has(k))m.set(k,[]);m.get(k).push(c)});return m}
function filtered(ci){
  const d=cur(),q=norm(ef.q);
  return d.parts.filter(p=>{
    const cs=ci.get(Kn(p.k))||[];
    if(ef.sel==='rc'&&!p.x)return false;
    if(ef.sel==='rcno'&&!(p.x&&!cs.length))return false;
    if(ef.sel==='inlist'&&!cs.length)return false;
    if(ef.sel==='nosap'&&!(cs.length&&cs.every(c=>!c.sap)))return false;
    if(ef.sel==='s0'&&!cs.some(c=>c.sap&&c.hasRow&&!c.stock))return false;
    if(q&&!(norm(p.k).includes(q)||norm(p.d).includes(q)||norm(p.f).includes(q)||norm(p.m).includes(q)||p.l.some(l=>norm(l.t).includes(q))))return false;
    return true;
  });
}
function locHtml(p,i){
  const L=p.l,show=ef.more[p.k]?L:L.slice(0,3);
  return show.map(l=>l.p?`<a class="lnk" data-epg="${l.p}" data-tag="${esc(l.t)}" title="Abrir el esquema en la hoja ${l.p}">${esc(l.t)} <span class="gr">· pág. ${l.p}</span></a>`:`<span class="gr">${esc(l.t)} · sin hoja</span>`).join('')
   +(L.length>3&&!ef.more[p.k]?`<a class="gr" data-emore="${esc(p.k)}" style="cursor:pointer;text-decoration:underline">+${L.length-3} más</a>`:'');
}
function elecModal(refresh){
  const d=cur();if(!d)return;
  modalKind='elec';
  const ae=document.activeElement,aid=ae&&ae.id&&modal.contains(ae)?ae.id:'',asel=aid&&ae.selectionStart!=null?ae.selectionStart:0;
  const ci=critIdx(),list=filtered(ci);
  const nrc=d.parts.filter(p=>p.x).length,nin=d.parts.filter(p=>ci.has(Kn(p.k))).length,pend=d.parts.filter(p=>p.x&&!ci.has(Kn(p.k)));
  const rows=list.map(p=>{
    const cs=ci.get(Kn(p.k))||[];
    let st='';
    if(cs.length)st=cs.map(c=>`<b style="color:var(--crit-ink)">★ en críticos</b>${c.sap?' · SAP '+esc(c.sap)+(c.hasRow?' · stock '+(c.stock===0?'<span class="z">0</span>':fmtQ(c.stock)):''):' · <span class="gr">sin SAP</span>'}`).join('<br>')+`<br><a class="gr" data-gocrit="${esc(p.k)}" style="cursor:pointer;text-decoration:underline">ver / editar SAP</a>`;
    else st=(p.x?'<span class="gr">Marcada RC en el Excel</span><br>':'')+(CAN?`<button class="mini" data-eadd="${esc(p.k)}">★ Añadir a críticos</button>`:'');
    return `<tr${p.x?' class="crit"':''}><td class="n">${p.x?'<b style="color:var(--crit-ink)" title="Marcada como repuesto crítico (RC) en el Excel">★</b>':''}</td><td class="code">${esc(p.k)}</td><td>${esc(p.d)}</td><td>${esc(p.f)}${p.m?'<br><span class="gr">'+esc(p.m)+'</span>':''}</td><td>${locHtml(p)}</td><td>${st}</td></tr>`}).join('');
  modal.innerHTML=`<div class="mh"><div><h2>⚡ Esquema eléctrico · ${esc(M.name)}</h2><div class="crumb">${d.parts.length} piezas distintas · ${nrc} marcadas RC en el Excel · ${nin} ya en la lista de críticos${pend.length?' · '+pend.length+' críticas aún sin añadir':''}</div></div><button class="mini" id="elBook" title="Abrir el PDF completo">📖 Abrir esquema</button><button class="x" data-close aria-label="Cerrar">✕</button></div>
  <div class="fbar"><select id="elSel" aria-label="Filtro"><option value="all">Todas las piezas</option><option value="rc">Solo críticas (RC)</option><option value="rcno">Críticas aún no añadidas a la lista</option><option value="inlist">Ya en la lista de críticos</option><option value="nosap">En la lista, sin SAP</option><option value="s0">Con SAP y stock 0</option></select><input id="elQ" type="search" placeholder="Buscar código, nombre, fabricante o tag…" value="${esc(ef.q)}" style="flex:1;min-width:180px"><span class="crumb">${list.length} de ${d.parts.length}</span><button id="elCsv">⬇ CSV</button>${CAN&&pend.length?`<button id="elAddAll" class="mini go" style="margin:0">★ Añadir las ${pend.length} críticas a la lista</button>`:''}</div>
  <div class="tbl" style="max-height:72vh"><table><thead><tr><th style="top:0" class="n">RC</th><th style="top:0">Código KHS</th><th style="top:0">Denominación</th><th style="top:0">Fabricante / modelo</th><th style="top:0">Dónde está en el esquema</th><th style="top:0">Lista de críticos · SAP · stock</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="gr" style="padding:16px">Nada con ese filtro.</td></tr>'}</tbody></table></div>`;
  document.getElementById('elSel').value=ef.sel;
  if(aid){const el=document.getElementById(aid);if(el){el.focus();if(el.setSelectionRange&&asel!=null)try{el.setSelectionRange(asel,asel)}catch(e){}}}
  ov.classList.add('on');
}
function csv(){
  const d=cur(),ci=critIdx(),list=filtered(ci);
  const h=['RC (Excel)','Código KHS','Denominación','Fabricante','Modelo','Ubicación en el esquema (tag · página PDF)','En lista de críticos','Nº SAP','Stock'];
  dlCsv('esquema_electrico_'+M.id+'.csv',h,list.map(p=>{const cs=ci.get(Kn(p.k))||[];
    return [p.x?'x':'',p.k,p.d,p.f,p.m,p.l.map(l=>l.t+(l.p?' · pág. '+l.p:'')).join(' | '),cs.length?'sí':'',cs.map(c=>c.sap).filter(Boolean).join(' | '),cs.map(c=>c.hasRow?c.stock:'').join(' | ')]}));
}
function addToCrit(parts){
  const ch={},ci=critIdx();let n=0;
  parts.forEach(p=>{if(ci.has(Kn(p.k)))return;const key=critKey(p.k,'');if(CRITMAP[key]||ch[key])return;
    ch[key]={code:p.k,desc:(p.d+(p.m?' · '+p.m:'')).trim(),sap:'',match:'',src:['Esquema eléctrico'],by:(ME&&ME.id)||'',at:new Date().toISOString()};n++});
  if(!n)return;
  saveItems(ch);
  toast(n===1?'Añadida a críticos. Pon su Nº SAP en la lista de críticos para ver el stock.':n+' piezas añadidas a la lista de críticos. Falta cruzarlas con su Nº SAP.');
}
b.onclick=()=>{ef={sel:'all',q:'',more:{}};load().then(()=>elecModal()).catch(e=>toast('No se pudo cargar el esquema eléctrico: '+((e&&e.message)||'error')))};

modal.addEventListener('change',e=>{if(modalKind==='elec'&&e.target.id==='elSel'){ef.sel=e.target.value;elecModal()}});
modal.addEventListener('input',e=>{if(modalKind==='elec'&&e.target.id==='elQ'){ef.q=e.target.value;elecModal(true)}});
modal.addEventListener('click',e=>{
  if(modalKind!=='elec')return;const t=e.target;
  if(t.id==='elCsv')return csv();
  if(t.id==='elBook')return openPdf(1,'','list');
  if(t.id==='elAddAll'){const ci=critIdx();return addToCrit(cur().parts.filter(p=>p.x&&!ci.has(Kn(p.k))))}
  const a=t.closest('[data-epg]');if(a)return openPdf(+a.dataset.epg,a.dataset.tag,'list');
  const mo=t.closest('[data-emore]');if(mo){ef.more[mo.dataset.emore]=1;return elecModal(true)}
  const ad=t.closest('[data-eadd]');if(ad){const p=cur().parts.find(x=>x.k===ad.dataset.eadd);if(p)addToCrit([p]);return}
  const g=t.closest('[data-gocrit]');if(g){cf={sel:'all',q:g.dataset.gocrit,edit:null,del:null};return critModal()}
});

// ---------- visor del PDF ----------
function libs(){
  if(EL.libs)return EL.libs;
  EL.libs=new Promise((res,rej)=>{
    if(window.pdfjsLib){res(window.pdfjsLib);return}
    const s=document.createElement('script');s.src=PDFJS+'pdf.min.js';
    s.onload=()=>{try{window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.js';res(window.pdfjsLib)}catch(e){rej(e)}};
    s.onerror=()=>{EL.libs=null;rej(new Error('No se pudo cargar el visor de PDF'))};document.head.appendChild(s);
  });
  return EL.libs;
}
function getDoc(file){
  if(!EL.docs[file])EL.docs[file]=(async()=>{const lib=await libs();const buf=await window.PDFFETCH(file);return lib.getDocument({data:buf}).promise})().catch(e=>{delete EL.docs[file];throw e});
  return EL.docs[file];
}
function locate(pg){const d=cur();const s=d.pdf.find(x=>pg>=x.a&&pg<=x.b);return s?[s.f,pg-s.a+1]:null}
function pvShell(){
  const d=cur();
  modal.innerHTML=`<div class="mh"><button class="mini" id="pvBack" style="margin:0">← Lista de piezas</button><h2>Esquema · ${esc(M.name)}</h2><span class="crumb" id="pvTag"></span>
  <span style="margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><button class="mini" id="pvPrev" style="margin:0" aria-label="Hoja anterior">◀</button><span class="crumb">pág. <input id="pvNum" type="number" min="1" max="${d.n}" value="${pv.page}" style="width:64px;padding:3px 5px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)"> / ${d.n}</span><button class="mini" id="pvNext" style="margin:0" aria-label="Hoja siguiente">▶</button><button class="mini" id="pvZm" style="margin:0" aria-label="Alejar">−</button><button class="mini" id="pvZf" style="margin:0">Ajustar</button><button class="mini" id="pvZp" style="margin:0" aria-label="Acercar">+</button></span><button class="x" data-close aria-label="Cerrar" style="margin-left:6px">✕</button></div>
  <div id="pvWrap" style="overflow:auto;max-height:80vh;min-height:300px;background:var(--soft);position:relative;-webkit-overflow-scrolling:touch"><div id="pvMsg" class="crumb" style="padding:16px">Cargando esquema…</div></div>`;
  ov.classList.add('on');
}
function openPdf(pg,tag,from){
  const d=cur();if(!d)return;
  modalKind='pdf';pv={page:Math.max(1,Math.min(d.n,pg||1)),tag:tag||'',z:1,tok:pv.tok,from:from||'list'};
  pvShell();renderPdf(true);
}
async function renderPdf(first){
  const d=cur(),tok=++pv.tok,wrap=document.getElementById('pvWrap');if(!wrap)return;
  const num=document.getElementById('pvNum');if(num)num.value=pv.page;
  const tg=document.getElementById('pvTag');if(tg)tg.textContent=pv.tag?'Buscando '+pv.tag+' (marcado en rojo)':'';
  const msg=document.getElementById('pvMsg');
  try{
    const loc=locate(pv.page);if(!loc)throw new Error('Esa página no existe');
    const doc=await getDoc(loc[0]);if(tok!==pv.tok)return;
    const page=await doc.getPage(loc[1]);if(tok!==pv.tok)return;
    const base=page.getViewport({scale:1}),avail=Math.max(280,wrap.clientWidth-4);
    const css=avail/base.width*pv.z;
    const dpr=Math.min(window.devicePixelRatio||1,2);let out=css*dpr;
    const maxPx=7000;if(Math.max(base.width,base.height)*out>maxPx)out=maxPx/Math.max(base.width,base.height);
    const vp=page.getViewport({scale:out});
    const cv=document.createElement('canvas');cv.width=Math.floor(vp.width);cv.height=Math.floor(vp.height);
    cv.style.width=Math.floor(base.width*css)+'px';cv.style.height=Math.floor(base.height*css)+'px';cv.style.display='block';cv.style.background='#fff';
    await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;if(tok!==pv.tok)return;
    const box=document.createElement('div');box.style.cssText='position:relative;width:'+cv.style.width+';height:'+cv.style.height;
    box.appendChild(cv);wrap.replaceChildren(box);
    if(pv.tag){
      const want=tagTok(pv.tag),tc=await page.getTextContent();if(tok!==pv.tok)return;
      const hv=page.getViewport({scale:css});let first=null,n=0;
      tc.items.forEach(it=>{
        const s=String(it.str||'').replace(/­/g,'-').trim();
        if(s!==want&&s.replace(/^-/,'')!==want.replace(/^-/,''))return;
        const tr=window.pdfjsLib.Util.transform(hv.transform,it.transform);
        const w=Math.max(it.width*css,10),h=Math.max(Math.abs(it.height)*css,10);
        const x=tr[4],y=tr[5]-h;
        const r=document.createElement('div');r.style.cssText=`position:absolute;left:${x-6}px;top:${y-4}px;width:${w+12}px;height:${h+8}px;border:3px solid #e03131;border-radius:6px;background:rgba(224,49,49,.14);pointer-events:none;box-shadow:0 0 0 3px rgba(224,49,49,.25)`;
        box.appendChild(r);n++;if(!first)first={x,y,w,h};
      });
      if(tg)tg.textContent=n?pv.tag+' · marcado en rojo'+(n>1?' ('+n+' veces)':''):pv.tag+' · no he podido señalarlo en esta hoja';
      if(first){wrap.scrollLeft=Math.max(0,first.x-wrap.clientWidth/2);wrap.scrollTop=Math.max(0,first.y-wrap.clientHeight/2)}
    }else if(tg)tg.textContent='';
  }catch(e){
    const m2=document.getElementById('pvMsg')||wrap;
    wrap.innerHTML='<div class="crumb" style="padding:16px;color:var(--crit-ink)">No se pudo abrir el esquema: '+esc((e&&e.message)||'error')+'</div>';
  }
}
function go(p){const d=cur();p=Math.max(1,Math.min(d.n,p));if(p===pv.page)return;pv.page=p;pv.tag='';renderPdf()}
modal.addEventListener('click',e=>{
  if(modalKind!=='pdf')return;const t=e.target;
  if(t.id==='pvBack')return elecModal();
  if(t.id==='pvPrev')return go(pv.page-1);
  if(t.id==='pvNext')return go(pv.page+1);
  if(t.id==='pvZp'){pv.z=Math.min(6,pv.z*1.4);return renderPdf()}
  if(t.id==='pvZm'){pv.z=Math.max(.5,pv.z/1.4);return renderPdf()}
  if(t.id==='pvZf'){pv.z=1;return renderPdf()}
});
modal.addEventListener('change',e=>{if(modalKind==='pdf'&&e.target.id==='pvNum')go(parseInt(e.target.value,10)||1)});
document.addEventListener('keydown',e=>{if(modalKind!=='pdf'||(e.target&&/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)))return;
  if(e.key==='ArrowRight')go(pv.page+1);else if(e.key==='ArrowLeft')go(pv.page-1)});
})();

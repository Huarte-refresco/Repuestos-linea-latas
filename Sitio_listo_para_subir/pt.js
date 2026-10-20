/* Vista "Parada": plan de cambios por parada técnica (libro de operaciones) con historial por año, stock y carga de Excel.
   Se carga después de app.js y usa sus globales (M, K, esc, CAN, DB, STOCKROWS, CRITMAP, CODEIDX, dp, enqueue, dbMerge, toast, ...). */
(function(){
if(typeof M==='undefined'||typeof DB==='undefined')return;
if(window.__ptLoaded)return;window.__ptLoaded=1;

// ---------- marcas ----------
const CLS={chg:{n:'Cambiar',c:'chg'},alm:{n:'Almacén',c:'alm'},pre:{n:'Pedir precio',c:'pre'},rev:{n:'Revisar',c:'rev'},des:{n:'Descartado',c:'des'}};
const MARKS=[['X','Cambiar / realizar en esa parada'],['X?','Dudas: esa parada o la siguiente'],['A','Pedir pero va al almacén'],['P','Pedir precio aparte'],['R/P','Revisar si hay repuesto y si no pedir precio'],['R','Revisar si hay de repuesto'],['V','Revisar en la parada por si hay que volver a actuar'],['C','Comprobar (ver nota)'],['K','Obsoleto / sustituido'],['D','Descartado'],['','Sin marca']];
const mcls=m=>{m=String(m||'').toUpperCase();if(!m)return '';const c=m[0];if(c==='X')return 'chg';if(c==='A')return 'alm';if(c==='P'||m.startsWith('R/P'))return 'pre';if('RVCK'.includes(c))return 'rev';if('DY'.includes(c))return 'des';return ''};
const mtitle=m=>{const f=MARKS.find(x=>x[0]===m);return f?f[1]:m};

// ---------- estado ----------
const PT={docs:{},sub:{},mode:'crit',view:'sel',open:{},f:{stop:null,cls:'',stk:'',q:'',all:false,pend:false,gap:''},up:null};
try{const v=localStorage.getItem('ptMode');if(v==='pt')PT.mode='pt';const w=localStorage.getItem('ptView');if(['sel','plan','hist'].includes(w))PT.view=w}catch(e){}
const doc=()=>M&&PT.docs[M.id]||null;
const stopsOf=d=>(d&&d.stops)||[];
const itemsOf=d=>d&&d.items?Object.entries(d.items).map(([id,v])=>Object.assign({id},v)).sort((a,b)=>(a.o||0)-(b.o||0)):[];
const yrOf=s=>{const m=String(s).match(/(?:^|\D)((?:19|20)?\d{2})/);if(!m)return 0;let y=+m[1];return y<100?2000+y:y};

// ---------- stock ----------
function stockOf(it,needO){
  const sap=it.sap||'';let st=null,ub='',pp=null,live=false;
  if(sap&&STOCKROWS&&STOCKROWS[sap]){const r=STOCKROWS[sap];st=r[0];ub=r[1]||'';pp=r[2];live=true}
  else if(it.st){st=it.st[0];ub=it.st[1]||'';pp=it.st[2]}
  const need=needO||(it.req>0?it.req:(it.qty>0?it.qty:1));
  let s='nosap';
  if(sap&&st!=null){s=st>=need?'ok':st>0?'part':'none'}
  return {s,st,ub,pp,need,live,sap};
}
const SLAB={ok:'Stock OK',part:'Stock parcial',none:'Sin stock',nosap:'Sin SAP / sin dato'};

// ---------- UI: pestañas y contenedor ----------
const css=document.createElement('style');css.textContent=`
#vTabs{display:inline-flex;border:1px solid #5b6684;border-radius:9px;overflow:hidden;margin-right:6px}
#vTabs button{background:transparent;color:#fff;border:0;padding:8px 14px;font:600 13px var(--font);cursor:pointer}
#vTabs button.on{background:var(--acc)}
#vTabs button:not(.on):hover{background:#2a3350}
#ptView{max-width:1700px;margin:0 auto;padding:14px 16px 40px}
.ptc{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.ptbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ptbar .sp{flex:1}
.ptbar label{font-size:12.5px;color:var(--mut)}
.ptbar select,.ptbar input[type=search]{padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:13px var(--font)}
.ptbar input[type=search]{min-width:200px}
.ptb{background:var(--btn2);color:#fff;border:0;border-radius:7px;padding:7px 12px;font:600 13px var(--font);cursor:pointer}
.ptb.acc{background:var(--acc)}.ptb.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.ptb:disabled{opacity:.5;cursor:default}
.ptcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px}
.ptcard{border:1px solid var(--line);border-radius:10px;padding:9px 12px;cursor:pointer;background:var(--bg);text-align:left;font:inherit;color:inherit}
.ptcard b{display:block;font-size:22px;line-height:1.1}.ptcard span{font-size:12px;color:var(--mut)}
.ptcard.on{outline:2px solid var(--blue)}
.ptcard.k-chg b{color:var(--blue)}.ptcard.k-ok b{color:#2b8a3e}.ptcard.k-part b{color:#e67700}.ptcard.k-none b{color:var(--crit-ink)}
.ptwrap{overflow:auto;max-height:calc(100vh - 330px);min-height:240px;border:1px solid var(--line);border-radius:10px}
table.ptt{border-collapse:separate;border-spacing:0;font-size:12.5px;width:100%}
.ptt th{position:sticky;top:0;background:var(--head);z-index:2;padding:6px 7px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap;font-weight:600}
.ptt td{padding:5px 7px;border-bottom:1px solid var(--soft);vertical-align:top}
.ptt tr:hover td{background:var(--soft)}
.ptt td.c,.ptt th.c{text-align:center;padding:5px 3px;min-width:38px}
.ptt th.c small{display:block;font-weight:400;color:var(--mut);font-size:10.5px}
.ptt th.nx{background:var(--acc);color:#fff}.ptt th.nx small{color:#ffe3cf}
.ptt th.fut{background:var(--acc-soft)}
.ptt td.nx{background:var(--acc-soft)}
.ptt td.code{font-family:var(--mono);white-space:nowrap}
.ptt td.grp{color:var(--mut);font-size:11.5px}
.mk{display:inline-block;min-width:26px;padding:2px 5px;border-radius:6px;font:600 12px var(--mono);text-align:center}
.mk.chg{background:#1c64c8;color:#fff}.mk.alm{background:#7048e8;color:#fff}.mk.pre{background:#e8590c;color:#fff}.mk.rev{background:#0b7285;color:#fff}.mk.des{background:#868e96;color:#fff;text-decoration:line-through}
.mk.past{opacity:.55}
.ptt td.c.ed{cursor:pointer}.ptt td.c.ed:hover{outline:1px dashed var(--blue)}
.sdot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
.s-ok{background:#2f9e44}.s-part{background:#f59f00}.s-none{background:#e03131}.s-nosap{background:#adb5bd}
.sbox{white-space:nowrap;font-weight:600}
.sbox.s-ok{color:#2b8a3e;background:none}.sbox.s-part{color:#b36200;background:none}.sbox.s-none{color:var(--crit-ink);background:none}.sbox.s-nosap{color:var(--mut);background:none}
.ptt td.obs{max-width:260px;color:var(--mut);font-size:11.5px}
.ptleg{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--mut);margin:8px 0 0}
.ptempty{padding:34px;text-align:center;color:var(--mut)}
#ptMenu{position:fixed;z-index:60;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.25);padding:6px;display:grid;gap:2px;min-width:210px}
#ptMenu button{display:flex;gap:8px;align-items:center;text-align:left;background:none;border:0;color:var(--ink);padding:6px 8px;border-radius:6px;font:13px var(--font);cursor:pointer}
#ptMenu button:hover{background:var(--soft)}
.ptdiff{max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px;font-size:12.5px;background:var(--bg)}
.ptdiff div{padding:1px 0}
.ptmeta{font-size:12px;color:var(--mut)}
#ptSub{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px 16px 0;max-width:1700px;margin:0 auto}
#ptSub button{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:8px 14px;font:600 13px var(--font);cursor:pointer}
#ptSub button.on{background:var(--blue);color:#fff;border-color:var(--blue)}
#ptSub .ptmeta{margin-left:auto}
.hs .cb.pb,.cb2.pb{background:var(--blue)}
tr.psel td:first-child{box-shadow:inset 4px 0 0 var(--blue)}tr.psel td{background:var(--acc-soft)}
.ptt tr.sublist td{background:var(--bg);padding:0 0 0 28px}
.ptt .mini2{width:100%}.ptt .mini2 td{border-bottom:1px solid var(--soft);padding:3px 6px}
.ptt input.pn{width:100%;min-width:160px;box-sizing:border-box;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);font:12px var(--font)}
.stc{white-space:nowrap;font-size:12px}.stc .sdot{margin:0 2px 0 6px}
@media(max-width:700px){#ptView{padding:10px 8px}}
`;document.head.appendChild(css);

const tabs=document.createElement('div');tabs.id='vTabs';tabs.hidden=true;
tabs.innerHTML='<button type="button" data-v="pt">🛠 Parada</button><button type="button" data-v="crit">★ Repuestos críticos</button>';
const btns=document.querySelector('header .btns');btns.insertBefore(tabs,document.getElementById('mBtns'));
const view=document.createElement('div');view.id='ptView';view.hidden=true;
document.getElementById('machView').insertAdjacentElement('afterend',view);
const menu=document.createElement('div');menu.id='ptMenu';menu.hidden=true;document.body.appendChild(menu);

tabs.onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;PT.mode=b.dataset.v;try{localStorage.setItem('ptMode',PT.mode)}catch(_){}sync()};
const subnav=document.createElement('div');subnav.id='ptSub';subnav.hidden=true;
document.getElementById('info').insertAdjacentElement('afterend',subnav);
subnav.onclick=e=>{const b=e.target.closest('[data-w]');if(!b)return;PT.view=b.dataset.w;try{localStorage.setItem('ptView',PT.view)}catch(_){}sync()};
function drawSub(){
  const n=Object.keys((PS.docs[M.id]&&PS.docs[M.id].sel)||{}).length,d=doc();
  subnav.innerHTML=[['sel','🗺 Seleccionar en el plano'],['plan','📋 Plan de la parada ('+n+')'],['hist','📊 Historial y Excel']].map(([k,t])=>`<button type="button" data-w="${k}" class="${PT.view===k?'on':''}">${t}</button>`).join('')+`<span class="ptmeta">${d&&d.next?'Próxima parada: <b>'+esc(d.next)+'</b>':'Aún sin libro de operaciones cargado'}</span>`;
}
function sync(){
  const has=!!M;tabs.hidden=!has;
  const was=PTX.on;
  if(!has){view.hidden=true;subnav.hidden=true;PTX.on=false;return}
  const pt=PT.mode==='pt';
  tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===PT.mode));
  PTX.on=pt&&PT.view==='sel';
  const map=!pt||PT.view==='sel';
  document.getElementById('machView').hidden=!map;
  document.getElementById('mBtns').hidden=pt;
  view.hidden=map;subnav.hidden=!pt;
  if(pt){watch();drawSub()}
  if(PTX.on!==was||pt){try{close()}catch(e){};if(map&&M){PS.I=null;try{drawGroups();drawPlan()}catch(e){}}}
  if(!view.hidden)render();
}
document.getElementById('bLine').addEventListener('click',()=>setTimeout(sync,0));
const _sel=selectMachine;selectMachine=function(id){_sel(id);PT.f.stop=null;sync()};
const _od=onData;onData=function(){_od();if(M&&PT.mode==='pt'){drawSub();if(!view.hidden)render()}};

function watch(){
  if(!M||PT.sub[M.id])return;const m=M;PT.sub[m.id]=1;
  try{DB.doc('shared/pt'+(m.suffix||'')).onSnapshot(s=>{PT.docs[m.id]=s.exists?s.data():null;if(M&&M.id===m.id&&PT.mode==='pt'&&!PT.busy&&!view.hidden){drawSub();render()}},()=>{PT.sub[m.id]=0})}catch(e){PT.sub[m.id]=0}
  try{DB.doc('shared/ps'+(m.suffix||'')).onSnapshot(s=>{PS.docs[m.id]=s.exists?s.data():null;PS.ver[m.id]=(PS.ver[m.id]||0)+1;if(M&&M.id===m.id&&PT.mode==='pt'){PS.I=null;drawSub();if(PTX.on){try{drawGroups();drawPlan();refreshModal()}catch(e){}}else if(!view.hidden)render()}},()=>{})}catch(e){}
}

// ---------- render ----------
function render(){
  if(!M||view.hidden)return;
  if(PT.view==='plan')return renderPlan();
  return renderHist();
}
function renderHist(){
  if(!M||view.hidden)return;
  const d=doc(),stops=stopsOf(d);
  if(!d||!stops.length){
    view.innerHTML=`<div class="ptc"><div class="ptbar"><b style="font-size:16px">Parada técnica · ${esc(M.short||M.name)}</b><span class="sp"></span>${CAN?'<button class="ptb acc" id="ptUp">Cargar Excel de parada</button>':''}</div>
    <div class="ptempty">Todavía no hay plan de parada para esta máquina.${CAN?'<br>Carga el Excel del libro de operaciones (y, si quieres stock, la Lista de materiales).':'<br>Pide a un responsable que cargue el libro de operaciones.'}</div></div>`;
    bindTop();return}
  const f=PT.f;if(!f.stop||!stops.includes(f.stop))f.stop=d.next&&stops.includes(d.next)?d.next:stops[stops.length-1];
  const nx=d.next&&stops.includes(d.next)?d.next:null,ni=nx?stops.indexOf(nx):stops.length;
  const all=itemsOf(d).map(it=>Object.assign(it,{S:stockOf(it)}));
  const sel=f.stop;
  const KH=(d.khs||'KHS').replace(/^solicitado\s*/i,'');
  const base=all.filter(it=>f.all||f.gap==='khs'||(it.hist&&it.hist[sel]));
  // contadores de la parada seleccionada
  const inStop=all.filter(it=>it.hist&&it.hist[sel]);
  const cnt={chg:0,alm:0,pre:0,rev:0,des:0};inStop.forEach(it=>{const c=mcls(it.hist[sel]);if(c)cnt[c]++});
  const mat=inStop.filter(it=>['chg','alm','pre'].includes(mcls(it.hist[sel])));
  const sc={ok:0,part:0,none:0,nosap:0};mat.forEach(it=>sc[it.S.s]++);
  const gapKn=mat.filter(it=>it.kn),gapKhs=all.filter(it=>it.req>0&&!(it.hist&&it.hist[sel]));
  const q=norm(f.q);
  const rows=base.filter(it=>{
    if(f.gap==='kn'&&!(it.kn&&['chg','alm','pre'].includes(mcls(it.hist&&it.hist[sel]))))return false;
    if(f.gap==='khs'&&!(it.req>0&&!(it.hist&&it.hist[sel])))return false;
    if(f.cls&&mcls(it.hist&&it.hist[sel])!==f.cls)return false;
    if(f.stk&&it.S.s!==f.stk)return false;
    if(f.pend&&!(['part','none'].includes(it.S.s)&&['chg','alm','pre'].includes(mcls(it.hist&&it.hist[sel]))))return false;
    if(q&&!norm(it.code+' '+it.desc+' '+(it.sap||'')+' '+it.grp+' '+(it.obs||[]).join(' ')).includes(q))return false;
    return true});
  const card=(k,v,lab,cls)=>`<button class="ptcard k-${cls||k} ${(f.cls===k||f.stk===k)?'on':''}" data-card="${k}"><b>${v}</b><span>${lab}</span></button>`;
  const meta=d.meta||{};
  const th=stops.map((s,i)=>{const n=all.filter(it=>it.hist&&it.hist[s]&&['chg','alm','pre'].includes(mcls(it.hist[s]))).length;
    return `<th class="c ${s===nx?'nx':i>ni?'fut':''}" title="${s===nx?'Próxima parada':i<ni?'Parada realizada':'Parada futura'}">${esc(s)}<small>${n||''}</small></th>`}).join('');
  const body=rows.map(it=>{
    const S=it.S;const occ=CODEIDX.get(K(it.code));
    const cells=stops.map((s,i)=>{const m=(it.hist&&it.hist[s])||'';const c=mcls(m);
      return `<td class="c ${s===nx?'nx':''} ${CAN?'ed':''}" data-id="${esc(it.id)}" data-s="${esc(s)}">${m?`<span class="mk ${c} ${i<ni?'past':''}" title="${esc(mtitle(m))}">${esc(m)}</span>`:''}</td>`}).join('');
    const sk=S.s==='nosap'?(S.sap?'sin dato':'—'):`${fmtQ(S.st)}<small style="font-weight:400;color:var(--mut)"> / ${fmtQ(S.need)}</small>`;
    const obs=(it.obs||[]).join(' · ');
    return `<tr><td class="sbox s-${S.s}" title="${SLAB[S.s]}${S.ub?' · ubic. '+esc(S.ub):''}${S.live?'':' (stock de la carga de parada)'}"><span class="sdot s-${S.s}"></span>${sk}</td>
      <td class="code">${esc(it.code)}${occ?` <a href="#" data-plano="${occ[0]}" title="Ver en el despiece">⌖</a>`:''}</td><td class="code">${esc(it.sap||'')}</td>
      <td>${esc(it.desc)}<div class="grp">${esc(it.grp||'')}</div></td><td class="c">${esc(it.pos||'')}</td><td class="c">${fmtQ(it.qty)}</td><td>${esc(it.per||'')}</td>${cells}<td class="c nx">${it.req>0?`<b title="Unidades que propone KHS">${fmtQ(it.req)}</b>`:it.kn?'<span class="mk des" style="text-decoration:none" title="KHS no lo tiene en su lista">no está</span>':''}</td><td class="obs" title="${esc(obs)}">${esc(obs.length>140?obs.slice(0,140)+'…':obs)}</td></tr>`}).join('');
  const opt=stops.map((s,i)=>`<option value="${esc(s)}" ${s===sel?'selected':''}>${esc(s)}${s===nx?' ★ próxima':i<ni?' · realizada':' · futura'}</option>`).join('');
  view.innerHTML=`<div class="ptc">
    <div class="ptbar"><b style="font-size:16px">Parada técnica · ${esc(M.short||M.name)}</b>
      <label>Parada <select id="ptSel">${opt}</select></label>
      ${CAN&&sel!==nx?'<button class="ptb ghost" id="ptNext" title="Marcar esta parada como la próxima">Marcar como próxima</button>':''}
      <span class="sp"></span>
      <button class="ptb ghost" id="ptExpV">Exportar vista</button><button class="ptb ghost" id="ptExpA">Exportar todo</button>
      ${CAN?'<button class="ptb acc" id="ptUp">Cargar Excel de parada</button>':''}</div>
    <div class="ptcards">
      ${card('chg',cnt.chg,'a cambiar (X)')}${card('alm',cnt.alm,'para almacén (A)','alm')}${card('pre',cnt.pre,'pedir precio (P)','pre')}${card('rev',cnt.rev,'revisar / comprobar','rev')}
      ${card('ok',sc.ok,'con stock suficiente')}${card('part',sc.part,'stock parcial')}${card('none',sc.none,'sin stock')}${card('nosap',sc.nosap,'sin SAP / sin dato','nosap')}
      <button class="ptcard k-part ${f.gap==='kn'?'on':''}" data-card="gkn"><b>${gapKn.length}</b><span>Refresco sí · KHS «no está»</span></button><button class="ptcard k-part ${f.gap==='khs'?'on':''}" data-card="gkhs"><b>${gapKhs.length}</b><span>KHS propone · Refresco sin marca</span></button>
      <button class="ptcard k-none ${f.pend?'on':''}" data-card="pend"><b>${sc.part+sc.none}</b><span>a pedir (parcial + sin stock)</span></button>
    </div>
    <div class="ptbar" style="margin-top:12px"><input type="search" id="ptQ" placeholder="Buscar código, descripción, nota…" value="${esc(f.q)}"><label><input type="checkbox" id="ptAll" ${f.all?'checked':''}> Ver también piezas sin marca en esta parada</label>
      ${(f.cls||f.stk||f.pend||f.gap)?'<button class="ptb ghost" id="ptClr">Quitar filtros</button>':''}<span class="sp"></span><span class="ptmeta">${rows.length} piezas · ${meta.at?'Plan cargado '+esc(fmtD(meta.at))+(meta.file?' ('+esc(meta.file)+')':''):''}</span></div>
    <div class="ptleg">${['X','A','P','R','D'].map(m=>`<span><span class="mk ${mcls(m)}">${m}</span> ${esc(mtitle(m))}</span>`).join('')}<span>Stock: <span class="sdot s-ok"></span>suficiente <span class="sdot s-part"></span>parcial <span class="sdot s-none"></span>sin stock <span class="sdot s-nosap"></span>sin dato (stock/necesario)</span></div>
  </div>
  <div class="ptc" style="padding:0"><div class="ptwrap"><table class="ptt"><thead><tr><th>Stock / nec.</th><th>Código</th><th>SAP</th><th>Descripción</th><th class="c">Pos.</th><th class="c">Cant.</th><th>Periodo</th>${th}<th class="c nx" title="Propuesta de KHS (proveedor): unidades o «no está»">KHS<small>${esc(KH)}</small></th><th>Observaciones</th></tr></thead><tbody>${body||`<tr><td colspan="${9+stops.length}" class="ptempty">Ninguna pieza con estos filtros.</td></tr>`}</tbody></table></div></div>`;
  bindTop();
}
function bindTop(){
  const $v=s=>view.querySelector(s);
  const up=$v('#ptUp');if(up)up.onclick=openUp;
  const sel=$v('#ptSel');if(sel)sel.onchange=e=>{PT.f.stop=e.target.value;render()};
  const nxb=$v('#ptNext');if(nxb)nxb.onclick=()=>{const d=doc();enqueue(()=>dbMerge('shared/pt'+(M.suffix||''),{next:PT.f.stop},Object.assign({},d,{next:PT.f.stop}))).then(()=>toast('Próxima parada: '+PT.f.stop))};
  const q=$v('#ptQ');if(q)q.oninput=e=>{PT.f.q=e.target.value;const p=e.target.selectionStart;render();const n=view.querySelector('#ptQ');n.focus();n.setSelectionRange(p,p)};
  const al=$v('#ptAll');if(al)al.onchange=e=>{PT.f.all=e.target.checked;render()};
  const cl=$v('#ptClr');if(cl)cl.onclick=()=>{Object.assign(PT.f,{cls:'',stk:'',pend:false,gap:''});render()};
  const ev=$v('#ptExpV');if(ev)ev.onclick=()=>exportX(true);const ea=$v('#ptExpA');if(ea)ea.onclick=()=>exportX(false);
}
view.addEventListener('click',e=>{
  const c=e.target.closest('[data-card]');
  if(c){const k=c.dataset.card,f=PT.f;
    if(k==='gkn'||k==='gkhs'){const g=k==='gkn'?'kn':'khs';f.gap=f.gap===g?'':g;f.cls='';f.stk='';f.pend=false}
    else if(k==='pend'){f.pend=!f.pend;f.cls='';f.stk='';f.gap=''}
    else if(['chg','alm','pre','rev','des'].includes(k)){f.cls=f.cls===k?'':k;f.pend=false;f.gap=''}
    else{f.stk=f.stk===k?'':k;f.pend=false;f.gap=''}
    render();return}
  const a=e.target.closest('[data-plano]');
  if(a){e.preventDefault();try{openNode(+a.dataset.plano)}catch(_){}return}
  const td=e.target.closest('td.ed[data-id]');
  if(td&&CAN){const r=td.getBoundingClientRect();showMenu(td.dataset.id,td.dataset.s,r.left,r.bottom+4)}
});
function showMenu(id,s,x,y){
  menu.innerHTML=`<div class="ptmeta" style="padding:4px 8px">Marca para la parada <b>${esc(s)}</b></div>`+MARKS.map(([m,t])=>`<button data-m="${esc(m)}">${m?`<span class="mk ${mcls(m)}">${esc(m)}</span>`:'<span class="mk" style="background:var(--soft);color:var(--mut)">–</span>'} ${esc(t)}</button>`).join('');
  menu.hidden=false;menu.style.left=Math.min(x,innerWidth-230)+'px';menu.style.top=Math.min(y,innerHeight-menu.offsetHeight-10)+'px';
  menu._t={id,s};
}
menu.onclick=e=>{const b=e.target.closest('[data-m]');if(!b)return;const t=menu._t;menu.hidden=true;if(t.pk){if(b.dataset.m)psPatch({[t.pk]:{m:b.dataset.m}});return}setMark(t.id,t.s,b.dataset.m)};
document.addEventListener('mousedown',e=>{if(!menu.hidden&&!menu.contains(e.target))menu.hidden=true});
function setMark(id,s,m){
  const d=doc();if(!d||!d.items[id])return;
  const nd=JSON.parse(JSON.stringify(d));nd.items[id].hist=nd.items[id].hist||{};nd.items[id].hist[s]=m;if(!m)delete nd.items[id].hist[s];
  PT.docs[M.id]=nd;render();
  const patch={items:{[id]:{hist:{[s]:m}}}};
  enqueue(()=>dbMerge('shared/pt'+(M.suffix||''),patch,nd));
}

// ---------- exportar ----------
function exportX(onlyView){
  if(!window.XLSX){toast('No se pudo cargar el lector de Excel');return}
  const d=doc();if(!d)return;const stops=stopsOf(d),sel=PT.f.stop;
  const all=itemsOf(d).map(it=>Object.assign(it,{S:stockOf(it)}));
  let aoa;
  if(onlyView){
    const rows=all.filter(it=>it.hist&&it.hist[sel]&&(!PT.f.cls||mcls(it.hist[sel])===PT.f.cls)&&(!PT.f.stk||it.S.s===PT.f.stk)&&(!PT.f.pend||(['part','none'].includes(it.S.s)&&['chg','alm','pre'].includes(mcls(it.hist[sel])))));
    aoa=[['Código','SAP','Descripción','Grupo','Pos.','Cant.','Marca '+sel,'Stock','Necesario','Estado stock','Ubicación','KHS','Observaciones']].concat(rows.map(it=>[it.code,it.sap||'',it.desc,it.grp||'',it.pos||'',it.qty==null?'':it.qty,it.hist[sel],it.S.st==null?'':it.S.st,it.S.need,SLAB[it.S.s],it.S.ub||'',it.req>0?it.req:(it.kn?'no está':''),(it.obs||[]).join(' · ')]));
  }else{
    aoa=[['Código','SAP','Descripción','Grupo','Pos.','Cant.','Periodo']].concat([]);
    aoa=[['Código','SAP','Descripción','Grupo','Pos.','Cant.','Periodo'].concat(stops,['KHS','Observaciones'])].concat(all.map(it=>[it.code,it.sap||'',it.desc,it.grp||'',it.pos||'',it.qty==null?'':it.qty,it.per||''].concat(stops.map(s=>(it.hist&&it.hist[s])||''),[it.req>0?it.req:(it.kn?'No está':''),(it.obs||[]).join(' · ')])));
  }
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),onlyView?('Parada '+sel).slice(0,31):'Plan de parada');
  XLSX.writeFile(wb,(onlyView?'parada_'+sel+'_':'plan_parada_')+(M.short||M.id).replace(/\W+/g,'_')+'.xlsx');
}

// ---------- lectura de Excel ----------
const STOPRE=/^((?:19|20)\d{2}|\d{2}[A-Za-z]{0,2})(\s|$)|^quesada\s*\d{2}/i;
const isReq=h=>/paco|solicitad/i.test(h);
const codeLike=v=>{v=String(v==null?'':v).trim();return v.length>=6&&!/\s/.test(v)&&/\d/.test(v)&&/^[A-Za-z0-9][A-Za-z0-9\-\/\.]*$/.test(v)};
const S=v=>v==null?'':String(v).trim();
const nnum=v=>{if(v==null||v==='')return null;const f=parseFloat(String(v).replace(',','.'));return isNaN(f)?null:f};
function normMark(v){
  const s=S(v).toUpperCase().replace(/\s+/g,'');if(!s||s[0]==='#'||/^[-?]+$/.test(s))return '';
  if(/^\d+[A-Z]?$/.test(s))return '';
  if(s==='R/P'||s==='R/P?')return s;
  if(s.startsWith('CA'))return 'A';
  const m=s.match(/^([XRPACKDVY])(\?)?/);return m?m[1]+(m[2]||''):'';
}
function parseLibro(rows,sheetName){
  let hr=-1,sc=[];
  for(let i=0;i<Math.min(rows.length,10);i++){
    const c=[];(rows[i]||[]).forEach((v,j)=>{const t=S(v);if(t&&!isReq(t)&&STOCKRE_NOT(t)&&STOPRE.test(t))c.push(j)});
    if(c.length>=3){hr=i;sc=c;break}
  }
  if(hr<0)return null;
  const H=(rows[hr]||[]).map(S);
  const last=Math.max(...sc);
  const stops=sc.map(j=>{const t=H[j];const m=t.match(/^(quesada\s*\d{2}|(?:19|20)\d{2}|\d{2}[A-Za-z]{0,2})/i);return (m?m[1]:t).replace(/\s+/g,' ')});
  const find=(re,from=0)=>{for(let j=from;j<H.length;j++)if(re.test(H[j]))return j;return -1};
  const body=rows.slice(hr+1);
  let cCode=find(/^(c[oó]digo|n[uú]mero de ident\w*|referencia|ref\.?|n[ºo°]?\s?pieza)/i);
  const score=j=>body.reduce((a,r)=>a+(j>=0&&codeLike(r[j])?1:0),0);
  if(cCode<0||score(cCode)<body.length*.2){
    let best=-1,bs=0;for(let j=0;j<last;j++){if(sc.includes(j))continue;const s=score(j);if(s>bs){bs=s;best=j}}
    cCode=best}
  if(cCode<0)return null;
  let cDesc=find(/descrip/i),cQty=find(/^(cant|uds)/i),cPer=find(/periodo|horas/i),cArea=find(/^[aá]rea/i),cSap=find(/^(sap|n[ºo°]?\s?sap)$/i),cReq=find(/paco|solicitad/i);if(cReq<0&&hr>0){const P=(rows[hr-1]||[]).map(S);cReq=P.findIndex(t=>/paco|solicitad/i.test(t))};
  let cPos=find(/^pos/i);if(cPos<0){const p=find(/^pieza$/i);if(p!==cCode)cPos=p}
  const cGrp=(()=>{let j=find(/identificaci[oó]n actual/i);if(j<0)j=find(/subgrupo/i);if(j<0)j=find(/grupo/i);return j})();
  const cYr=find(/a[ñn]o previsto/i);
  const obsC=[];for(let j=last+1;j<H.length+8;j++){if(j===cReq||j===cYr||j===cSap)continue;obsC.push(j)}
  for(let j=0;j<H.length;j++)if(/observ|nota|comentario/i.test(H[j])&&!obsC.includes(j)&&j!==cReq)obsC.push(j);
  const items=[],seen={};
  body.forEach(r=>{
    const code=S(r[cCode]);if(!code||!codeLike(code)&&!/^[A-Za-z0-9]{4,}/.test(code))return;
    const hist={};sc.forEach((j,k)=>{const m=normMark(r[j]);if(m)hist[stops[k]]=m});
    const rq=cReq>=0?nnum(r[cReq]):null,kn=cReq>=0&&/no est/i.test(S(r[cReq]));if(!Object.keys(hist).length&&!(rq>0))return;
    const kk=K(code),n=seen[kk]||0;seen[kk]=n+1;
    const it={id:kk+(n?'#'+n:''),code,desc:S(r[cDesc]),grp:cGrp>=0?S(r[cGrp]):'',pos:cPos>=0?S(r[cPos]):'',qty:cQty>=0?nnum(r[cQty]):null,per:cPer>=0?S(r[cPer]):'',area:cArea>=0?S(r[cArea]):'',hist};
    const ob=obsC.map(j=>S(r[j])).filter(t=>t&&t[0]!=='#'&&!/^[\d.,]+$/.test(t)&&!/^no est[aá]$/i.test(t));
    if(ob.length)it.obs=ob;
    if(cReq>=0){if(rq!=null)it.req=rq;if(kn)it.kn=1}
    if(cSap>=0&&S(r[cSap]))it.sap=S(r[cSap]);
    items.push(it)});
  if(!items.length)return null;
  let reqHdr='';if(cReq>=0)reqHdr=H[cReq]||S((rows[hr-1]||[])[cReq]);
  return {sheet:sheetName,stops,items,reqHdr,codeHdr:H[cCode]||('col. '+(cCode+1))};
}
function STOCKRE_NOT(t){return !/^(pagina|posici|cantidad|horas|nivel)/i.test(t)}
function parseMaster(rows){
  let hr=-1;for(let i=0;i<Math.min(rows.length,6);i++){const h=(rows[i]||[]).map(c=>S(c).toLowerCase());if(h.includes('material')&&h.some(x=>x==='stock real')){hr=i;break}}
  if(hr<0)return null;
  const h=rows[hr].map(c=>S(c).toLowerCase());
  const iM=h.indexOf('material'),iSt=h.indexOf('stock real'),iPP=h.indexOf('punto pedido'),iUb=h.findIndex(x=>x.startsWith('ubic'));
  const alias=h.map((x,i)=>(/^n.?fb$/.test(x)||x.includes('material antiguo'))?i:-1).filter(i=>i>=0);
  const mat={},byc={};
  rows.slice(hr+1).forEach(r=>{const m=S(r[iM]);if(!m)return;mat[m]=[nnum(r[iSt]),iUb>=0?S(r[iUb]):'',iPP>=0?nnum(r[iPP]):null];
    alias.forEach(i=>{const c=K(r[i]);if(c&&!byc[c])byc[c]=m})});
  return {mat,byc};
}
function sapOf(code,master){
  const c=K(code);if(!c)return '';
  if(master){if(master.byc[c])return master.byc[c];if(master.byc[c.replace(/^0+/,'')])return master.byc[c.replace(/^0+/,'')];if(master.mat[S(code)])return S(code)}
  const e=Object.entries(CRITMAP||{}).find(([,v])=>v&&K(v.code)===c&&v.sap);return e?e[1].sap:'';
}

// ---------- carga ----------
function openUp(){
  PT.up={files:[],libro:null,master:null,cands:[],mode:'merge'};
  modalKind='ptup';
  modal.innerHTML=`<div class="mh"><h2>Cargar Excel de parada · ${esc(M.short||M.name)}</h2><span class="crumb">Se lee en tu navegador</span><button class="x" data-close aria-label="Cerrar">✕</button></div>
  <div class="mb" style="padding:16px;overflow:auto">
    <p style="margin:0 0 8px">Sube el <b>libro de operaciones</b> (hoja con una columna por parada: 2026, 26M, 27Q…; marcas X, R, P, A…). Opcionalmente añade la <b>Lista de materiales</b> (hoja «Lista materiales») para cruzar SAP y stock.</p>
    <p class="ptmeta" style="margin:0 0 10px">Formato propio: una columna de código, una por parada y una de observaciones. Si exportas «Exportar todo», ese Excel se puede editar y volver a subir.</p>
    <div class="drop"><input id="ptFiles" type="file" accept=".xlsx,.xlsm,.xls" multiple></div><div id="ptPrev" style="margin-top:12px"></div></div>`;
  ov.classList.add('on');
  modal.querySelector('#ptFiles').onchange=e=>readFiles([...e.target.files]);
}
async function readFiles(files){
  const box=modal.querySelector('#ptPrev');box.innerHTML='Leyendo…';
  try{
    if(!window.XLSX)throw new Error('No se pudo cargar el lector de Excel. Recarga la página.');
    const U=PT.up;U.libro=null;U.master=null;U.cands=[];U.names=[];
    for(const f of files){
      const buf=await f.arrayBuffer();const wb=XLSX.read(buf,{type:'array'});U.names.push(f.name);
      for(const n of wb.SheetNames){
        const rows=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:null,raw:true});
        if(!U.master){const m=parseMaster(rows);if(m){U.master=m;continue}}
        const p=parseLibro(rows,n);if(p){p.file=f.name;U.cands.push(p)}
      }
    }
    U.cands.sort((a,b)=>(/libro|analisis|operaci/i.test(b.sheet)-/libro|analisis|operaci/i.test(a.sheet))||b.items.length-a.items.length);
    U.libro=U.cands[0]||null;
    if(!U.libro&&!U.master)throw new Error('No he encontrado ni columnas de paradas (2026, 26M…) ni una hoja «Lista materiales».');
    preview();
  }catch(e){box.innerHTML=`<div style="color:var(--crit-ink)">${esc(e.message||e)}</div>`}
}
function build(){
  const U=PT.up,d=doc(),old=d&&d.items?d.items:{};
  const res={stops:[],items:{},changes:[],added:0,removed:0,upd:0,next:d&&d.next||null,khs:(d&&d.khs)||'',mat:Object.assign({},(d&&d.mat)||{})};
  if(U.master){const mm=U.master;res.mat={};CODEIDX.forEach((_,k)=>{const sp=mm.byc[k]||mm.byc[k.replace(/^0+/,'')];if(sp&&mm.mat[sp])res.mat[k]=[sp].concat(mm.mat[sp])})}
  const m=U.master;
  const fill=it=>{ if(m){const s=it.sap||sapOf(it.code,m);if(s&&m.mat[s]){it.sap=s;it.st=m.mat[s]}}else if(!it.sap){const s=sapOf(it.code,null);if(s)it.sap=s} return it};
  if(U.libro){
    const P=U.libro;if(P.reqHdr)res.khs=P.reqHdr;
    if(U.mode==='replace'){res.stops=P.stops.slice();Object.keys(old).forEach(k=>{if(!P.items.some(i=>i.id===k))res.removed++})}
    else res.stops=stopsOf(d).slice();
    P.stops.forEach(s=>{if(!res.stops.includes(s))res.stops.push(s)});
    if(U.mode==='merge')Object.entries(old).forEach(([k,v])=>res.items[k]=JSON.parse(JSON.stringify(v)));
    let o=U.mode==='merge'?Object.values(old).reduce((a,v)=>Math.max(a,v.o||0),0):0;
    P.items.forEach(p=>{
      const e=U.mode==='merge'?res.items[p.id]:null;
      if(!e){res.items[p.id]=fill(Object.assign({},p,{o:++o}));res.added++;return}
      let ch=false;
      Object.entries(p.hist).forEach(([s,mk])=>{const prev=(e.hist&&e.hist[s])||'';if(prev!==mk){res.changes.push([p.code,s,prev,mk]);e.hist=e.hist||{};e.hist[s]=mk;ch=true}});
      ['desc','grp','pos','per','area'].forEach(k=>{if(p[k]&&p[k]!==e[k]){e[k]=p[k]}});
      if(p.qty!=null)e.qty=p.qty;if(p.req!=null&&p.req!==e.req){e.req=p.req;ch=true}if(p.kn&&!e.kn){e.kn=1;ch=true}else if(!p.kn&&p.req!=null&&e.kn){delete e.kn;ch=true}
      if(p.obs&&JSON.stringify(p.obs)!==JSON.stringify(e.obs)){e.obs=p.obs;ch=true}
      if(p.sap)e.sap=p.sap;fill(e);if(ch)res.upd++;
    });
    if(!res.next||!res.stops.includes(res.next)){
      const y=new Date().getFullYear();let best=null;
      res.stops.forEach(s=>{const n=Object.values(res.items).filter(i=>i.hist&&i.hist[s]).length;if(n>=5&&yrOf(s)<=y&&!/^quesada/i.test(s))best=s});
      res.next=best||res.stops[res.stops.length-1]}
  }else{ // solo stock
    res.stops=stopsOf(d).slice();Object.entries(old).forEach(([k,v])=>res.items[k]=fill(JSON.parse(JSON.stringify(v))));
  }
  return res;
}
function preview(){
  const U=PT.up,box=modal.querySelector('#ptPrev'),d=doc();
  const R=build();U.res=R;
  const withSap=Object.values(R.items).filter(i=>i.sap).length,tot=Object.keys(R.items).length;
  const L=U.libro;
  box.innerHTML=`
   ${L?`<div style="margin-bottom:8px"><b>Libro:</b> ${U.cands.length>1?`<select id="ptSheet">${U.cands.map((c,i)=>`<option value="${i}" ${c===L?'selected':''}>${esc(c.file)} · ${esc(c.sheet)} (${c.items.length} piezas)</option>`).join('')}</select>`:esc(L.file)+' · hoja «'+esc(L.sheet)+'»'}
     <div class="ptmeta">Columna de código: «${esc(L.codeHdr)}» · paradas detectadas: ${L.stops.map(esc).join(', ')} · ${L.items.length} piezas con marcas</div></div>`:'<div class="ptmeta" style="margin-bottom:8px">Sin libro: solo se actualizará el stock y los SAP del plan actual.</div>'}
   ${U.master?`<div class="ptmeta" style="margin-bottom:8px">Lista de materiales leída (${Object.keys(U.master.mat).length} materiales) · piezas con SAP: <b>${withSap}</b> de ${tot}</div>`:''}
   ${L&&d?`<div style="margin:8px 0"><label><input type="radio" name="ptm" value="merge" ${U.mode==='merge'?'checked':''}> Añadir y actualizar (conserva lo que no venga en el Excel)</label><br><label><input type="radio" name="ptm" value="replace" ${U.mode==='replace'?'checked':''}> Sustituir todo el plan por este Excel</label></div>`:''}
   <div class="ptcards" style="margin:8px 0"><div class="ptcard"><b>${R.added}</b><span>piezas nuevas</span></div><div class="ptcard"><b>${R.changes.length}</b><span>marcas que cambian</span></div><div class="ptcard"><b>${R.upd}</b><span>piezas actualizadas</span></div>${U.mode==='replace'?`<div class="ptcard"><b>${R.removed}</b><span>piezas que desaparecen</span></div>`:''}</div>
   ${R.changes.length?`<div class="ptdiff">${R.changes.slice(0,60).map(c=>`<div><b>${esc(c[0])}</b> · ${esc(c[1])}: ${c[2]?`<span class="mk ${mcls(c[2])}">${esc(c[2])}</span>`:'<i>sin marca</i>'} → ${c[3]?`<span class="mk ${mcls(c[3])}">${esc(c[3])}</span>`:'<i>sin marca</i>'}</div>`).join('')}${R.changes.length>60?`<div class="ptmeta">… y ${R.changes.length-60} más</div>`:''}</div>`:''}
   <div class="ptbar" style="margin-top:12px"><span class="sp"></span><button class="ptb ghost" data-close>Cancelar</button><button class="ptb acc" id="ptGo">Guardar en la parada</button></div>`;
  const sh=box.querySelector('#ptSheet');if(sh)sh.onchange=e=>{U.libro=U.cands[+e.target.value];preview()};
  box.querySelectorAll('[name=ptm]').forEach(r=>r.onchange=e=>{U.mode=e.target.value;preview()});
  box.querySelector('#ptGo').onclick=save;
}
async function save(){
  const U=PT.up,R=U.res,btn=modal.querySelector('#ptGo');btn.disabled=true;btn.textContent='Guardando…';
  const out={stops:R.stops,next:R.next,khs:R.khs||'',mat:R.mat||{},items:R.items,meta:{at:new Date().toISOString(),by:(ME&&ME.id)||'',file:(U.names||[]).join(', ')}};
  try{
    PT.busy=true;
    await DB.doc('shared/pt'+(M.suffix||'')).set(out);
    PT.docs[M.id]=out;PT.f.stop=null;close();toast('Plan de parada guardado');
  }catch(e){btn.disabled=false;btn.textContent='Guardar en la parada';toast('No se pudo guardar: '+((e&&(e.message||e.code))||'error'))}
  finally{PT.busy=false;render()}
}

// ================= Selección de piezas / subconjuntos para la parada (doc shared/ps) =================
const PS={docs:{},ver:{},km:{},I:null};
const nkey=n=>(K(n.code)+'_'+n.pos+'_'+(n.parent!=null&&n.parent>=0?K(N[n.parent].code):'')).replace(/[^A-Za-z0-9_\-.~:@+]/g,'_').slice(0,190);
const psSel=()=>(PS.docs[M.id]&&PS.docs[M.id].sel)||{};
function PSI(){
  if(!M)return {cnt:{},cov:{},self:{},orph:[]};
  const ver=PS.ver[M.id]||0;let I=PS.I;
  if(I&&I.m===M.id&&I.v===ver&&I.n===N.length)return I;
  let km=PS.km[M.id];
  if(!km||km.n!==N.length){km={n:N.length,m:new Map()};N.forEach(n=>{if(n.l>=2)km.m.set(nkey(n),n.id)});PS.km[M.id]=km}
  I={m:M.id,v:ver,n:N.length,cnt:{},cov:{},self:{},orph:[]};
  Object.keys(psSel()).forEach(k=>{
    const id=km.m.get(k);if(id==null){I.orph.push(k);return}
    I.self[id]=k;let p=id;while(p!=null&&p>=0){I.cnt[p]=(I.cnt[p]||0)+1;p=N[p].parent}
    const mark=x=>{if(I.cov[x]==null)I.cov[x]=id;N[x].kids.forEach(mark)};mark(id)});
  PS.I=I;return I;
}
const nodeTxt=id=>N[id].pos+' '+N[id].desc;
PTX.cnt=n=>PSI().cnt[n.id]||0;
PTX.cls=n=>{const I=PSI();return (I.self[n.id]!=null||I.cov[n.id]!=null)?' psel':''};
PTX.note='<b style="color:var(--blue)">🛠n</b> = n elementos elegidos para la próxima parada (abre un subconjunto y pulsa «Añadir a la parada»). ';
PTX.info=n=>{
  const I=PSI(),k=I.self[n.id];
  const add=CAN?`<button class="mini" data-psel="${n.id}">＋ Añadir a la parada</button>`:'';
  if(k!=null){const e=psSel()[k]||{};return `<span class="sub"><b>🛠 En la parada</b> · marca ${esc(e.m||'X')}</span>`+(CAN?`<button class="mini danger" data-punsel="${esc(k)}">Quitar de la parada</button>`:'')}
  if(I.cov[n.id]!=null)return `<span class="sub"><b>🛠 Incluido</b> en ${esc(nodeTxt(I.cov[n.id]))}</span>`;
  if(I.cnt[n.id])return `<span class="sub"><b>🛠 ${I.cnt[n.id]}</b> elegidos dentro</span>`+add;
  return add;
};
PTX.head=n=>{
  if(!CAN||n.l<2)return '';
  const I=PSI(),k=I.self[n.id];
  if(k!=null)return `<button class="mini danger" data-punsel="${esc(k)}" style="margin-left:10px">✓ Este subconjunto está en la parada · Quitar</button>`;
  if(I.cov[n.id]!=null)return `<span class="sum"> · ya incluido en ${esc(nodeTxt(I.cov[n.id]))}</span>`;
  return `<button class="mini" data-psel="${n.id}" style="margin-left:10px">＋ Añadir este subconjunto completo a la parada</button>`;
};
PTX.sub=cur=>{
  const I=PSI(),sel=psSel();
  const ids=Object.entries(I.self).filter(([id])=>+id!==cur&&inSub(+id,cur));
  if(!ids.length)return '';
  const rows=ids.map(([id,k])=>{const e=sel[k]||{};const n=N[+id];
    return `<tr><td><a class="lnk" data-gohl="${n.parent},${n.id}">${esc(pathTxt(n.parent))}</a></td><td class="code">${esc(n.code)}</td><td>${esc(n.desc)}${n.kids.length?' <i>(conjunto)</i>':''}</td><td>${esc(e.m||'X')}</td><td>${CAN?`<button class="mini danger" data-punsel="${esc(k)}">Quitar</button>`:''}</td></tr>`}).join('');
  return `<details class="cdet" open><summary>🛠 Elegido para la parada en este subnivel (${ids.length})</summary><div style="max-height:220px;overflow:auto"><table><thead><tr><th>Dónde está</th><th>Código</th><th>Descripción</th><th>Marca</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
};
function psPatch(ch){
  if(!CAN||!M)return;
  const mid=M.id,sfx=M.suffix||'';
  const d=PS.docs[mid]=PS.docs[mid]||{sel:{}};d.sel=d.sel||{};
  const now=new Date().toISOString(),by=(ME&&ME.id)||'';
  Object.entries(ch).forEach(([k,v])=>{if(v){d.sel[k]=Object.assign({},d.sel[k]||{},v)}else delete d.sel[k]});
  d.meta={at:now,by};
  PS.ver[mid]=(PS.ver[mid]||0)+1;PS.I=null;
  const patch={sel:Object.fromEntries(Object.entries(ch).map(([k,v])=>[k,v||null])),meta:d.meta};
  const full=JSON.parse(JSON.stringify(d));
  try{drawSub();if(PTX.on){drawGroups();drawPlan();refreshModal()}else if(!view.hidden)render()}catch(e){}
  return enqueue(()=>dbMerge('shared/ps'+sfx,patch,full));
}
function nodeEntry(n,extra){return Object.assign({code:n.code,desc:n.desc,pos:n.pos,path:n.parent>=0?pathTxt(n.parent):'',k:n.kids.length?'a':'p',qty:n.qty==null?null:n.qty,m:'X',by:(ME&&ME.id)||'',at:new Date().toISOString()},extra||{})}
function psAdd(id){const n=N[id];if(!n||n.l<2)return;psPatch({[nkey(n)]:nodeEntry(n)});toast('Añadido a la parada: '+n.pos+' '+n.desc)}
modal.addEventListener('click',e=>{
  const a=e.target.closest('[data-psel]');if(a){e.stopPropagation();e.preventDefault();psAdd(+a.dataset.psel);return}
  const u=e.target.closest('[data-punsel]');if(u){e.stopPropagation();e.preventDefault();psPatch({[u.dataset.punsel]:null});return}
},true);

// ---------- vista "Plan de la parada" ----------
function lookups(){
  const pi=new Map(),ci=new Map();
  const d=doc();itemsOf(d).forEach(it=>{const k=K(it.code);if(!pi.has(k))pi.set(k,it)});
  Object.values(CRITMAP||{}).forEach(v=>{if(v&&v.code&&v.sap){const k=K(v.code);if(!ci.has(k))ci.set(k,v)}});
  return {pi,ci,mat:(d&&d.mat)||null};
}
function codeInfo(code,need,L){
  const k=K(code),it=L.pi.get(k);
  if(it)return {it,S:stockOf(it,need)};
  const c=L.ci.get(k);
  const x=!c&&L.mat&&L.mat[k];
  if(x)return {it:null,S:stockOf({sap:x[0],st:[x[1],x[2],x[3]]},need)};
  if(c)return {it:null,S:stockOf({sap:c.sap},need)};
  return {it:null,S:{s:'nosap',st:null,ub:'',pp:null,need,live:false,sap:''}};
}
function leafNodes(n){return n.kids.length?leaves(n.id):[n.id]}
function dotsFor(counts){return ['ok','part','none','nosap'].filter(k=>counts[k]).map(k=>`<span class="stc"><span class="sdot s-${k}"></span>${counts[k]}</span>`).join('')}
function histMini(it,stops,nx){
  if(!it||!it.hist)return '';
  const ni=nx?stops.indexOf(nx):stops.length;
  return stops.filter(s=>it.hist[s]).slice(-5).map(s=>{const i=stops.indexOf(s);return `<span title="${esc(s)}" style="white-space:nowrap"><small style="color:var(--mut)">${esc(s)}</small><span class="mk ${mcls(it.hist[s])} ${i<ni?'past':''}">${esc(it.hist[s])}</span></span>`}).join(' ');
}
function renderPlan(){
  const I=PSI(),sel=psSel(),d=doc(),stops=stopsOf(d),nx=d&&d.next&&stops.includes(d.next)?d.next:null;
  const L=lookups();
  const ents=Object.entries(sel).map(([k,e])=>{const id=(PS.km[M.id]||{m:new Map()}).m.get(k);return {k,e,n:id!=null?N[id]:null}});
  ents.sort((a,b)=>((a.e.path||'')+'|'+String(a.e.pos).padStart(6,'0')).localeCompare((b.e.path||'')+'|'+String(b.e.pos).padStart(6,'0'),'es',{numeric:true}));
  // estadísticas sobre las piezas únicas cubiertas
  const cov=[];N.forEach(n=>{if(n.l>=2&&!n.kids.length&&I.cov[n.id]!=null)cov.push(n)});
  const sc={ok:0,part:0,none:0,nosap:0};cov.forEach(n=>{sc[codeInfo(n.code,n.qty>0?n.qty:1,L).S.s]++});
  const nA=ents.filter(x=>x.e.k==='a').length;
  const card=(v,l,c)=>`<div class="ptcard k-${c||''}" style="cursor:default"><b>${v}</b><span>${l}</span></div>`;
  const body=ents.map(({k,e,n})=>{
    const isA=e.k==='a'&&n;let stk='',hist='',khs='';
    if(n&&!isA){const ci=codeInfo(n.code,n.qty>0?n.qty:1,L);const S=ci.S;
      stk=`<span class="sbox s-${S.s}" title="${SLAB[S.s]}${S.ub?' · ubic. '+esc(S.ub):''}"><span class="sdot s-${S.s}"></span>${S.s==='nosap'?'—':fmtQ(S.st)+' / '+fmtQ(S.need)}</span>`;
      hist=histMini(ci.it,stops,nx);
      if(ci.it)khs=ci.it.req>0?`<b>${fmtQ(ci.it.req)}</b>`:ci.it.kn?'<span class="mk des" style="text-decoration:none">no está</span>':''}
    else if(n){const lv=leafNodes(n),c={ok:0,part:0,none:0,nosap:0};let withH=0;lv.forEach(i=>{const ci=codeInfo(N[i].code,N[i].qty>0?N[i].qty:1,L);c[ci.S.s]++;if(ci.it&&nx&&ci.it.hist&&ci.it.hist[nx])withH++});
      stk=dotsFor(c);hist=withH?`<span class="ptmeta">${withH} pz. con marca en ${esc(nx)}</span>`:''}
    const open=PT.open[k];
    let sub='';
    if(isA&&open){
      sub=`<tr class="sublist"><td colspan="10"><table class="mini2">${leafNodes(n).map(i=>{const c=N[i],ci=codeInfo(c.code,c.qty>0?c.qty:1,L),S=ci.S;
        return `<tr><td class="code">${esc(c.code)}</td><td>${esc(c.desc)}</td><td class="c">${fmtQ(c.qty)}</td><td class="sbox s-${S.s}"><span class="sdot s-${S.s}"></span>${S.s==='nosap'?'—':fmtQ(S.st)+' / '+fmtQ(S.need)}</td><td>${histMini(ci.it,stops,nx)}</td></tr>`}).join('')}</table></td></tr>`}
    const mk=e.m||'X';
    return `<tr class="${n?'':'orph'}"><td>${stk}</td><td class="code">${esc(e.code)}${n?` <a href="#" data-plano="${n.id}" title="Ver en el despiece">⌖</a>`:''}</td>
      <td>${isA?`<a href="#" data-ptog="${esc(k)}">${open?'▾':'▸'}</a> `:''}${esc(e.desc)}<div class="grp">${esc(e.path||'')}${n?'':' · (ya no figura en el despiece)'}</div></td>
      <td>${isA?`Conjunto · ${n?leafNodes(n).length:'?'} pz`:'Pieza'}</td><td class="c">${fmtQ(e.qty)}</td><td>${hist}</td><td class="c">${khs}</td>
      <td class="c ${CAN?'ed':''}" data-pm="${esc(k)}"><span class="mk ${mcls(mk)}" title="${esc(mtitle(mk))}">${esc(mk)}</span></td>
      <td>${CAN?`<input class="pn" data-pnote="${esc(k)}" value="${esc(e.note||'')}" placeholder="nota…">`:esc(e.note||'')}</td>
      <td>${CAN?`<button class="ptb ghost" data-prm="${esc(k)}" title="Quitar de la parada">✕</button>`:''}</td></tr>${sub}`}).join('');
  view.innerHTML=`<div class="ptc"><div class="ptbar"><b style="font-size:16px">Plan de la parada · ${esc(M.short||M.name)}</b>${nx?`<span class="ptmeta">Próxima parada: <b>${esc(nx)}</b></span>`:''}<span class="sp"></span>
      ${CAN&&d?`<button class="ptb ghost" id="ptImp" title="Añade al plan las piezas marcadas en la próxima parada en el libro de operaciones">Traer del libro (${esc(nx||'—')})</button>`:''}
      <button class="ptb ghost" id="ptExpP">Exportar plan (Excel)</button>${CAN&&ents.length?'<button class="ptb ghost" id="ptClrAll">Vaciar plan</button>':''}
      <button class="ptb acc" id="ptGoSel">＋ Seleccionar en el plano</button></div>
    <div class="ptcards">${card(ents.length,'elementos elegidos','chg')}${card(nA,'subconjuntos completos','alm')}${card(cov.length,'piezas incluidas')}${card(sc.ok,'con stock suficiente','ok')}${card(sc.part,'stock parcial','part')}${card(sc.none,'sin stock','none')}${card(sc.nosap,'sin SAP / sin dato','nosap')}</div>
    <div class="ptleg"><span>Stock: <span class="sdot s-ok"></span>suficiente <span class="sdot s-part"></span>parcial <span class="sdot s-none"></span>sin stock <span class="sdot s-nosap"></span>sin dato · El stock y el historial salen del libro de operaciones y de la lista de críticos (carga el Excel de parada para completarlos).</span></div></div>
    <div class="ptc" style="padding:0"><div class="ptwrap"><table class="ptt"><thead><tr><th>Stock / nec.</th><th>Código</th><th>Descripción</th><th>Tipo</th><th class="c">Cant.</th><th>Historial</th><th class="c" title="Propuesta KHS">KHS</th><th class="c">Marca</th><th>Nota</th><th></th></tr></thead>
    <tbody>${body||`<tr><td colspan="10" class="ptempty">Todavía no has elegido nada para la próxima parada.<br>Pulsa «Seleccionar en el plano», abre un subconjunto y añade piezas o el conjunto completo${CAN&&d?', o usa «Traer del libro» para partir de las marcas del Excel':''}.</td></tr>`}</tbody></table></div></div>`;
  const b=s=>view.querySelector(s);
  if(b('#ptGoSel'))b('#ptGoSel').onclick=()=>{PT.view='sel';try{localStorage.setItem('ptView','sel')}catch(_){}sync()};
  if(b('#ptImp'))b('#ptImp').onclick=importLibro;
  if(b('#ptExpP'))b('#ptExpP').onclick=exportPlan;
  const ca=b('#ptClrAll');if(ca)ca.onclick=()=>{if(ca.dataset.sure){psPatch(Object.fromEntries(Object.keys(sel).map(k=>[k,null])));toast('Plan vaciado')}else{ca.dataset.sure=1;ca.textContent='¿Seguro? Pulsa otra vez';setTimeout(()=>{if(ca.isConnected){delete ca.dataset.sure;ca.textContent='Vaciar plan'}},4000)}};
}
function importLibro(){
  const d=doc();if(!d||!CAN)return;const st=d.next||PT.f.stop;const I=PSI(),ch={};let n=0;
  itemsOf(d).forEach(it=>{const m=it.hist&&it.hist[st];if(!m||!['chg','alm','pre','rev'].includes(mcls(m)))return;
    const occ=CODEIDX.get(K(it.code));if(!occ||!occ.length)return;const id=occ[0];
    if(I.cov[id]!=null||I.self[id]!=null)return;const node=N[id];const k=nkey(node);if(ch[k])return;
    ch[k]=nodeEntry(node,{m:m.replace('?',''),src:'libro '+st});n++});
  if(!n){toast('No hay piezas nuevas con marca en '+st+' que estén en el despiece de esta máquina.');return}
  psPatch(ch);toast(n+' piezas añadidas desde el libro ('+st+')');
}
function exportPlan(){
  if(!window.XLSX){toast('No se pudo cargar el lector de Excel');return}
  const sel=psSel(),L=lookups(),d=doc();
  const ents=Object.entries(sel).map(([k,e])=>{const id=(PS.km[M.id]||{m:new Map()}).m.get(k);return {k,e,n:id!=null?N[id]:null}});
  const A=[['Subconjunto','Código','Descripción','Tipo','Cant.','Marca','Nota','Elegido por','Fecha']].concat(ents.map(({e})=>[e.path||'',e.code,e.desc,e.k==='a'?'Conjunto':'Pieza',e.qty==null?'':e.qty,e.m||'X',e.note||'',e.by||'',e.at?fmtD(e.at):'']));
  const seen=new Set(),B=[['Conjunto elegido','Código','Descripción','Cant.','SAP','Stock','Necesario','Estado stock','Ubicación','Marca','Nota']];
  ents.forEach(({e,n})=>{if(!n)return;leafNodes(n).forEach(i=>{const c=N[i];const key=e.k+'|'+i;if(seen.has(i))return;seen.add(i);const ci=codeInfo(c.code,c.qty>0?c.qty:1,L),S=ci.S;
    B.push([(e.path?e.path+' › ':'')+e.pos+' '+e.desc,c.code,c.desc,c.qty==null?'':c.qty,S.sap||'',S.st==null?'':S.st,S.need,SLAB[S.s],S.ub||'',e.m||'X',e.note||''])})});
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(A),'Plan de la parada');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(B),'Piezas incluidas');
  XLSX.writeFile(wb,'plan_parada_'+(M.short||M.id).replace(/\W+/g,'_')+'.xlsx');
}
view.addEventListener('click',e=>{
  const t=e.target.closest('[data-ptog]');if(t){e.preventDefault();PT.open[t.dataset.ptog]=!PT.open[t.dataset.ptog];renderPlan();return}
  const r=e.target.closest('[data-prm]');if(r){psPatch({[r.dataset.prm]:null});return}
  const pm=e.target.closest('td[data-pm]');if(pm&&CAN){const rc=pm.getBoundingClientRect();showMenu(null,'',rc.left,rc.bottom+4);menu._t={pk:pm.dataset.pm}}
});
view.addEventListener('change',e=>{const i=e.target.closest('[data-pnote]');if(i)psPatch({[i.dataset.pnote]:{note:i.value}})});

sync();
})();

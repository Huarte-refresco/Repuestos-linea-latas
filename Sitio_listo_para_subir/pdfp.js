/* PDF de la parada para los técnicos: una hoja por subgrupo (plano con los números a cambiar rodeados en rojo + tabla debajo).
   Al pinchar el plano se salta a una página con el plano ampliado. Los círculos salen de num_<máquina>.json (OCR de los planos). */
(function(){
if(typeof M==='undefined'||typeof planChain!=='function')return;
const JSPDF='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const ATBL='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
const loadScript=u=>new Promise((res,rej)=>{if(document.querySelector('script[src="'+u+'"]'))return res();const s=document.createElement('script');s.src=u;s.onload=res;s.onerror=()=>rej(new Error('No se pudo cargar '+u));document.head.appendChild(s)});
async function libs(){
  if(!window.jspdf)await loadScript(JSPDF);
  if(!window.jspdf.jsPDF.API.autoTable)await loadScript(ATBL);
  return window.jspdf.jsPDF;
}
const OCR={};
async function ocrOf(mid){
  if(OCR[mid]!==undefined)return OCR[mid];
  try{const v=(window.MAPA_CONFIG&&window.MAPA_CONFIG.v)||'1';const r=await fetch('num_'+mid+'.json?v='+v);if(!r.ok)throw new Error(r.status);OCR[mid]=await r.json()}
  catch(e){console.warn('num_'+mid+'.json',e);OCR[mid]=null}
  return OCR[mid];
}
// dónde está cada elemento en los planos: plano que lo contiene (owner) y el nodo cuyo número se ve en él
function planOf(n){
  const P=n.parent,ch=(P!=null&&P>=0)?planChain(P):[];
  if(ch.length)return {owner:ch[0],mark:markIn(ch[0],n.id)};
  if(okPg(n.id).length)return {owner:n.id,mark:null};
  return {owner:null,mark:null};
}
const numOf=(n,pl)=>pl.mark!=null?String(N[pl.mark].pos):String(n.pos);
// det.r = [x0,y0,ancho,alto] (fracción de la página) del rectángulo que ocupa la imagen escaneada dentro de la página que se ve en la app
function hitsOf(det,num){
  const a=det&&det.t&&det.t[num];if(!a)return [];
  const r=det.r||[0,0,1,1];
  return a.filter(e=>e[4]>=75).map(e=>[(r[0]+e[0]/1000*r[2])*1000,(r[1]+e[1]/1000*r[3])*1000,e[2]*r[2],e[3]*r[3],e[4]]);
}
async function planImage(page,hits){
  const b=await getPage(M,page);if(!b)return null;
  const im=new Image();im.src='data:image/webp;base64,'+b;await im.decode();
  const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0);
  g.strokeStyle='#e00000';g.lineWidth=Math.max(3,c.width*0.0032);
  hits.forEach(([cx,cy,w,h])=>{
    const x=cx/1000*c.width,y=cy/1000*c.height,rx=w/1000*c.width/2+c.width*0.009,ry=h/1000*c.height/2+c.height*0.011;
    g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.stroke();
  });
  return {url:c.toDataURL('image/jpeg',0.88),w:c.width,h:c.height};
}
const T=s=>String(s==null?'':s);
const fq=q=>q==null||q===''?'':(Math.round(q*1000)/1000).toString().replace('.',',');

async function make(rowsIn,opt){
  opt=opt||{};
  if(!M){return}
  const all=rowsIn.filter(r=>r.n);
  const rows=all.filter(r=>!r.e.auto);
  const nAuto=all.length-rows.length;
  if(!rows.length){toast('No hay elementos confirmados en el plan para imprimir'+(nAuto?' (las sugeridas ✨ hay que confirmarlas primero)':''));return}
  toast('Preparando el PDF…',60000);
  let J;try{J=await libs()}catch(e){toast('No se pudo cargar el generador de PDF: '+e.message,8000);return}
  const ocr=await ocrOf(M.id);
  // 1) agrupar por plano
  const groups=new Map();
  rows.forEach(r=>{
    const pl=planOf(r.n),key=pl.owner==null?'none':String(pl.owner);
    let g=groups.get(key);if(!g){g={owner:pl.owner,rows:[]};groups.set(key,g)}
    g.rows.push({r,pl,num:numOf(r.n,pl)});
  });
  const list=[...groups.values()].sort((a,b)=>(a.owner==null?1e9:a.owner)-(b.owner==null?1e9:b.owner));
  // 2) hojas: una por (plano, página con números a cambiar)
  const sheets=[];let notFound=0;
  list.forEach(g=>{
    if(g.owner==null){sheets.push({g,page:null,items:g.rows,title:'Sin plano en el PDF de KHS'});return}
    const pgs=okPg(g.owner),byPage=new Map();
    g.rows.forEach(it=>{
      let pg=null,hits=[];
      for(const p of pgs){const h=hitsOf(ocr&&ocr[String(p)],it.num);if(h.length){pg=p;hits=h;break}}
      if(pg==null){pg=pgs[0];it.lost=true;notFound++}
      it.hits=hits;
      if(!byPage.has(pg))byPage.set(pg,[]);byPage.get(pg).push(it);
    });
    [...byPage.entries()].sort((a,b)=>a[0]-b[0]).forEach(([pg,items])=>sheets.push({g,page:pg,items,title:pathTxt(g.owner)||'Subgrupo'}));
  });
  // 3) PDF
  const doc=new J({unit:'mm',format:'a4',orientation:'portrait'});
  const PW=210,PH=297,MX=10;
  const stop=opt.stop||'';
  const head=(t2)=>{
    doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(27,33,48);
    doc.text('Parada técnica · '+T(M.short||M.name)+(stop?' · '+stop:''),MX,10);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(98,107,125);
    doc.text(new Date().toLocaleDateString('es-ES'),PW-MX,10,{align:'right'});
    doc.setDrawColor(200);doc.line(MX,12.5,PW-MX,12.5);
    doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(27,33,48);
    const tl=doc.splitTextToSize(t2,PW-2*MX);doc.text(tl.slice(0,2),MX,18);
    return tl.length>1?24:20;
  };
  const sheetPage=[],links=[];let first=true;
  for(let i=0;i<sheets.length;i++){
    const s=sheets[i];toast('Preparando el PDF… hoja '+(i+1)+' de '+sheets.length,60000);
    if(!first)doc.addPage('a4','portrait');first=false;
    sheetPage.push(doc.getNumberOfPages());
    let y=head(s.title);
    if(s.page!=null){
      const hits=[];s.items.forEach(it=>it.hits.forEach(h=>hits.push(h)));
      let img=null;try{img=await planImage(s.page,hits)}catch(e){console.warn(e)}
      if(img){
        const w=PW-2*MX,h=Math.min(w*img.h/img.w,140);const w2=h*img.w/img.h;
        const x=MX+(w-w2)/2;
        doc.addImage(img.url,'JPEG',x,y,w2,h,undefined,'FAST');
        doc.setDrawColor(180);doc.rect(x,y,w2,h);
        links.push({sheet:i,x,y,w:w2,h,img,page:s.page,hits});
        doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(98,107,125);
        doc.text('Plano pág. '+s.page+' · pinche el plano para verlo ampliado'+(hits.length?' · números a cambiar rodeados en rojo':''),MX,y+h+4);
        y+=h+8;
      }else{doc.setFontSize(9);doc.setTextColor(150,0,0);doc.text('No se pudo cargar el plano',MX,y+5);y+=10}
    }
    const body=s.items.map(it=>{
      const n=it.r.n,e=it.r.e;
      const where=it.pl.mark!=null&&it.pl.mark!==n.id?' (en el plano: conjunto nº '+N[it.pl.mark].pos+')':'';
      const note=(it.lost&&s.page!=null?'Nº no localizado en el plano: buscarlo a mano. ':'')+T(e.note);
      return [T(it.num),T(e.code||n.code),T(e.desc||n.desc)+where,fq(e.qty!=null?e.qty:n.qty),T(e.m||'X'),note,''];
    });
    doc.autoTable({
      startY:y,margin:{left:MX,right:MX,top:16,bottom:12},theme:'grid',
      head:[['Nº','Código','Descripción','Cant.','Marca','Nota','OK']],body,
      styles:{font:'helvetica',fontSize:8.5,cellPadding:1.6,textColor:[27,33,48],lineColor:[200,205,214],lineWidth:0.2,valign:'middle'},
      headStyles:{fillColor:[27,33,48],textColor:255,fontStyle:'bold'},
      columnStyles:{0:{cellWidth:14,fontStyle:'bold',halign:'center'},1:{cellWidth:34,font:'courier',fontSize:8},2:{cellWidth:'auto'},3:{cellWidth:12,halign:'center'},4:{cellWidth:13,halign:'center'},5:{cellWidth:38,fontSize:7.5},6:{cellWidth:11,halign:'center'}},
      rowPageBreak:'avoid',
      didDrawCell:d=>{if(d.section==='body'&&d.column.index===6){const sz=4.5;doc.setDrawColor(27,33,48);doc.setLineWidth(0.3);doc.rect(d.cell.x+(d.cell.width-sz)/2,d.cell.y+(d.cell.height-sz)/2,sz,sz)}},
      didDrawPage:d=>{if(doc.getNumberOfPages()!==sheetPage[i]){doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(98,107,125);doc.text(T(s.title)+' (continuación)',MX,11)}}
    });
  }
  const sheetEnd=doc.getNumberOfPages();
  // 4) planos ampliados (a pantalla completa, apaisados) + enlaces
  const zoomPg=[];
  for(let k=0;k<links.length;k++){
    const L=links[k];
    doc.addPage('a4','landscape');zoomPg.push(doc.getNumberOfPages());
    const W=297,H=210,m=6;
    doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(27,33,48);
    doc.text(T(sheets[L.sheet].title)+' · plano pág. '+L.page,m,m+3);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(0,70,170);
    const back='← Volver a la hoja';doc.text(back,W-m,m+3,{align:'right'});
    doc.link(W-m-40,m-1,40,7,{pageNumber:sheetPage[L.sheet]});
    const aw=W-2*m,ah=H-2*m-8;let w=aw,h=w*L.img.h/L.img.w;if(h>ah){h=ah;w=h*L.img.w/L.img.h}
    doc.addImage(L.img.url,'JPEG',m+(aw-w)/2,m+8,w,h,undefined,'FAST');
  }
  links.forEach((L,k)=>{doc.setPage(sheetPage[L.sheet]);doc.link(L.x,L.y,L.w,L.h,{pageNumber:zoomPg[k]})});
  // 5) numeración de hojas
  const tot=sheetEnd;
  for(let p=1;p<=tot;p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(98,107,125);doc.text('Hoja '+p+' de '+tot,PW-MX,PH-6,{align:'right'})}
  const nm='parada_'+T(M.short||M.id).replace(/\W+/g,'_')+(stop?'_'+stop.replace(/\W+/g,'_'):'')+'.pdf';
  doc.save(nm);
  toast('PDF generado: '+rows.length+' elementos en '+sheets.length+' hoja'+(sheets.length===1?'':'s')+(notFound?' · '+notFound+' números no localizados automáticamente (se avisa en la nota)':'')+(nAuto?' · '+nAuto+' sugeridas sin confirmar no incluidas':'')+(ocr?'':' · sin detección de números (falta num_'+M.id+'.json)'),9000);
}
window.PDFP={make};
})();

const W={k1:1,k05:.5,k025:.25},L={k1:"1 kg",k05:"1/2 kg",k025:"1/4 kg"},DEFAULT_PRICE={k1:30,k05:17,k025:9}; let PRICE={...DEFAULT_PRICE};
const SH={k1:[[2,2]],k05:[[2,1],[1,2]],k025:[[1,1]]};
let counts={k1:0,k05:0,k025:0},pieces=[],editing=null,layoutSeed=0,editContext='plan',savedRecordCode=null,savedRecordDraft=null,currentDraftCode=null,currentLayoutSnapshot={},pinnedLayout=null;
const $=x=>document.getElementById(x);
const total=()=>counts.k1+counts.k05*.5+counts.k025*.25;
const esc=s=>(s||"").replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));

function newPiece(t){return{id:Date.now()+'-'+Math.random(),type:t,client:'',note:'',status:'pendiente',paid:0,deliveryDate:'',phone:''}}
function normalizePiece(p){if(!p.status)p.status='pendiente';if(p.client==null)p.client='';if(p.note==null)p.note='';if(p.paid==null||isNaN(Number(p.paid)))p.paid=0;p.paid=Number(p.paid);if(p.deliveryDate==null)p.deliveryDate='';if(p.phone==null)p.phone='';return p}

function sync(){
 const old={};
 pieces.forEach(p=>{normalizePiece(p);(old[p.type]??=[]).push(p)});
 pieces=[];
 for(const t of ['k1','k05','k025'])for(let i=0;i<counts[t];i++)pieces.push((old[t]||[]).shift()||newPiece(t));
}

function canPlace(occ,r,c,h,w){
 if(r+h>6||c+w>6)return false;
 for(let y=r;y<r+h;y++)for(let x=c;x<c+w;x++)if(occ[y][x])return false;
 return true;
}
function setPlace(occ,r,c,h,w,val){for(let y=r;y<r+h;y++)for(let x=c;x<c+w;x++)occ[y][x]=val}

function generateCandidate(ps,mode){
 const occ=Array.from({length:6},()=>Array(6).fill(false)),map=new Map();
 let order=[...ps],priority={k1:3,k05:2,k025:1};
 order.sort((a,b)=>priority[b.type]-priority[a.type]);
 function rec(i){
  if(i===order.length)return true;
  const p=order[i],positions=[];
  for(const [h,w] of SH[p.type])for(let r=0;r<=6-h;r++)for(let c=0;c<=6-w;c++)
   if(canPlace(occ,r,c,h,w))positions.push({r,c,h,w});
  positions.sort((a,b)=>{
   const m=mode%8;
   if(m===0)return a.r-b.r||a.c-b.c;          // top-left, rows
   if(m===1)return a.c-b.c||a.r-b.r;          // top-left, columns
   if(m===2)return a.r-b.r||b.c-a.c;          // top-right, rows
   if(m===3)return b.r-a.r||a.c-b.c;          // bottom-left, rows
   if(m===4)return b.r-a.r||b.c-a.c;          // bottom-right, rows
   if(m===5)return a.c-b.c||b.r-a.r;          // bottom-left, columns
   if(m===6)return b.c-a.c||a.r-b.r;          // top-right, columns
   return b.c-a.c||b.r-a.r;                   // bottom-right, columns
  });
  for(const q of positions){
   setPlace(occ,q.r,q.c,q.h,q.w,true);map.set(p.id,q);
   if(rec(i+1))return true;
   setPlace(occ,q.r,q.c,q.h,q.w,false);map.delete(p.id);
  }
  return false;
 }
 return rec(0)?map:null;
}

function scoreLayout(map,ps){
 // Build a 6x6 grid showing only the presentation type occupying each physical cell.
 const grid=Array.from({length:6},()=>Array(6).fill('empty'));
 for(const p of ps){
  const q=map.get(p.id);if(!q)continue;
  for(let y=q.r;y<q.r+q.h;y++)for(let x=q.c;x<q.c+q.w;x++)grid[y][x]=p.type;
 }

 let score=0;

 // 1) Main objective: reduce borders between different presentation sizes.
 // Fewer borders = longer, cleaner cutting lines and less "staircase" layout.
 for(let r=0;r<6;r++){
  for(let c=0;c<6;c++){
   if(c<5 && grid[r][c]!==grid[r][c+1])score+=35;
   if(r<5 && grid[r][c]!==grid[r+1][c])score+=35;
  }
 }

 // 2) Strongly prefer every presentation to occupy one compact rectangular zone.
 for(const type of ['k1','k05','k025']){
  const cells=[];
  for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(grid[r][c]===type)cells.push([r,c]);
  if(!cells.length)continue;
  const rs=cells.map(x=>x[0]),cs=cells.map(x=>x[1]);
  const minR=Math.min(...rs),maxR=Math.max(...rs),minC=Math.min(...cs),maxC=Math.max(...cs);
  const boxArea=(maxR-minR+1)*(maxC-minC+1);
  const holes=boxArea-cells.length;
  score+=holes*120;
 }

 // 3) Penalize rows/columns that alternate repeatedly between presentations.
 // This favors one long straight separation instead of several short cuts.
 for(let r=0;r<6;r++){
  let changes=0;
  for(let c=1;c<6;c++)if(grid[r][c]!==grid[r][c-1])changes++;
  score+=changes*12;
 }
 for(let c=0;c<6;c++){
  let changes=0;
  for(let r=1;r<6;r++)if(grid[r][c]!==grid[r-1][c])changes++;
  score+=changes*12;
 }

 // 4) For incomplete plans, keep unused space together toward bottom/right.
 const used=[];
 for(let r=0;r<6;r++)for(let c=0;c<6;c++)if(grid[r][c]!=='empty')used.push([r,c]);
 if(used.length){
  const rs=used.map(x=>x[0]),cs=used.map(x=>x[1]);
  const h=Math.max(...rs)-Math.min(...rs)+1,w=Math.max(...cs)-Math.min(...cs)+1;
  const box=h*w;
  score+=(box-used.length)*60;
  score+=Math.min(...rs)*8+Math.min(...cs)*8;
 }

 return score;
}
function bestLayout(ps){
 let best=null,bestScore=Infinity;
 // Test several scan directions/orientations and keep the one with the cleanest cut geometry.
 for(let mode=0;mode<24;mode++){
  const m=generateCandidate(ps,mode+layoutSeed);if(!m)continue;
  const sc=scoreLayout(m,ps);
  if(sc<bestScore){bestScore=sc;best=m}
 }
 return best;
}
function samePieceSet(ps,saved){
 if(!saved)return false;
 const ids=ps.map(p=>p.id);
 const keys=Object.keys(saved);
 return ids.length===keys.length && ids.every(id=>saved[id]);
}
function layout(ps,target,onTap=null){
 target.innerHTML='';
 if(!ps.length){
   target.innerHTML='<div class="empty">Agrega piezas para crear el mapa.</div>';
   if(target.id==='board')currentLayoutSnapshot={};
   return true;
 }
 ps.forEach(normalizePiece);

 let saved=null;
 if(target.id==='board' && pinnedLayout && samePieceSet(ps,pinnedLayout)) saved=pinnedLayout;

 const m=saved?null:bestLayout(ps);
 if(!saved && !m)return false;

 const snap={};
 for(const p of ps){
   const q=saved?saved[p.id]:m.get(p.id);
   if(!q)continue;
   snap[p.id]={r:q.r,c:q.c,h:q.h,w:q.w};
   const b=document.createElement('button'),st=p.status||'pendiente';
   b.className='piece '+p.type+(p.client||p.note?' assigned':'')+' status-'+st;
   b.style.gridRow=`${q.r+1}/span ${q.h}`;
   b.style.gridColumn=`${q.c+1}/span ${q.w}`;
   b.innerHTML=`<span class="statusdot"></span><span>${L[p.type]}</span>${p.client?`<em>${esc(p.client)}</em>`:''}`;
   b.onclick=()=>{if(onTap)onTap(p.id);else openPiece(p.id)};
   target.appendChild(b);
 }
 if(target.id==='board')currentLayoutSnapshot=snap;
 return true;
}
function renderSavedLayout(ps,target,saved,onTap=null){
 target.innerHTML='';
 if(!ps.length){target.innerHTML='<div class="empty">Sin cortes guardados.</div>';return true}
 for(const p of ps){
   const q=saved&&saved[p.id];if(!q)continue;
   const b=document.createElement('button'),st=p.status||'pendiente';
   b.className='piece '+p.type+(p.client||p.note?' assigned':'')+' status-'+st;
   b.style.gridRow=`${q.r+1}/span ${q.h}`;
   b.style.gridColumn=`${q.c+1}/span ${q.w}`;
   b.innerHTML=`<span class="statusdot"></span><span>${L[p.type]}</span>${p.client?`<em>${esc(p.client)}</em>`:''}`;
   b.onclick=()=>{if(onTap)onTap(p.id)};
   target.appendChild(b);
 }
 return true;
}


const PRICE_STORE='tur_prices_v10';
function loadPrices(){
 try{
  const p=JSON.parse(localStorage.getItem(PRICE_STORE)||'null');
  if(p&&typeof p==='object'){
   PRICE={
    k1:Number(p.k1)>=0?Number(p.k1):DEFAULT_PRICE.k1,
    k05:Number(p.k05)>=0?Number(p.k05):DEFAULT_PRICE.k05,
    k025:Number(p.k025)>=0?Number(p.k025):DEFAULT_PRICE.k025
   };
  }else PRICE={...DEFAULT_PRICE};
 }catch{PRICE={...DEFAULT_PRICE}}
}
function fillPriceEditor(){
 $('price-k1').value=PRICE.k1.toFixed(2);
 $('price-k05').value=PRICE.k05.toFixed(2);
 $('price-k025').value=PRICE.k025.toFixed(2);
}
loadPrices();

const money=n=>'S/ '+Number(n||0).toFixed(2);
window.applyCloudPrices=function(p){if(!p)return;PRICE={k1:Number(p.k1)>=0?Number(p.k1):DEFAULT_PRICE.k1,k05:Number(p.k05)>=0?Number(p.k05):DEFAULT_PRICE.k05,k025:Number(p.k025)>=0?Number(p.k025):DEFAULT_PRICE.k025};localStorage.setItem(PRICE_STORE,JSON.stringify(PRICE));try{loadSettingsView()}catch{}};
function piecePrice(p,priceTable=PRICE){return Number((priceTable||PRICE)[p.type]||0)}
function piecePaid(p){return Math.max(0,Number(p.paid)||0)}
function pieceBalance(p){return Math.max(0,piecePrice(p)-piecePaid(p))}
function salesTotals(ps=pieces,priceTable=PRICE){
 let potential=0,paid=0;
 ps.forEach(p=>{normalizePiece(p);potential+=piecePrice(p,priceTable);paid+=Math.min(piecePaid(p),piecePrice(p,priceTable))});
 return {potential,paid,pending:Math.max(0,potential-paid)};
}
function refreshSales(){
 const t=salesTotals(pieces);
 $('potentialSales').textContent=money(t.potential);
 $('paidSales').textContent=money(t.paid);
 $('pendingSales').textContent=money(t.pending);
}
function refreshPieceMoney(){
 const p=pieces.find(x=>x.id===editing);if(!p)return;
 normalizePiece(p);
 const bal=pieceBalance(p);
 $('piecePrice').textContent=money(piecePrice(p));
 $('pieceBalance').textContent=money(bal);
 $('pieceBalance').className=bal>0?'moneydue':'moneygood';
}


$('togglePrices').onclick=()=>{
 const box=$('priceEditor');
 const willOpen=box.classList.contains('hidden');
 if(willOpen)fillPriceEditor();
 box.classList.toggle('hidden');
 $('togglePrices').textContent=willOpen?'Cerrar':'Editar';
};
$('savePrices').onclick=()=>{
 const next={
  k1:Math.max(0,Number($('price-k1').value)||0),
  k05:Math.max(0,Number($('price-k05').value)||0),
  k025:Math.max(0,Number($('price-k025').value)||0)
 };
 PRICE=next;
 localStorage.setItem(PRICE_STORE,JSON.stringify(PRICE));
 if(window.TurroneraCloud)window.TurroneraCloud.pushPrices().catch(console.error);
 $('priceEditor').classList.add('hidden');
 $('togglePrices').textContent='Editar';
 refreshSales();
 alert('Precios actualizados correctamente.');
};

function update(){
 sync();for(const k in counts)$('n-'+k).textContent=counts[k];
 const d=9-total(),s=$('status'),fits=layout(pieces,$('board'));refreshSales();
 if(!fits){s.className='status bad';s.textContent='Esta combinación no entra correctamente en el mapa.';$('save').disabled=true;$('stateLabel').textContent='Revisar';return}
 if(Math.abs(d)<.001){s.className='status ok';s.textContent=`Perfecto: 9.00 kg · ${pieces.length} piezas.`;$('save').disabled=false;$('stateLabel').textContent='Completa'}
 else if(d>0){s.className='status';s.textContent=`Faltan ${d.toFixed(2)} kg por asignar.`;$('save').disabled=true;$('stateLabel').textContent='Sin completar'}
 else{s.className='status bad';s.textContent=`Te excediste por ${Math.abs(d).toFixed(2)} kg.`;$('save').disabled=true;$('stateLabel').textContent='Excedida'}
}

document.querySelectorAll('.sel button').forEach(b=>b.onclick=()=>{pinnedLayout=null;counts[b.dataset.t]=Math.max(0,counts[b.dataset.t]+Number(b.dataset.d));update()});
$('example').onclick=()=>{pinnedLayout=null;counts={k1:3,k05:6,k025:12};layoutSeed=0;update()};
$('reorganize').onclick=()=>{pinnedLayout=null;layoutSeed=(layoutSeed+1)%12;layout(pieces,$('board'))};
$('clear').onclick=()=>{counts={k1:0,k05:0,k025:0};pieces=[];currentDraftCode=null;pinnedLayout=null;$('general').value='';update()};


function getSavedRecord(code){
 const h=hist();
 return h.find(r=>r.code===code)||null;
}
function getEditingPiece(){
 if(editContext==='saved'){
  if(!savedRecordDraft)return null;
  return (savedRecordDraft.pieces||[]).find(x=>x.id===editing)||null;
 }
 return pieces.find(x=>x.id===editing);
}
function persistSavedPiece(){
 if(editContext!=='saved'||!savedRecordDraft)return false;
 const h=hist(),idx=h.findIndex(r=>r.code===savedRecordDraft.code);
 if(idx<0)return false;
 savedRecordDraft.pieces=(savedRecordDraft.pieces||[]).map(normalizePiece);
 h[idx]=JSON.parse(JSON.stringify(savedRecordDraft));
 setHist(h);
 cloudQueueByCode(savedRecordDraft.code);
 return true;
}


function updateModalWhatsApp(){
 let btn=document.getElementById('modalWhatsapp');
 if(!btn){
  btn=document.createElement('a');btn.id='modalWhatsapp';btn.className='whatsappbtn';
  btn.textContent='Enviar por WhatsApp';
  const save=$('pieceSave');save.parentNode.insertBefore(btn,save);
 }
 const p=getEditingPiece();
 if(!p||!cleanPhone(p.phone)){
  btn.style.display='none';btn.removeAttribute('href');return;
 }
 const priceTable=editContext==='saved'?recordPrices(savedRecordDraft):PRICE;
 btn.href=whatsappUrl(p,priceTable,editContext==='saved'?savedRecordCode:'');btn.onclick=(e)=>{e.preventDefault();openWhatsApp(btn.href)};
 btn.style.display='flex';
}

function openPiece(id){
 editContext='plan';savedRecordCode=null;savedRecordDraft=null;editing=id;
 const p=getEditingPiece();if(!p)return;
 normalizePiece(p);
 const n=pieces.filter(x=>x.type===p.type).findIndex(x=>x.id===id)+1;
 $('pieceTitle').textContent=`${L[p.type]} · pieza ${n}`;
 $('client').value=p.client;$('piecePhone').value=p.phone||'';$('pieceNote').value=p.note;$('pieceDeliveryDate').value=p.deliveryDate||'';$('piecePaid').value=piecePaid(p).toFixed(2);refreshPieceMoney();
 document.querySelectorAll('.statuschoice').forEach(b=>b.classList.toggle('active',b.dataset.status===p.status));
 $('modal').classList.remove('hidden');updateModalWhatsApp();
}

function openSavedPiece(code,id){
 const original=getSavedRecord(code);if(!original)return;
 savedRecordDraft=JSON.parse(JSON.stringify(original));
 savedRecordDraft.pieces=(savedRecordDraft.pieces||[]).map(normalizePiece);
 const p=savedRecordDraft.pieces.find(x=>x.id===id);if(!p)return;
 editContext='saved';savedRecordCode=code;editing=id;
 const n=savedRecordDraft.pieces.filter(x=>x.type===p.type).findIndex(x=>x.id===id)+1;
 $('pieceTitle').innerHTML=`${L[p.type]} · pieza ${n} <span class="savedflag">Historial</span>`;
 $('client').value=p.client;
 $('piecePhone').value=p.phone||'';
 $('pieceNote').value=p.note;
 $('pieceDeliveryDate').value=p.deliveryDate||'';$('piecePaid').value=piecePaid(p).toFixed(2);
 const priceTable=recordPrices(savedRecordDraft);
 $('piecePrice').textContent=money(piecePrice(p,priceTable));
 const bal=Math.max(0,piecePrice(p,priceTable)-piecePaid(p));
 $('pieceBalance').textContent=money(bal);
 $('pieceBalance').className=bal>0?'moneydue':'moneygood';
 document.querySelectorAll('.statuschoice').forEach(b=>b.classList.toggle('active',b.dataset.status===p.status));
 $('modal').classList.remove('hidden');updateModalWhatsApp();
}

$('close').onclick=()=>$('modal').classList.add('hidden');
$('piecePaid').oninput=()=>{
 const p=getEditingPiece();if(!p)return;
 const priceTable=editContext==='saved'?recordPrices(savedRecordDraft):PRICE;
 p.paid=Math.max(0,Number($('piecePaid').value)||0);
 if(p.status!=='entregado')p.status=piecePaid(p)>=piecePrice(p,priceTable)?'pagado':'pendiente';
 document.querySelectorAll('.statuschoice').forEach(b=>b.classList.toggle('active',b.dataset.status===p.status));
 const bal=Math.max(0,piecePrice(p,priceTable)-piecePaid(p));
 $('piecePrice').textContent=money(piecePrice(p,priceTable));
 $('pieceBalance').textContent=money(bal);
 $('pieceBalance').className=bal>0?'moneydue':'moneygood';
 if(editContext==='plan')refreshSales();
};
document.querySelectorAll('.statuschoice').forEach(b=>b.onclick=()=>{
 const p=getEditingPiece();if(!p)return;
 const priceTable=editContext==='saved'?recordPrices(savedRecordDraft):PRICE;
 p.status=b.dataset.status;
 if(p.status==='pagado'){p.paid=piecePrice(p,priceTable);$('piecePaid').value=piecePaid(p).toFixed(2)}
 document.querySelectorAll('.statuschoice').forEach(x=>x.classList.toggle('active',x===b));
 const bal=Math.max(0,piecePrice(p,priceTable)-piecePaid(p));
 $('piecePrice').textContent=money(piecePrice(p,priceTable));
 $('pieceBalance').textContent=money(bal);
 $('pieceBalance').className=bal>0?'moneydue':'moneygood';
 if(editContext==='plan')refreshSales();
});
$('pieceSave').onclick=()=>{
 const p=getEditingPiece();if(!p)return;
 const priceTable=editContext==='saved'?recordPrices(savedRecordDraft):PRICE;
 p.client=$('client').value.trim();
 p.phone=$('piecePhone').value.trim();
 p.note=$('pieceNote').value.trim();p.deliveryDate=$('pieceDeliveryDate').value||'';
 p.paid=Math.max(0,Number($('piecePaid').value)||0);
 if(p.status!=='entregado')p.status=piecePaid(p)>=piecePrice(p,priceTable)?'pagado':'pendiente';
 if(editContext==='saved'){
  const code=savedRecordCode;
  persistSavedPiece();
  $('modal').classList.add('hidden');
  savedRecordDraft=null;
  detail(code);
 }else{
  $('modal').classList.add('hidden');
  layout(pieces,$('board'));refreshSales();
 }
};
$('pieceClear').onclick=()=>{
 const p=getEditingPiece();if(!p)return;
 p.client='';p.phone='';p.note='';p.status='pendiente';p.paid=0;p.deliveryDate='';
 if(editContext==='saved'){
  const code=savedRecordCode;
  persistSavedPiece();
  $('modal').classList.add('hidden');
  savedRecordDraft=null;
  detail(code);
 }else{
  $('modal').classList.add('hidden');
  layout(pieces,$('board'));refreshSales();
 }
};

const STORE='tur_v1414';
function migrateHistory(){
 try{
  if(!localStorage.getItem(STORE)){
   const old=localStorage.getItem('tur_v1417')||localStorage.getItem('tur_v1413')||localStorage.getItem('tur_v1412')||localStorage.getItem('tur_v14')||localStorage.getItem('tur_v132')||localStorage.getItem('tur_v131')||localStorage.getItem('tur_v13')||localStorage.getItem('tur_v121')||localStorage.getItem('tur_v12')||localStorage.getItem('tur_v11')||localStorage.getItem('tur_v10')||localStorage.getItem('tur_v91')||localStorage.getItem('tur_v9')||localStorage.getItem('tur_v81')||localStorage.getItem('tur_v8')||localStorage.getItem('tur_v7')||localStorage.getItem('tur_v6')||localStorage.getItem('tur_v5')||localStorage.getItem('tur_v4');
   if(old)localStorage.setItem(STORE,old);
  }
 }catch(e){}
}
migrateHistory();
const hist=()=>{try{const h=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(h)?h:[]}catch{return[]}};
const setHist=x=>{localStorage.setItem(STORE,JSON.stringify(x));localStorage.setItem('tur_v15_cache',JSON.stringify(x));};
function cloudQueueByCode(code){try{const r=hist().find(x=>x.code===code);if(r&&window.TurroneraCloud)window.TurroneraCloud.queueRecord(r)}catch(e){console.error(e)}}

function saveCurrent(status){
 const h=hist(),now=new Date().toISOString();
 const idx=currentDraftCode?h.findIndex(r=>r.code===currentDraftCode):-1;
 const seq=idx>=0?(h[idx].seq||1):(h.length?Math.max(...h.map(x=>x.seq||0))+1:1);
 const code=idx>=0?h[idx].code:'TUR-'+String(seq).padStart(4,'0');
 const rec={
   seq,code,
   date:idx>=0?(h[idx].date||now):now,
   updatedAt:now,
   status,
   counts:{...counts},
   pieces:JSON.parse(JSON.stringify(pieces)),
   general:$('general').value.trim(),
   prices:{...PRICE},
   savedLayout:JSON.parse(JSON.stringify(currentLayoutSnapshot))
 };
 if(idx>=0)h[idx]=rec;else h.unshift(rec);
 setHist(h);
 cloudQueueByCode(code);
 currentDraftCode=code;
 return rec;
}
$('save').onclick=()=>{
 if(Math.abs(total()-9)>.001)return;
 const r=saveCurrent('finalizada');
 alert(r.code+' finalizada correctamente.');
 counts={k1:0,k05:0,k025:0};pieces=[];currentDraftCode=null;pinnedLayout=null;$('general').value='';
 update();renderDashboard();show('history');
};
$('saveDraft').onclick=()=>{
 if(!pieces.length){alert('Agrega al menos un corte antes de guardar el avance.');return}
 const r=saveCurrent('borrador');
 alert(r.code+' guardada como avance.');
 renderDashboard();
};

function recordPrices(r){return r&&r.prices?{k1:Number(r.prices.k1||0),k05:Number(r.prices.k05||0),k025:Number(r.prices.k025||0)}:{...DEFAULT_PRICE}}
function renderClientSummary(records){
 const box=$('clientSummary'),groups=new Map(),today=new Date();today.setHours(0,0,0,0);
 const kgOf=p=>p.type==='k1'?1:p.type==='k05'?.5:p.type==='k025'?.25:0;
 for(const r of records){
  const rp=recordPrices(r);
  for(const p0 of (r.pieces||[])){
   const p=normalizePiece(p0),name=(p.client||'').trim();if(!name)continue;
   const phone=cleanPhone(p.phone||''),key=(phone||name.toLowerCase());
   if(!groups.has(key))groups.set(key,{name,phone,items:0,kg:0,total:0,paid:0,balance:0,last:null,next:null,pending:0,delivered:0});
   const g=groups.get(key),price=piecePrice(p,rp),paid=Math.min(piecePaid(p),price),rd=new Date(r.date);
   g.items++;g.kg+=kgOf(p);g.total+=price;g.paid+=paid;g.balance+=Math.max(0,price-paid);
   if(p.status==='entregado')g.delivered++;else g.pending++;
   if(!g.last||rd>g.last)g.last=rd;
   if(p.deliveryDate){const d=new Date(p.deliveryDate+'T00:00:00');if(d>=today&&(!g.next||d<g.next))g.next=d}
   if(!g.phone&&phone)g.phone=phone;
  }
 }
 let arr=[...groups.values()];
 const filter=window.clientFilter||'all';
 if(filter==='debt')arr=arr.filter(g=>g.balance>.001);
 if(filter==='delivery')arr=arr.filter(g=>g.next);
 if(filter==='frequent')arr=arr.filter(g=>g.items>=2);
 arr.sort((a,b)=>b.balance-a.balance||b.items-a.items||a.name.localeCompare(b.name));
 if(!groups.size){box.innerHTML='<p class="hint">No hay clientes registrados todavía.</p>';return}
 const chips='<div class="clientFilters">'+[['all','Todos'],['debt','Con saldo'],['delivery','Próximas entregas'],['frequent','Frecuentes']].map(([k,l])=>'<button class="clientFilter '+(filter===k?'active':'')+'" data-f="'+k+'">'+l+'</button>').join('')+'</div>';
 box.innerHTML=chips+'<div class="clientSummaryCard"><div class="clientHead"><h3>Clientes</h3><small>'+groups.size+' registrados</small></div>'+(arr.length?arr.map(g=>{
   const wa=g.phone?'https://wa.me/'+g.phone:'';
   return '<article class="clientCard"><div class="clientTop"><div><b>'+esc(g.name)+'</b><small>'+(g.phone?esc(g.phone):'Sin celular')+'</small></div><span class="'+(g.balance>0?'debtBadge':'okBadge')+'">'+(g.balance>0?'Debe '+money(g.balance):'Al día')+'</span></div><div class="clientStats"><span><b>'+g.items+'</b> pedidos</span><span><b>'+g.kg.toFixed(2)+'</b> kg</span><span><b>'+money(g.total)+'</b> comprado</span></div><div class="clientMoneyLine"><span>Pagó <b>'+money(g.paid)+'</b></span><span>Saldo <b>'+money(g.balance)+'</b></span></div><div class="clientDates"><small>Última compra: '+(g.last?g.last.toLocaleDateString('es-PE'):'—')+'</small><small>Próxima entrega: '+(g.next?g.next.toLocaleDateString('es-PE'):'—')+'</small></div>'+(wa?'<a class="whatsappbtn clientWa" href="'+wa+'" target="_blank" rel="noopener">WhatsApp</a>':'')+'</article>'
 }).join(''):'<p class="hint">No hay clientes para este filtro.</p>')+'</div>';
 box.querySelectorAll('.clientFilter').forEach(b=>b.onclick=()=>{window.clientFilter=b.dataset.f;renderHistory()});
}
let historyMode='clients';
function setHistoryMode(mode){
 historyMode=mode;
 const c=$('historyClientsTab'),t=$('historyTurronerasTab');
 if(c)c.classList.toggle('active',mode==='clients');
 if(t)t.classList.toggle('active',mode==='turroneras');
 renderHistory();
}

function renderHistory(){
 const q=$('search').value.trim().toLowerCase(),list=$('historyList'),summary=$('clientSummary');
 let all=hist().map(r=>({...r,status:r.status||'finalizada',pieces:(r.pieces||[]).map(normalizePiece)}));

 if(historyMode==='clients'){
   list.innerHTML='';
   if(summary){
     summary.style.display='block';
     let filtered=all;
     if(q){
       filtered=all.map(r=>({...r,pieces:r.pieces.filter(p=>(p.client||'').toLowerCase().includes(q))}))
                   .filter(r=>r.pieces.length);
     }
     renderClientSummary(filtered);
     summary.classList.add('onlyHistory');
     if(!summary.innerHTML.trim())summary.innerHTML='<p class="hint">No hay clientes.</p>';
   }
   return;
 }

 if(summary){summary.style.display='none';summary.innerHTML='';}
 let h=q?all.filter(r=>JSON.stringify(r).toLowerCase().includes(q)):all;
 list.innerHTML='';
 if(!h.length){list.innerHTML='<p class="hint">No hay turroneras.</p>';return}
 for(const r of h){
   const rp=recordPrices(r),st=salesTotals(r.pieces,rp),draft=r.status==='borrador';
   const kg=((r.counts||{}).k1||0)+((r.counts||{}).k05||0)*.5+((r.counts||{}).k025||0)*.25;
   const card=document.createElement('article');card.className='hist';
   card.innerHTML=`<div class="row"><div><h3>${esc(r.code)}</h3><p class="hint">${new Date(r.date).toLocaleString('es-PE')}</p></div><span class="${draft?'draftBadge':'finalBadge'}">${draft?'En proceso':'Finalizada'}</span></div>
   <div class="chips"><span class="chip">1 kg: ${(r.counts||{}).k1||0}</span><span class="chip">1/2: ${(r.counts||{}).k05||0}</span><span class="chip">1/4: ${(r.counts||{}).k025||0}</span><span class="chip">${kg} kg</span></div>
   <div class="salesline"><span class="salespill">Cobrado: ${money(st.paid)}</span><span class="salespill">Por cobrar: ${money(st.pending)}</span></div>
   <button class="linkbtn viewDetail">Ver mapa, clientes y pagos</button>
   ${draft?'<button class="resumeBtn">Continuar corte</button>':''}`;
   card.querySelector('.viewDetail').onclick=()=>detail(r.code);
   const rb=card.querySelector('.resumeBtn');if(rb)rb.onclick=()=>resumeDraft(r.code);
   list.appendChild(card);
 }
}
$('search').oninput=renderHistory;
$('historyClientsTab').onclick=()=>setHistoryMode('clients');
$('historyTurronerasTab').onclick=()=>setHistoryMode('turroneras');
function statusName(s){return s==='pagado'?'Pagado':s==='entregado'?'Entregado':'Pendiente'}
function resumeDraft(code){
 const r=hist().find(x=>x.code===code);if(!r)return;
 counts={k1:(r.counts||{}).k1||0,k05:(r.counts||{}).k05||0,k025:(r.counts||{}).k025||0};
 pieces=JSON.parse(JSON.stringify((r.pieces||[]).map(normalizePiece)));
 currentDraftCode=code;
 pinnedLayout=r.savedLayout||null;
 $('general').value=r.general||'';
 update();
 show('plan');
}
function detail(code){
 const r=hist().find(x=>x.code===code);if(!r)return;
 r.pieces=(r.pieces||[]).map(normalizePiece);
 const rp=recordPrices(r),st=salesTotals(r.pieces,rp),draft=r.status==='borrador';
 $('detailBody').innerHTML=`<div class="detailcard">
   <div class="row"><h2>${esc(r.code)}</h2><span class="${draft?'draftBadge':'finalBadge'}">${draft?'En proceso':'Finalizada'}</span></div>
   <div class="editnotice">El mapa muestra exactamente la distribución que fue guardada.</div>
   <div class="salescard"><div><span>Venta</span><b>${money(st.potential)}</b></div><div><span>Cobrado</span><b>${money(st.paid)}</b></div><div><span>Por cobrar</span><b>${money(st.pending)}</b></div></div>
   <div id="detailBoard" class="board"></div>
   ${draft?'<button id="resumeFromDetail" class="resumeBtn">Continuar este corte</button>':''}
 </div>`;
 if(r.savedLayout&&Object.keys(r.savedLayout).length){
   renderSavedLayout(r.pieces,$('detailBoard'),r.savedLayout,id=>openSavedPiece(code,id));
 }else{
   layout(r.pieces,$('detailBoard'),id=>openSavedPiece(code,id));
 }
 const btn=$('resumeFromDetail');if(btn)btn.onclick=()=>resumeDraft(code);
 show('detail',false);
}
function cleanPhone(phone){
 let n=String(phone||'').replace(/\D/g,'');
 if(!n)return '';
 if(n.length===9)n='51'+n;
 return n;
}
function whatsappUrl(p,priceTable,code){
 const phone=cleanPhone(p.phone);if(!phone)return '';
 const price=piecePrice(p,priceTable),paid=Math.min(piecePaid(p),price),balance=Math.max(0,price-paid);
 let msg=`Hola ${p.client||''}, te escribimos de Dulces Momentos por tu pedido de turrón ${L[p.type]}.`;
 if(p.deliveryDate)msg+=` Fecha de entrega: ${p.deliveryDate}.`;
 msg+=` Total: ${money(price)}. Pagado: ${money(paid)}. Saldo: ${money(balance)}.`;
 if(code)msg+=` Pedido: ${code}.`;
 return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
}
function openWhatsApp(url){
 if(!url){alert('Primero agrega el número de celular / WhatsApp del cliente.');return false}
 window.location.assign(url);return false;
}
function localISODate(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function dashboardData(){
 const records=hist().map(r=>({...r,pieces:(r.pieces||[]).map(normalizePiece)})),today=localISODate(),tm=new Date();tm.setDate(tm.getDate()+1);const tomorrow=localISODate(tm);
 const ws=new Date();ws.setDate(ws.getDate()-6);const weekStart=localISODate(ws);
 let sale=0,paid=0,pendingPieces=0,paidPieces=0,deliveredPieces=0,k1=0,k05=0,k025=0,todaySales=0,todayPaid=0,weekSales=0,weekPaid=0;
 const clients=new Map(),agenda=[];
 for(const r of records){const rp=recordPrices(r),st=salesTotals(r.pieces,rp),created=(r.date||'').slice(0,10);sale+=st.potential;paid+=st.paid;k1+=(r.counts||{}).k1||0;k05+=(r.counts||{}).k05||0;k025+=(r.counts||{}).k025||0;
  if(created===today){todaySales+=st.potential;todayPaid+=st.paid} if(created&&created>=weekStart&&created<=today){weekSales+=st.potential;weekPaid+=st.paid}
  for(const p of r.pieces){if(p.status==='entregado')deliveredPieces++;else if(p.status==='pagado')paidPieces++;else pendingPieces++;
   const client=(p.client||'').trim(),price=piecePrice(p,rp),pp=Math.min(piecePaid(p),price),balance=Math.max(0,price-pp);
   if(client){const key=client.toLowerCase();if(!clients.has(key))clients.set(key,{name:client,total:0,paid:0,pieces:0});const g=clients.get(key);g.total+=price;g.paid+=pp;g.pieces++}
   if(client||p.deliveryDate)agenda.push({code:r.code,client:client||'Sin cliente',type:p.type,deliveryDate:p.deliveryDate||'',status:p.status,balance,phone:p.phone||'',priceTable:rp,piece:p});
  }
 }
 const debtors=[...clients.values()].map(g=>({...g,balance:Math.max(0,g.total-g.paid)})).filter(g=>g.balance>.001).sort((x,y)=>y.balance-x.balance);
 return {records:records.length,sale,paid,pending:Math.max(0,sale-paid),pendingPieces,paidPieces,deliveredPieces,k1,k05,k025,debtors,today,tomorrow,agenda,todaySales,todayPaid,weekSales,weekPaid};
}
let agendaFilter='today';
function agendaMatches(x,d,f){if(f==='today')return x.deliveryDate===d.today&&x.status!=='entregado';if(f==='tomorrow')return x.deliveryDate===d.tomorrow&&x.status!=='entregado';if(f==='delivery')return x.deliveryDate&&x.status!=='entregado';if(f==='payment')return x.balance>.001;return true}
function renderAgendaList(d){const box=$('agendaList'),items=d.agenda.filter(x=>agendaMatches(x,d,agendaFilter)).sort((x,y)=>(x.deliveryDate||'9999').localeCompare(y.deliveryDate||'9999'));document.querySelectorAll('.agendacard').forEach(b=>b.classList.toggle('active',b.dataset.agenda===agendaFilter));box.innerHTML=items.length?items.slice(0,12).map(x=>{const wa=whatsappUrl(x.piece,x.priceTable,x.code);return `<div class="agendaItem"><div class="row"><div><b>${esc(x.client)}</b><small>${L[x.type]} · ${esc(x.code||'')}</small>${x.deliveryDate?`<span class="datechip">${x.deliveryDate}</span>`:''}${wa?`<div><a class="whatsappbtn" href="${wa}" onclick="return openWhatsApp(this.href)">WhatsApp</a></div>`:`<div class="phonehint"><b>WhatsApp:</b> agrega el celular entrando al pedido.</div>`}</div><strong>${money(x.balance)}</strong></div></div>`}).join(''):'<div class="emptydash">No hay pedidos en esta categoría.</div>'}
function renderDashboard(){const d=dashboardData();$('dashTurroneras').textContent=d.records;$('dashVenta').textContent=money(d.sale);$('dashCobrado').textContent=money(d.paid);$('dashPendiente').textContent=money(d.pending);$('dashPiecesPending').textContent=d.pendingPieces;$('dashPiecesPaid').textContent=d.paidPieces;$('dashPiecesDelivered').textContent=d.deliveredPieces;$('dashK1').textContent=d.k1;$('dashK05').textContent=d.k05;$('dashK025').textContent=d.k025;$('dashDebtClients').textContent=d.debtors.length;
 $('dashToday').textContent=d.agenda.filter(x=>x.deliveryDate===d.today&&x.status!=='entregado').length;$('dashTomorrow').textContent=d.agenda.filter(x=>x.deliveryDate===d.tomorrow&&x.status!=='entregado').length;$('dashDeliveryPending').textContent=d.agenda.filter(x=>x.deliveryDate&&x.status!=='entregado').length;$('dashPaymentPending').textContent=d.agenda.filter(x=>x.balance>.001).length;
 $('reportTodaySales').textContent=money(d.todaySales);$('reportTodayPaid').textContent=money(d.todayPaid);$('reportWeekSales').textContent=money(d.weekSales);$('reportWeekPaid').textContent=money(d.weekPaid);
 const box=$('dashDebtors');box.innerHTML=d.debtors.length?d.debtors.slice(0,8).map(g=>`<div class="debtor"><div class="row"><div><b>${esc(g.name)}</b><small>${g.pieces} pieza${g.pieces===1?'':'s'} · Total ${money(g.total)}</small></div><strong>${money(g.balance)}</strong></div></div>`).join(''):'<div class="emptydash">No hay clientes con saldo pendiente.</div>';renderAgendaList(d)}
document.querySelectorAll('.agendacard').forEach(b=>b.onclick=()=>{agendaFilter=b.dataset.agenda;renderAgendaList(dashboardData())});
$('dashNewPlan').onclick=()=>show('plan');

$('back').onclick=()=>show('history');
function show(v,nav=true){
 document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===v));
 if(v==='history')renderHistory();if(v==='dashboard')renderDashboard();if(v==='settings')loadSettingsView();
 if(nav)document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
 scrollTo(0,0);
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  show(b.dataset.v);
  if(b.dataset.v==='dashboard')refreshResumenSeguro();
});
$('export').onclick=()=>{
 const blob=new Blob([JSON.stringify(hist(),null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=u;a.download='historial-mi-turronera-v14-1-4.json';a.click();URL.revokeObjectURL(u);
};
update();

if($('piecePhone'))$('piecePhone').addEventListener('input',updateModalWhatsApp);

function loadSettingsView(){
 $('settings-price-k1').value=PRICE.k1.toFixed(2);
 $('settings-price-k05').value=PRICE.k05.toFixed(2);
 $('settings-price-k025').value=PRICE.k025.toFixed(2);
}

$('settingsSavePrices').onclick=()=>{
 PRICE={
   k1:Math.max(0,Number($('settings-price-k1').value)||0),
   k05:Math.max(0,Number($('settings-price-k05').value)||0),
   k025:Math.max(0,Number($('settings-price-k025').value)||0)
 };
 localStorage.setItem(PRICE_STORE,JSON.stringify(PRICE));
 if(window.TurroneraCloud)window.TurroneraCloud.pushPrices().catch(console.error);
 fillPriceEditor();
 refreshSales();
 alert('Precios guardados.');
};

function exportBackup(){
 const payload={
   app:'Mi Turronera',
   version:'14',
   exportedAt:new Date().toISOString(),
   prices:PRICE,
   history:hist()
 };
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='respaldo-mi-turronera-v14.json';a.click();URL.revokeObjectURL(url);
}
$('backupAll').onclick=exportBackup;

$('importBackup').onchange=async e=>{
 const file=e.target.files&&e.target.files[0]; if(!file)return;
 try{
  const text=await file.text(),data=JSON.parse(text);
  if(!data||data.app!=='Mi Turronera'||!Array.isArray(data.history))throw new Error('Formato inválido');
  if(!confirm('¿Importar este respaldo? Esto reemplazará los datos actuales.'))return;
  setHist(data.history);
  if(data.prices){
    PRICE={
      k1:Number(data.prices.k1)||DEFAULT_PRICE.k1,
      k05:Number(data.prices.k05)||DEFAULT_PRICE.k05,
      k025:Number(data.prices.k025)||DEFAULT_PRICE.k025
    };
    localStorage.setItem(PRICE_STORE,JSON.stringify(PRICE));
  }
  if(window.TurroneraCloud?.isReady()){await window.TurroneraCloud.pushOfficialBackup(data.history,data.prices||PRICE);}
  alert('Respaldo oficial importado y sincronizado correctamente.');
  loadSettingsView();renderDashboard();renderHistory();
 }catch(err){console.error('IMPORT_BACKUP_ERROR',err);alert('Error al importar: '+(err?.message||String(err)))}
 e.target.value='';
};

$('clearBusinessData').onclick=()=>{
 if(!confirm('¿Borrar todas las turroneras, clientes, pagos y agenda? Los precios se conservarán.'))return;
 if(!confirm('Confirmación final: ¿seguro que deseas borrar todos los datos del negocio?'))return;
 setHist([]);
 alert('Datos del negocio eliminados.');
 renderDashboard();renderHistory();
};

$('factoryReset').onclick=()=>{
 if(!confirm('¿Restablecer toda la aplicación? Se borrarán historial y precios personalizados.'))return;
 if(!confirm('Confirmación final: esta acción dejará la app como recién instalada.'))return;
 localStorage.removeItem(STORE);
 localStorage.removeItem(PRICE_STORE);
 PRICE={...DEFAULT_PRICE};
 setHist([]);
 alert('Aplicación restablecida.');
 loadSettingsView();renderDashboard();renderHistory();show('dashboard');
};



// V14.1.8: refrescar Resumen siempre con datos locales existentes.
function refreshResumenSeguro(){
  try{ if(typeof renderDashboard==='function') renderDashboard(); }
  catch(e){ console.error('Error al refrescar Resumen',e); }
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', refreshResumenSeguro);
}else{
  refreshResumenSeguro();
}
window.addEventListener('pageshow', refreshResumenSeguro);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) refreshResumenSeguro(); });

if('serviceWorker' in navigator){window.addEventListener('load',async()=>{try{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mi-turronera-')).map(k=>caches.delete(k)));console.log('Mi Turronera: cache PWA anterior eliminada');}catch(e){console.error(e)}});}

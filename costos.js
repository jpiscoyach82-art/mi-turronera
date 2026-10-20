/* Dulces Momentos: gastos y miel - datos compartidos en Supabase */
(()=>{'use strict';
const $=id=>document.getElementById(id), money=n=>'S/ '+Number(n||0).toFixed(2), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let bid=null,uid=null,role='',expenses=[],batches=[];
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const notice=(s,bad=false)=>{const e=$('costMsg');if(e){e.textContent=s;e.style.color=bad?'#a22':'#27663a'}};
const numeric=id=>Number($(id)?.value||0);
const getSession=async()=>{const {data:{session}}=await turCloud.auth.getSession();if(!session)throw Error('Primero inicia sesión.');uid=session.user.id;const {data,error}=await turCloud.rpc('claim_my_access');if(error)throw error;bid=data?.[0]?.business_id;role=data?.[0]?.role||'';if(!bid)throw Error('No se encontró el negocio autorizado.')};
async function load(){try{await getSession();const all=[];for(let start=0;start<10000;start+=1000){const e=await turCloud.from('business_expenses').select('*').eq('business_id',bid).order('spent_on',{ascending:false}).range(start,start+999);if(e.error)throw e.error;all.push(...(e.data||[]));if((e.data||[]).length<1000)break}const h=await turCloud.from('honey_batches').select('*').eq('business_id',bid).order('made_on',{ascending:false}).limit(1000);if(h.error)throw h.error;expenses=all;batches=h.data||[];render();estimate();notice('Datos sincronizados.')}catch(e){notice(e.message,true)}}

const recipe=[['Membrillo',0.7,'kg'],['Maracuyá',0.5,'kg'],['Melocotón',0.5,'kg'],['Mandarina',0.25,'kg'],['Manzana',0.5,'kg'],['Plátano',5,'unidad'],['Piña',0.5,'kg'],['Papaya',0.5,'kg'],['Naranja',0.25,'kg'],['Hierba luisa',8,'unidad'],['Canela',4,'unidad'],['Clavo de olor',5,'unidad']];
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function matchingPurchase(x,name,unit){
 const label=norm(x.item),target=norm(name),category=norm(x.category);
 const nameMatch=label.includes(target)||target.includes(label)&&label.length>3;
 const catMatch=(target==='azucar'&&category==='azucar')||(target==='glucosa'&&category==='glucosa');
 if(!nameMatch&&!catMatch)return false;
 const u=norm(x.unit),want=norm(unit);
 return want==='kg'?(u==='kg'||u==='g'):want==='ml'?(u==='ml'||u==='litro'||u==='l'):(u==='unidad'||u==='unidades');
}
function unitPrice(name,unit,asOf){
 const matches=expenses.filter(x=>x.spent_on<=asOf&&matchingPurchase(x,name,unit)&&Number(x.quantity)>0).sort((a,b)=>b.spent_on.localeCompare(a.spent_on)||b.created_at.localeCompare(a.created_at));
 if(!matches.length)return null;
 const x=matches[0],u=norm(x.unit),mult=unit==='kg'&&u==='g'?0.001:unit==='ml'&&(u==='litro'||u==='l')?1000:1;
 return {price:Number(x.total)/(Number(x.quantity)*mult),date:x.spent_on};
}
function estimate(){
 const date=$('hDate').value||today(),pots=numeric('hPots'),sugar=numeric('hSugar'),glucose=numeric('hGlucose');
 let total=0,details=[],missing=[];
 const items=[['Azúcar',sugar,'kg'],['Glucosa',glucose,'ml'],...recipe.map(([n,q,u])=>[n,q*pots,u])];
 items.forEach(([n,q,u])=>{const p=unitPrice(n,u,date);if(p){const cost=p.price*q;total+=cost;details.push(n+': '+money(cost))}else missing.push(n)});
 $('hAutoCost').textContent=money(total);
 $('hCostBreakdown').textContent=(details.length?'Precios aplicados: '+details.join(' · ')+'. ':'')+(missing.length?'Sin precio registrado: '+missing.join(', ')+'.':'');
 $('hCostWarning').textContent=missing.length?'Costo parcial: faltan '+missing.length+' ingredientes. Puedes añadir el costo faltante en el campo manual.':'Costo calculado con los últimos precios de compra disponibles hasta la fecha de elaboración.';
 $('hIngredientCost').value=total.toFixed(2);
}
function dateReport(){
 const from=$('costFrom').value,to=$('costTo').value;
 if(!to){$('costDateResult').textContent='Selecciona una fecha de corte.';return}
 if(from&&from>to){$('costDateResult').textContent='La fecha inicial no puede superar la fecha final.';return}
 const rows=expenses.filter(x=>x.spent_on<=to&&(!from||x.spent_on>=from)),sum=rows.reduce((s,x)=>s+Number(x.total),0);
 $('costDateResult').innerHTML='<strong>'+money(sum)+'</strong> · '+rows.length+' gastos registrados '+(from?'del '+esc(from)+' al ':'hasta ')+esc(to)+'.<br><small>Incluye compras y otros gastos. No vuelve a sumar el costo de las ollas.</small>';
}

function render(){
 const month=$('costMonth').value||today().slice(0,7),es=expenses.filter(x=>x.spent_on.startsWith(month)),bs=batches.filter(x=>x.made_on.startsWith(month));
 dateReport();
 const total=es.reduce((a,x)=>a+Number(x.total),0), byCat={};es.forEach(x=>byCat[x.category]=(byCat[x.category]||0)+Number(x.total));
 $('costSummary').innerHTML='<div class="costKpi"><span>Gastos del mes</span><b>'+money(total)+'</b></div><div class="costKpi"><span>Ollas registradas</span><b>'+bs.reduce((a,x)=>a+Number(x.pots),0).toFixed(1)+'</b></div><div class="costKpi"><span>Miel producida</span><b>'+bs.reduce((a,x)=>a+Number(x.output_liters),0).toFixed(2)+' L</b></div><p class="hint">Costos por categoría: '+(Object.entries(byCat).map(([k,v])=>esc(k)+': '+money(v)).join(' · ')||'Sin gastos registrados')+'</p>';
 $('expenseList').innerHTML=es.length?es.map(x=>'<div class="costRecord"><div><b>'+esc(x.item)+'</b><small>'+esc(x.spent_on)+' · '+esc(x.category)+' · '+esc(x.quantity)+' '+esc(x.unit)+(x.supplier?' · '+esc(x.supplier):'')+'</small></div><b>'+money(x.total)+'</b>'+(role==='admin'?'<button type="button" data-cost-del="expense" data-id="'+x.id+'">Eliminar</button>':'')+'</div>').join(''):'<p class="hint">Aún no hay gastos este mes.</p>';
 $('batchList').innerHTML=bs.length?bs.map(x=>'<div class="costRecord"><div><b>'+esc(x.made_on)+' · '+Number(x.pots)+' olla(s)</b><small>'+Number(x.juice_liters)+' L jugo · '+Number(x.sugar_kg)+' kg azúcar · '+Number(x.glucose_ml)+' ml glucosa · '+Number(x.output_liters)+' L miel</small><small>Costo declarado: '+money(Number(x.ingredient_cost)+Number(x.other_cost))+' · '+money((Number(x.ingredient_cost)+Number(x.other_cost))/Number(x.output_liters))+'/L</small></div>'+(role==='admin'?'<button type="button" data-cost-del="honey" data-id="'+x.id+'">Eliminar</button>':'')+'</div>').join(''):'<p class="hint">Aún no hay ollas registradas este mes.</p>';
}
function calc(){const pots=numeric('hPots'),juice=numeric('hJuice');$('hSugar').value=(juice*1.25).toFixed(3);$('hGlucose').value=(pots*100).toFixed(0);$('hOutput').value=(pots*7.5).toFixed(2);estimate()}
document.addEventListener('DOMContentLoaded',()=>{
 $('costMonth').value=today().slice(0,7);$('costTo').value=today();$('costFrom').value='';$('eDate').value=today();$('hDate').value=today();
 $('costMonth').addEventListener('change',render);
 ['costFrom','costTo'].forEach(id=>$(id).addEventListener('change',dateReport));
 ['hDate','hSugar','hGlucose'].forEach(id=>$(id).addEventListener('change',estimate));
 ['hPots','hJuice'].forEach(id=>$(id).addEventListener('input',calc));calc();
 document.querySelectorAll('nav button[data-v="costs"]').forEach(b=>b.addEventListener('click',()=>load()));
 $('refreshCosts').onclick=load;
 $('expenseForm').onsubmit=async ev=>{ev.preventDefault();try{await getSession();const row={business_id:bid,created_by:uid,spent_on:$('eDate').value,category:$('eCategory').value,item:$('eItem').value.trim(),quantity:numeric('eQty'),unit:$('eUnit').value,total:numeric('eTotal'),supplier:$('eSupplier').value.trim(),notes:$('eNotes').value.trim()};if(!row.item||row.quantity<=0||row.total<0)throw Error('Revisa los datos del gasto.');const {error}=await turCloud.from('business_expenses').insert(row);if(error)throw error;$('expenseForm').reset();$('eDate').value=today();await load();notice('Gasto guardado correctamente.')}catch(e){notice(e.message,true)}};
 $('honeyForm').onsubmit=async ev=>{ev.preventDefault();try{await getSession();const row={business_id:bid,created_by:uid,made_on:$('hDate').value,pots:numeric('hPots'),juice_liters:numeric('hJuice'),sugar_kg:numeric('hSugar'),glucose_ml:numeric('hGlucose'),output_liters:numeric('hOutput'),ingredient_cost:numeric('hIngredientCost'),other_cost:numeric('hOtherCost'),notes:$('hNotes').value.trim()};if(row.pots<=0||row.output_liters<=0||row.sugar_kg<0||row.glucose_ml<0)throw Error('Revisa las cantidades de miel.');const {error}=await turCloud.from('honey_batches').insert(row);if(error)throw error;$('honeyForm').reset();$('hDate').value=today();$('hPots').value='1';$('hJuice').value='7.4';calc();await load();notice('Olla de miel guardada correctamente.')}catch(e){notice(e.message,true)}};
 $('costs').addEventListener('click',async ev=>{const btn=ev.target.closest('[data-cost-del]');if(!btn||role!=='admin')return;if(!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.'))return;try{await getSession();if(role!=='admin')throw Error('Solo administrador.');const table=btn.dataset.costDel==='expense'?'business_expenses':'honey_batches';const {error}=await turCloud.from(table).delete().eq('id',btn.dataset.id).eq('business_id',bid);if(error)throw error;await load();notice('Registro eliminado.')}catch(e){notice(e.message,true)}});
});
})();
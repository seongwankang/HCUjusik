import {PRODUCTION_EFFECTS} from '../client/production-effects.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={factory:'공장',equipment:'생산 설비',research:'R&D센터'};
export function revenueEffectBadges(effects=[]){
 return effects.filter(e=>(PRODUCTION_EFFECTS[e.kind]||['revenue','efficiency'].includes(e.kind))&&Number.isFinite(PRODUCTION_EFFECTS[e.kind]?.flat?e.amount:e.percent)&&(PRODUCTION_EFFECTS[e.kind]?.flat?e.amount:e.percent)!==0).map(e=>{
  const p=PRODUCTION_EFFECTS[e.kind],value=p?.flat?e.amount:e.percent;
  const label=p?p.label+' '+(value>0?'+':'−')+Math.abs(value)+(p.flat?p.unit:'%'):(e.kind==='revenue'?'매출':(names[e.asset]||'설비')+' 효율')+' '+(e.percent>0?'+':'−')+Math.abs(e.percent)+'%';
  return `<span class="revenue-effect" data-direction="${(e.kind==='productionCost'||e.kind==='productionCostFlat'?value>0:value<0)?'down':'up'}" title="${esc('예상 영업수익에 반영 · '+label)}">${esc(label)}</span>`;
 }).join('');
}

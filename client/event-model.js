import {researchBps,staffCapacity,BOOST_LIMIT,INCOME_MULTIPLIER} from './business-policy.js';
export const ASSET_NAMES={factory:'공장',equipment:'생산 설비',research:'R&D센터'};
const keys=Object.keys(ASSET_NAMES);
const fail=s=>{throw new Error(s);};
export function productionPool(o,pending=false){
 const key=pending?'pendingProduction':'production';if(o[key])return {...o[key]};
 // Older accounts stored a total only. Preserve that total; distribute the
 // unknown historical mix by facility count, with the remainder on the last type.
 const total=pending?o.pendingRevenue:o.revenue,n=keys.reduce((s,k)=>s+o[k],0);
 if(!n)return {factory:0,equipment:0,research:total};
 const factory=Math.floor(total*o.factory/n),equipment=Math.floor(total*o.equipment/n);
 return {factory,equipment,research:total-factory-equipment};
}
export function validateEffect(e){
 if(!e||!['revenue','efficiency','destroy','none'].includes(e.kind))fail('이벤트 효과를 선택하세요.');
 const kind=e.kind,asset=kind==='efficiency'||kind==='destroy'?e.asset:'factory';
 if(!keys.includes(asset))fail('대상 설비를 선택하세요.');
 const percent=['revenue','efficiency'].includes(kind)?Number(e.percent):0;
 const count=kind==='destroy'?Number(e.count):0;
 const hours=['revenue','efficiency'].includes(kind)?Number(e.hours):0;
 if(!Number.isInteger(percent)||percent< -100||percent>500)fail('변동률은 -100~500%의 정수로 입력하세요.');
 if(!Number.isInteger(count)||count<0||count>1000||kind==='destroy'&&count<1)fail('파괴 수량은 1~1,000개로 입력하세요.');
 if(!Number.isInteger(hours)||hours<0||hours>2160||['revenue','efficiency'].includes(kind)&&hours<1)fail('기간은 1~2,160시간으로 입력하세요.');
 return {kind,asset,percent,count,hours};
}
export const needsProduction=o=>(!o.production||!o.pendingProduction)&&(o.revenue||o.pendingRevenue)>0;
export function requireProduction(o){if(needsProduction(o))fail('기존 설비의 종류별 매출을 관리자가 회사경영에서 먼저 확인·저장해야 합니다.');}
export function destruction(o,e){
 requireProduction(o);
 if(o.locked)fail('배당 정산 중입니다. 정산 완료 후 이벤트를 적용하세요.');
 const p=productionPool(o),q=productionPool(o,true),n=o[e.asset],lost=Math.min(n,e.count);
 const activeLoss=n?Math.floor(p[e.asset]*lost/n):0,pendingLoss=n?Math.floor(q[e.asset]*lost/n):0;
 p[e.asset]-=activeLoss;q[e.asset]-=pendingLoss;
 return {...(e.asset==='research'?{activeResearchBps:researchBps(o)-(n?Math.floor(researchBps(o)*lost/n):0),pendingResearchBps:(o.pendingResearchBps||0)-(n?Math.floor((o.pendingResearchBps||0)*lost/n):0)}:{}),[e.asset]:n-lost,revenue:o.revenue-activeLoss,pendingRevenue:o.pendingRevenue-pendingLoss,production:p,pendingProduction:q};
}
export function activeEffect(r,now=Date.now()){
 const at=r.effectiveAt??r.appliedAt,start=typeof at==='number'?at:at?.toMillis?.()??Date.parse(at);
 return ['revenue','efficiency'].includes(r.effect.kind)&&start<=now&&now<start+r.effect.hours*3600000;
}
export function adjustedRevenue(o,day,records=[],now=Date.now()){
 if(o.research>0)requireProduction(o);
 const p=productionPool(o),q=productionPool(o,true),mature=o.pendingDay<=day;
 // base is the stored additive pool, never the multiplied daily result.
 // Historical additive R&D entries stay in the ledger but no longer earn money.
 const base=o.revenue+(mature?o.pendingRevenue:0),facilities=base-(o.research>0?p.research+(mature?q.research:0):0);
 const employees=o.employees||0,staffPool=(o.staffRevenue||0)+(mature?(o.pendingStaffRevenue||0):0);
 const supported=Math.min(employees,staffCapacity(o)),staff=employees?Math.floor(staffPool*supported/employees):0;
 const additive=facilities+staff;
 const baseBoost=Math.min(BOOST_LIMIT,researchBps(o)+(mature?(o.pendingResearchBps||0):0));let boost=baseBoost,extra=0;
 for(const r of records)if(activeEffect(r,now)&&r.effect.kind==='efficiency'&&r.effect.asset==='research')boost+=Math.trunc(baseBoost*r.effect.percent/100);
 boost=Math.max(0,Math.min(BOOST_LIMIT,boost));
 const researchBonus=Math.floor(additive*boost/10000),enhanced=additive+researchBonus;
 for(const r of records)if(activeEffect(r,now)){
  const e=r.effect;if(e.kind==='efficiency'&&e.asset==='research')continue;
  if(e.kind==='efficiency')requireProduction(o);
  const raw=e.kind==='revenue'?enhanced:p[e.asset]+(mature?q[e.asset]:0);
  const amount=e.kind==='revenue'?raw:raw+Math.floor(raw*boost/10000);
  extra+=Math.trunc(amount*e.percent/100);
 }
 const revenue=Math.max(0,enhanced+extra)*INCOME_MULTIPLIER;if(!Number.isSafeInteger(revenue)||revenue>1e12)fail('이벤트 적용 수익 한도를 초과합니다.');
 return {base,revenue,additive,staff,supported,capacity:staffCapacity(o),researchBonus,boostBps:boost};
}
export function effectText(e){return e.kind==='destroy'?`${ASSET_NAMES[e.asset]} ${e.count}개 파괴 (영구)` : e.kind==='none'?'변화 없음':`${e.kind==='revenue'?'일매출':ASSET_NAMES[e.asset]+' 효율'} ${e.percent>0?'+':''}${e.percent}% · ${e.hours}시간`;}

import {researchBps,staffCapacity,BOOST_LIMIT,INCOME_MULTIPLIER,RESEARCH_LIMIT} from './business-policy.js';
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
export const NEW_EFFECTS=['cash','cost','workforce','grant','dividendCap'];
export const TIMED_EFFECTS=['revenue','efficiency','cost','dividendCap'];
export const ONE_TIME_EFFECTS=['destroy','cash','workforce','grant'];
export function validateEffect(e){
 if(!e||!['revenue','efficiency','destroy','none',...NEW_EFFECTS].includes(e.kind))fail('이벤트 효과를 선택하세요.');
 const kind=e.kind,usesAsset=['efficiency','destroy','cost','grant'].includes(kind),asset=usesAsset?e.asset:'factory';
 if(!(kind==='cost'?[...keys,'employee','all']:keys).includes(asset))fail('대상 설비를 선택하세요.');
 const percent=['revenue','efficiency','cost','dividendCap'].includes(kind)?Number(e.percent):0;
 const count=['destroy','workforce','grant'].includes(kind)?Number(e.count):0;
 const hours=TIMED_EFFECTS.includes(kind)?Number(e.hours):0;
 if(!Number.isInteger(percent)||percent<(kind==='cost'?-90:kind==='dividendCap'?0:-100)||percent>(kind==='cost'?300:kind==='dividendCap'?100:500))fail('변동률 범위를 확인하세요. 비용은 -90~300%, 배당 상한은 0~100%입니다.');
 if(!Number.isInteger(count)||count<(kind==='workforce'?-1000:0)||count>1000||['destroy','grant'].includes(kind)&&count<1||kind==='workforce'&&count===0)fail('수량은 1~1,000개, 인원 변화는 -1,000~1,000명(0 제외)입니다.');
 if(!Number.isInteger(hours)||hours<0||hours>2160||TIMED_EFFECTS.includes(kind)&&hours<1)fail('기간은 1~2,160시간으로 입력하세요.');
 if(kind==='cash'&&(!Number.isSafeInteger(Number(e.amount))||Math.abs(Number(e.amount))>100000000||Number(e.amount)===0))fail('지원금·손실금은 0을 제외한 ±1억 원 이내 정수로 입력하세요.');
 return {kind,asset,percent,count,hours,...(kind==='cash'?{amount:Number(e.amount)}:{})};
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
 return TIMED_EFFECTS.includes(r.effect.kind)&&start<=now&&now<start+r.effect.hours*3600000;
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
 for(const r of records)if(['revenue','efficiency'].includes(r.effect.kind)&&activeEffect(r,now)){
  const e=r.effect;if(e.kind==='efficiency'&&e.asset==='research')continue;
  if(e.kind==='efficiency')requireProduction(o);
  const raw=e.kind==='revenue'?enhanced:p[e.asset]+(mature?q[e.asset]:0);
  const amount=e.kind==='revenue'?raw:raw+Math.floor(raw*boost/10000);
  extra+=Math.trunc(amount*e.percent/100);
 }
 const revenue=Math.max(0,enhanced+extra)*INCOME_MULTIPLIER;if(!Number.isSafeInteger(revenue)||revenue>1e12)fail('이벤트 적용 수익 한도를 초과합니다.');
 return {base,revenue,additive,staff,supported,capacity:staffCapacity(o),researchBonus,boostBps:boost};
}
export function effectText(input,result){
 const e={...input,...(result&&input.kind==='cash'?{amount:result.amount}:{}),...(result&&['workforce','grant'].includes(input.kind)?{count:result.count}:{})};
 const names={...ASSET_NAMES,employee:'직원 채용',all:'전체 투자'},sign=n=>n>0?'+'+n:String(n);
 if(e.kind==='cash')return '회사 자금 '+sign(e.amount).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'원 · 일회성';
 if(e.kind==='cost')return names[e.asset]+' 비용 '+sign(e.percent)+'% · '+e.hours+'시간';
 if(e.kind==='workforce')return e.count===0?'직원 변화 없음 (정원·재직 인원 기준)':e.count>0?'직원 '+e.count+'명 무상 충원 (정원 이내)':'직원 '+(-e.count)+'명 이탈';
 if(e.kind==='grant')return ASSET_NAMES[e.asset]+' '+e.count+'개 무상 지급';
 if(e.kind==='dividendCap')return '배당률 상한 '+e.percent+'% · '+e.hours+'시간';
 return e.kind==='destroy'?ASSET_NAMES[e.asset]+' '+e.count+'개 파괴 (영구)':e.kind==='none'?'변화 없음':(e.kind==='revenue'?'일매출':ASSET_NAMES[e.asset]+' 효율')+' '+sign(e.percent)+'% · '+e.hours+'시간';
}
const termActive=(t,now)=>!!t&&t.startsAt<=now&&now<t.endsAt;
export function investmentCost(o,config,asset,now=Date.now()){
 const base=config[asset+'Cost'],term=o.costEvents?.[asset],percent=termActive(term,now)?term.percent:0;
 return Math.max(1,Math.ceil(base*(100+percent)/100));
}
export function effectiveDividendBps(o,now=Date.now()){
 return termActive(o.dividendLimit,now)?Math.min(o.dividendBps,o.dividendLimit.percent*100):o.dividendBps;
}
export function currentEffect(o,r,now=Date.now()){
 if(!activeEffect(r,now))return false;
 if(r.effect.kind==='cost')return Object.values(o.costEvents||{}).some(t=>t.eventId===r.id&&termActive(t,now));
 if(r.effect.kind==='dividendCap')return o.dividendLimit?.eventId===r.id&&termActive(o.dividendLimit,now);
 return true;
}
// One receipt and the company update commit together. Stored yields never compound.
export function eventMutation(o,input,{config,book,effectiveAt,eventId}){
 const e=validateEffect(input);
 if(o.locked)fail('배당 정산 완료 후 이벤트를 적용하세요.');
 if(e.kind==='destroy')return destruction(o,e);
 if(e.kind==='cash'){
  const funds=o.cash+(book?.issuerCash||0)-o.receivedIssuerCash;
  if(!Number.isSafeInteger(funds)||funds<0)fail('회사 자금과 최초 주식 판매 내역을 확인하세요.');
  const cash=Math.max(0,funds+e.amount);
  if(!Number.isSafeInteger(cash)||cash>1e12)fail('회사 자금 한도를 초과합니다.');
  return {cash,receivedIssuerCash:book?.issuerCash||0};
 }
 if(e.kind==='cost'||e.kind==='dividendCap'){
  const term={eventId,percent:e.percent,startsAt:effectiveAt,endsAt:effectiveAt+e.hours*3600000};
  if(e.kind==='dividendCap')return {dividendLimit:term};
  const costs={...o.costEvents};for(const asset of ['factory','equipment','research','employee'])if(e.asset==='all'||e.asset===asset)costs[asset]=term;
  return {costEvents:costs};
 }
 if(e.kind==='workforce'){
  const n=o.employees||0,delta=e.count>0?Math.min(e.count,Math.max(0,staffCapacity(o)-n)):Math.max(e.count,-n);
  if(delta>=0){const staffRevenue=(o.staffRevenue||0)+delta*config.employeeRevenue;if(!Number.isSafeInteger(staffRevenue)||staffRevenue>1e12)fail('직원 수익 한도를 초과합니다.');return {employees:n+delta,staffRevenue};}
  const lost=-delta;
  return {employees:n-lost,staffRevenue:(o.staffRevenue||0)-Math.floor((o.staffRevenue||0)*lost/n),pendingStaffRevenue:(o.pendingStaffRevenue||0)-Math.floor((o.pendingStaffRevenue||0)*lost/n)};
 }
 if(e.kind==='grant'){
  requireProduction(o);
  const count=Math.min(e.count,Math.max(0,(e.asset==='research'?RESEARCH_LIMIT:1000)-o[e.asset]));
  if(e.asset==='research')return {research:o.research+count,activeResearchBps:researchBps(o)+Math.min(count*config.researchBoostBps,Math.max(0,BOOST_LIMIT-researchBps(o)-(o.pendingResearchBps||0)))};
  const production=productionPool(o),gain=count*config[e.asset+'Revenue'];production[e.asset]+=gain;
  const revenue=o.revenue+gain;if(revenue>1e12)fail('설비 수익 한도를 초과합니다.');
  return {[e.asset]:o[e.asset]+count,production,pendingProduction:productionPool(o,true),revenue};
 }
 return {};
}

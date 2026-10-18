import {dividendAllocation} from './dividends.js';
import {revenueEffects,adjustedRevenue,currentEffect,effectiveDividendBps,needsProduction,effectText,ONE_TIME_EFFECTS,TIMED_EFFECTS,remainingSettlements} from './event-model.js';
import {staffCapacity,researchBps} from './business-policy.js';
import {initialOperations,koreaDay} from './economy.js';
import {nextSettlement} from './settlement-time.js';

export function investorSnapshot({companyId,ops,book,account,effects=[],events=[],investments=[]},now=Date.now()){
 const o=ops||initialOperations(),day=koreaDay(now),settlement=nextSettlement(o,now),tomorrowAt=settlement.at;
 const unclassified=needsProduction(o),tomorrow=unclassified?null:adjustedRevenue(o,settlement.day,effects,tomorrowAt);
 const sold=book?book.issuedShares-book.treasuryShares:0,rate=effectiveDividendBps(o,tomorrowAt);
 const perShare=tomorrow?dividendAllocation(tomorrow.revenue,rate,book).perShare:0;
 const shares=account?.positions?.[companyId]||0;
 const timestamp=v=>typeof v==='number'?v:v?.toMillis?.()??Date.parse(v);
 const recentEvents=effects.filter(r=>[...ONE_TIME_EFFECTS,...TIMED_EFFECTS,'none'].includes(r.effect?.kind)&&Number.isFinite(timestamp(r.appliedAt))&&timestamp(r.appliedAt)<=now).sort((a,b)=>timestamp(b.appliedAt)-timestamp(a.appliedAt)||String(a.id).localeCompare(String(b.id))).slice(0,20).map(r=>({
  id:r.id,title:events.find(e=>e.id===r.id)?.title||'기업 이벤트',kind:r.effect.kind,appliedAt:timestamp(r.appliedAt),
  status:ONE_TIME_EFFECTS.includes(r.effect.kind)?'applied':r.effect.kind==='none'?'unchanged':currentEffect(o,r,now)?'active':'ended',
  ...(Number.isInteger(r.effect.settlements)&&r.effect.settlements>0?{remainingSettlements:remainingSettlements(o,r)}:{}),description:effectText(r.effect,r.effect.kind==='cash'&&Number.isSafeInteger(r.result?.amount)?{amount:r.result.amount}:['workforce','grant','destroy'].includes(r.effect.kind)&&Number.isSafeInteger(r.result?.count)?{count:r.result.count}:undefined),
 }));
 const investmentNames={factory:'공장',equipment:'생산 설비',research:'R&D센터',employee:'직원'};
 const investmentHistory=investments.filter(r=>Object.hasOwn(investmentNames,r.asset)&&Number.isSafeInteger(r.quantity)&&r.quantity>0&&r.quantity<=1000&&Number.isSafeInteger(r.cost)&&r.cost>0&&r.cost<=1e12&&Number.isSafeInteger(r.activeFromDay)&&r.activeFromDay>=0&&r.activeFromDay<=1000000&&Number.isFinite(timestamp(r.createdAt))&&timestamp(r.createdAt)<=now).map(r=>({
  id:r.id,kind:r.asset==='employee'?'hiring':'investment',appliedAt:timestamp(r.createdAt),status:r.activeFromDay*86400000>now?'pending':'applied',
  title:investmentNames[r.asset]+' '+r.quantity+(r.asset==='employee'?'명 채용':'개 건설'),
  description:'투자금 '+r.cost.toLocaleString('ko-KR')+'원 · '+new Date(r.activeFromDay*86400000).toISOString().slice(0,10)+' 오전 9시 정산부터 수익 반영',
 }));
 const recentHistory=[...recentEvents,...investmentHistory].sort((a,b)=>b.appliedAt-a.appliedAt||String(a.id).localeCompare(String(b.id))).slice(0,20);
 return {initialized:!!ops,asOf:now,settlementAt:tomorrowAt,tomorrowAt,factory:o.factory,equipment:o.equipment,research:o.research,employees:o.employees||0,capacity:staffCapacity(o),researchBps:Math.min(3000,researchBps(o)+(o.pendingResearchBps||0)),
  dividendBps:effectiveDividendBps(o,now),configuredDividendBps:o.dividendBps,tomorrowDividendBps:rate,soldShares:sold,myShares:shares,tomorrowRevenue:tomorrow?.revenue??null,perShare:tomorrow?perShare:null,myDividend:tomorrow?perShare*shares:null,
  revenueEffects:unclassified?[]:revenueEffects(o,effects,tomorrowAt),pendingEvent:!!o.pendingEvent,settling:o.locked,unclassified,recentEvents,recentHistory,
  activeEvents:effects.filter(r=>currentEffect(o,r,now)).map(r=>({id:r.id,title:events.find(e=>e.id===r.id)?.title||'기업 이벤트',effect:r.effect,...(Number.isInteger(r.effect.settlements)?{remainingSettlements:remainingSettlements(o,r)}:{endsAt:timestamp(r.effectiveAt??r.appliedAt)+r.effect.hours*3600000})})),
  damage:effects.filter(r=>r.effect.kind==='destroy').sort((a,b)=>timestamp(b.appliedAt)-timestamp(a.appliedAt)).slice(0,10).map(r=>({id:r.id,title:events.find(e=>e.id===r.id)?.title||'설비 피해',effect:r.effect})),
 };
}

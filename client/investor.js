import {adjustedRevenue,activeEffect,needsProduction} from './event-model.js';
import {staffCapacity,researchBps} from './business-policy.js';
import {initialOperations,koreaDay} from './economy.js';

export function investorSnapshot({companyId,ops,book,account,effects=[],events=[]},now=Date.now()){
 const o=ops||initialOperations(),day=koreaDay(now),tomorrowAt=(day+1)*86400000;
 const unclassified=needsProduction(o),tomorrow=unclassified?null:adjustedRevenue(o,day+1,effects,tomorrowAt);
 const sold=book?book.issuedShares-book.treasuryShares:0,rate=o.dividendBps;
 const perShare=tomorrow&&sold>0?Number(BigInt(tomorrow.revenue)*BigInt(rate)/10000n/BigInt(sold)):0;
 const shares=account?.positions?.[companyId]||0;
 const timestamp=v=>typeof v==='number'?v:v?.toMillis?.()??Date.parse(v);
 return {initialized:!!ops,asOf:now,tomorrowAt,factory:o.factory,equipment:o.equipment,research:o.research,employees:o.employees||0,capacity:staffCapacity(o),researchBps:Math.min(3000,researchBps(o)+(o.pendingResearchBps||0)),
  dividendBps:rate,soldShares:sold,myShares:shares,tomorrowRevenue:tomorrow?.revenue??null,perShare:tomorrow?perShare:null,myDividend:tomorrow?perShare*shares:null,
  pendingEvent:!!o.pendingEvent,settling:o.locked,unclassified,
  activeEvents:effects.filter(r=>activeEffect(r,now)).map(r=>({id:r.id,title:events.find(e=>e.id===r.id)?.title||'기업 이벤트',effect:r.effect,endsAt:timestamp(r.effectiveAt??r.appliedAt)+r.effect.hours*3600000})),
  damage:effects.filter(r=>r.effect.kind==='destroy').sort((a,b)=>timestamp(b.appliedAt)-timestamp(a.appliedAt)).slice(0,10).map(r=>({id:r.id,title:events.find(e=>e.id===r.id)?.title||'설비 피해',effect:r.effect})),
 };
}

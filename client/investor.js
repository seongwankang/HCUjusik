import {managementHistory} from './management-history.js';
import {dividendAllocation} from './dividends.js';
import {revenueEffects,adjustedRevenue,currentEffect,effectiveDividendBps,needsProduction,effectText,ONE_TIME_EFFECTS,TIMED_EFFECTS,remainingSettlements} from './event-model.js';
import {staffCapacity,researchBps} from './business-policy.js';
import {initialOperations,koreaDay,availableFunds} from './economy.js';
import {nextSettlement,settlementTime} from './settlement-time.js';

export function investorSnapshot({companyId,ops,book,account,effects=[],events=[],investments=[],dividendContext},now=Date.now()){
 const o=ops||initialOperations(),day=koreaDay(now),settlement=nextSettlement(o,now),tomorrowAt=settlement.at;
 const unclassified=needsProduction(o),tomorrow=unclassified?null:adjustedRevenue(o,settlement.day,effects,tomorrowAt);
 const sold=book?book.issuedShares-book.treasuryShares:0,rate=effectiveDividendBps(o,tomorrowAt);
 const dividendPending=o.dividendModel==='rank-v1'&&(!dividendContext||!book),allocation=tomorrow&&!dividendPending&&book?dividendAllocation(tomorrow.revenue,rate,book,dividendContext):null,perShare=allocation?.perShare??0;
 const shares=account?.positions?.[companyId]||0;
 const funds=book?availableFunds(o,book):ops?null:0;
 const {recentEvents,recentHistory}=managementHistory({ops:o,effects,events,investments},now);
 const timestamp=v=>typeof v==='number'?v:v?.toMillis?.()??Date.parse(v);
 return {productionModel:o.productionModel||'legacy',dividendModel:o.dividendModel||'legacy',dividendRank:dividendContext?.rank??null,dividendBase:allocation?.rankBase??null,dividendPending,companyDividendCharge:allocation?.companyCharge??null,initialized:!!ops,asOf:now,settlementAt:tomorrowAt,tomorrowAt,factory:o.factory,equipment:o.equipment,research:o.research,employees:o.employees||0,capacity:staffCapacity(o),researchBps:Math.min(3000,researchBps(o)+(o.pendingResearchBps||0)),
  salePrice:tomorrow?.salePrice??null,productionCost:tomorrow?.productionCost??null,productionPower:tomorrow?.productionPower??null,companyCash:Number.isSafeInteger(funds)?funds:null,dividendBps:effectiveDividendBps(o,now),configuredDividendBps:Math.max(100,o.dividendBps??100),tomorrowDividendBps:rate,soldShares:sold,myShares:shares,tomorrowRevenue:tomorrow?.revenue??null,perShare:tomorrow&&!dividendPending?perShare:null,myDividend:tomorrow&&!dividendPending?perShare*shares:null,
  revenueEffects:unclassified?[]:revenueEffects(o,effects,tomorrowAt),pendingEvent:!!o.pendingEvent,settling:o.locked,unclassified,recentEvents,recentHistory,
  activeEvents:effects.filter(r=>currentEffect(o,r,now)).map(r=>({id:r.id,title:events.find(e=>e.id===(r.eventId||r.id))?.title||'기업 이벤트',effect:r.effect,...(Number.isInteger(r.effect.settlements)?{remainingSettlements:remainingSettlements(o,r)}:{endsAt:timestamp(r.effectiveAt??r.appliedAt)+r.effect.hours*3600000})})),
  damage:effects.filter(r=>r.effect.kind==='destroy').sort((a,b)=>timestamp(b.appliedAt)-timestamp(a.appliedAt)).slice(0,10).map(r=>({id:r.id,title:events.find(e=>e.id===(r.eventId||r.id))?.title||'설비 피해',effect:r.effect})),
 };
}

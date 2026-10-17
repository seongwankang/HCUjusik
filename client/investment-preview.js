import {effectiveConfig,researchBps,staffCapacity,RESEARCH_LIMIT,INCOME_MULTIPLIER} from './business-policy.js';
import {adjustedRevenue,productionPool} from './event-model.js';
export function previewPurchase(o,input,asset,day){
 const c=effectiveConfig(input),next={...o,production:productionPool(o),pendingProduction:productionPool(o,true),activeResearchBps:researchBps(o)};
 if(['factory','equipment'].includes(asset)){next[asset]++;next.pendingRevenue+=c[asset+'Revenue'];next.pendingProduction[asset]+=c[asset+'Revenue'];}
 if(asset==='research'){next.research++;next.pendingResearchBps=(o.pendingResearchBps||0)+c.researchBoostBps;}
 if(asset==='employee'){next.employees=(o.employees||0)+1;next.pendingStaffRevenue=(o.pendingStaffRevenue||0)+c.employeeRevenue;}
 next.pendingDay=day+1;
 const before=adjustedRevenue(o,day+1).revenue,after=adjustedRevenue(next,day+1).revenue,gain=after-before;
 return {before,after,gain,payback:gain>0?Math.round(c[asset+'Cost']/gain*10)/10:null,
  allowed:asset==='employee'?(o.employees||0)<staffCapacity(o):asset!=='research'||o.research<RESEARCH_LIMIT&&researchBps(o)+(o.pendingResearchBps||0)<3000};
}
export function startupExample(input){
 const c=effectiveConfig(input),cost=2*c.factoryCost+3*c.equipmentCost+25*c.employeeCost+c.researchCost;
 const additive=2*c.factoryRevenue+3*c.equipmentRevenue+25*c.employeeRevenue;
 const revenue=(additive+Math.floor(additive*Math.min(3000,c.researchBoostBps)/10000))*INCOME_MULTIPLIER;
 return {cost,remaining:10000000-cost,additive,revenue,perShareAtHalf:Math.floor(revenue/2/1000)};
}

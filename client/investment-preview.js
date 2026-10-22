import {UNITS_MODEL,unitPurchase} from './production-units.js';
import {effectiveConfig,researchBps,staffCapacity,RESEARCH_LIMIT} from './business-policy.js';
import {adjustedRevenue,productionPool,investmentCost} from './event-model.js';
export function previewPurchase(o,input,asset,day,activeDay=day+1){
 if(o.productionModel===UNITS_MODEL){
  let next;try{next={...o,...unitPurchase(o,asset,activeDay)};}catch{return {before:adjustedRevenue(o,activeDay).revenue,after:0,gain:0,payback:null,allowed:false};}
  const before=adjustedRevenue(o,activeDay).revenue,after=adjustedRevenue(next,activeDay).revenue,gain=after-before;
  return {before,after,gain,payback:gain>0?Math.round(investmentCost(o,effectiveConfig(input),asset)/gain*10)/10:null,allowed:true};
 }
 const c=effectiveConfig(input),next={...o,production:productionPool(o),pendingProduction:productionPool(o,true),activeResearchBps:researchBps(o)};
 if(['factory','equipment'].includes(asset)){next[asset]++;next.pendingRevenue+=c[asset+'Revenue'];next.pendingProduction[asset]+=c[asset+'Revenue'];}
 if(asset==='research'){next.research++;next.pendingResearchBps=(o.pendingResearchBps||0)+c.researchBoostBps;}
 if(asset==='employee'){next.employees=(o.employees||0)+1;next.pendingStaffRevenue=(o.pendingStaffRevenue||0)+c.employeeRevenue;}
 next.pendingDay=activeDay;
 const before=adjustedRevenue(o,activeDay).revenue,after=adjustedRevenue(next,activeDay).revenue,gain=after-before;
 return {before,after,gain,payback:gain>0?Math.round(investmentCost(o,c,asset)/gain*10)/10:null,
  allowed:asset==='employee'?(o.employees||0)<staffCapacity(o):asset!=='research'||o.research<RESEARCH_LIMIT&&researchBps(o)+(o.pendingResearchBps||0)<3000};
}
export function startupExample(input){
 const c=effectiveConfig(input),cost=7*c.factoryCost+3*c.equipmentCost+6*c.researchCost;
 const o={factory:7,equipment:3,research:6,employees:0,revenue:7*c.factoryRevenue+3*c.equipmentRevenue,pendingRevenue:0,pendingDay:0,production:{factory:7*c.factoryRevenue,equipment:3*c.equipmentRevenue,research:0},pendingProduction:{factory:0,equipment:0,research:0},activeResearchBps:6*c.researchBoostBps};
 const p=adjustedRevenue(o,1);
 return {cost,remaining:20000000-cost,revenue:p.revenue,salePrice:p.salePrice,productionCost:p.productionCost,productionPower:p.productionPower,perShareAtHalf:Math.floor(p.revenue/2/1000)};
}

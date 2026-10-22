import {UNITS_MODEL,unitsEconomy} from './production-units.js';
// Ledger values remain compatible with the existing atomic investment rules.
// They encode capacity/technology, rather than additive money income.
export const PRODUCTION_POLICY={salePrice:1000,productionCost:600,minCost:300,factoryUnits:1500,equipmentDiscount:75,employeeUnits:50};
export function productionEconomy(o,day,records,active,pool,research,capacity){
 if(o.productionModel===UNITS_MODEL)return unitsEconomy(o,day,records,active);
 const mature=o.pendingDay<=day,p=pool(o),q=pool(o,true),c=PRODUCTION_POLICY;
 const units=k=>Math.max(0,p[k]+(mature?q[k]:0));
 let factories=units('factory')/440000,equipment=units('equipment')/200000;
 let boost=Math.min(3000,research(o)+(mature?(o.pendingResearchBps||0):0));
 const baseBoost=boost;
 for(const r of records)if(active(r)&&r.effect.kind==='efficiency'){
  const e=r.effect,factor=e.percent/100;
  if(e.asset==='factory')factories+=units('factory')/440000*factor;
  if(e.asset==='equipment')equipment+=units('equipment')/200000*factor;
  if(e.asset==='research')boost+=Math.trunc(baseBoost*factor);
 }
 boost=Math.max(0,Math.min(3000,boost));
 const employees=o.employees||0,supported=Math.min(employees,capacity(o));
 const staffPool=(o.staffRevenue||0)+(mature?(o.pendingStaffRevenue||0):0);
 const staff=employees?staffPool/20000*supported/employees:0;
 const salePrice=c.salePrice+Math.floor(c.salePrice*boost/10000);
 const productionCost=Math.max(c.minCost,c.productionCost-Math.floor(Math.max(0,equipment)*c.equipmentDiscount));
 const productionPower=Math.floor(Math.max(0,factories)*c.factoryUnits+staff*c.employeeUnits);
 const operatingIncome=(salePrice-productionCost)*productionPower;
 let percent=0;for(const r of records)if(active(r)&&r.effect.kind==='revenue')percent+=r.effect.percent;
 const revenue=Math.max(0,operatingIncome+Math.trunc(operatingIncome*percent/100));
 if(!Number.isSafeInteger(revenue)||revenue>1e12)throw Error('이벤트 적용 수익 한도를 초과합니다.');
 return {base:o.revenue+(mature?o.pendingRevenue:0),revenue,salePrice,productionCost,productionPower,operatingIncome,boostBps:boost,supported,capacity:capacity(o)};
}

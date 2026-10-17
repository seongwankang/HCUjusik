// Fictional classroom economy: daily contributions are net of routine costs.
// Keep the fallback policy identical to economyPolicy() in firestore.rules.
export const DEFAULT_CONFIG={version:4,factoryCost:2000000,factoryRevenue:400000,equipmentCost:1000000,equipmentRevenue:200000,researchCost:500000,researchBoostBps:500,employeeCost:100000,employeeRevenue:20000};
export const BASE_CAPACITY=10,FACTORY_CAPACITY=25,EQUIPMENT_CAPACITY=10;
// Apply once to the computed operating income, never to stored production pools.
export const INCOME_MULTIPLIER=2;
export const RESEARCH_LIMIT=6,BOOST_LIMIT=3000;
export const staffCapacity=o=>Math.min(1000,BASE_CAPACITY+o.factory*FACTORY_CAPACITY+o.equipment*EQUIPMENT_CAPACITY);
export const researchBps=o=>o.activeResearchBps??Math.min(o.research,RESEARCH_LIMIT)*500;
export const hasPending=o=>o.pendingRevenue+(o.pendingStaffRevenue||0)+(o.pendingResearchBps||0)>0;
export function validateConfig(c){
 const result={version:4};for(const key of Object.keys(DEFAULT_CONFIG).filter(k=>k!=='version')){
  const n=c[key],max=key==='researchBoostBps'?1000:100000000;
  if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error(key==='researchBoostBps'?'R&D 증가율은 0.01~10%로 입력하세요.':'가격과 일수익은 1~1억 원의 정수로 입력하세요.');result[key]=n;
 }return result;
}
export const effectiveConfig=c=>c?.version===4?validateConfig(c):{...DEFAULT_CONFIG};

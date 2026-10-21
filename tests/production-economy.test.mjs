import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialOperations,dayPlan} from '../client/economy.js';
import {adjustedRevenue,destruction} from '../client/event-model.js';
import {DEFAULT_CONFIG as c,staffCapacity} from '../client/business-policy.js';
import {previewPurchase} from '../client/investment-preview.js';
const zero=()=>({factory:0,equipment:0,research:0});
const company=(f,e,r,n)=>({...initialOperations(),factory:f,equipment:e,research:r,employees:n,revenue:f*c.factoryRevenue+e*c.equipmentRevenue,production:{factory:f*c.factoryRevenue,equipment:e*c.equipmentRevenue,research:0},pendingProduction:zero(),activeResearchBps:r*c.researchBoostBps,staffRevenue:n*c.employeeRevenue});
test('every affordable first-day mix stays below 50% of invested capital; exact best is 9,712,500 on 20m',()=>{
 let maximum=0,best;
 for(let f=0;f<=10;f++)for(let e=0;e<=20;e++)for(let r=0;r<=6;r++){
  const fixed=f*c.factoryCost+e*c.equipmentCost+r*c.researchCost;
  if(fixed>20000000)continue;
  const maxStaff=Math.min(staffCapacity({factory:f,equipment:e}),Math.floor((20000000-fixed)/c.employeeCost));
  for(let n=0;n<=maxStaff;n++){
   const cost=fixed+n*c.employeeCost,p=adjustedRevenue(company(f,e,r,n),100000);
   assert.ok(p.revenue<=cost/2,JSON.stringify({f,e,r,n,cost,revenue:p.revenue}));
   if(p.revenue>maximum){maximum=p.revenue;best={f,e,r,n};}
  }
 }
 assert.equal(maximum,9712500);assert.deepEqual(best,{f:7,e:3,r:6,n:0});
});
test('facilities modify distinct factors; no doubled or additive revenue; pending investment activates once',()=>{
 const o=company(1,1,1,2),p=adjustedRevenue(o,100);
 assert.equal(p.salePrice,1050);assert.equal(p.productionCost,525);assert.equal(p.productionPower,1600);assert.equal(p.revenue,840000);
 for(const asset of ['factory','equipment','research','employee'])assert.ok(previewPurchase(o,c,asset,100).gain>0);
 const pending={...o,production:zero(),pendingProduction:o.production,revenue:0,pendingRevenue:o.revenue,staffRevenue:0,pendingStaffRevenue:o.staffRevenue,activeResearchBps:0,pendingResearchBps:500,pendingDay:101};
 assert.equal(adjustedRevenue(pending,100).revenue,0);assert.equal(adjustedRevenue(pending,101).revenue,p.revenue);
 assert.equal(adjustedRevenue({...o,revenue:99999999},102).revenue,p.revenue);
 assert.equal(dayPlan(o,{issuerCash:10000000,issuedShares:1000,treasuryShares:0},100).revenue,p.revenue);
});
test('equipment has a cost floor, research has a price ceiling, events expire and destruction removes actual capacity',()=>{
 const o=company(1,20,6,2),p=adjustedRevenue(o,100);
 assert.equal(p.productionCost,300);assert.equal(p.salePrice,1300);
 const r={effect:{kind:'revenue',percent:-20,settlements:1},startsAfterSettlement:0,appliedAt:0};
 assert.equal(adjustedRevenue(o,100,[r],1000).revenue,p.revenue*.8);
 assert.equal(adjustedRevenue({...o,settlementCount:1},100,[r],1000).revenue,p.revenue);
 const broken={...o,...destruction(o,{kind:'destroy',asset:'factory',count:99})};
 assert.equal(broken.factory,0);assert.equal(adjustedRevenue(broken,100).productionPower,100);
 assert.equal(adjustedRevenue({...o,activeResearchBps:100000},100).salePrice,1300);
});

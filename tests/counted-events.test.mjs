import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateEffect,eventMutation,currentEffect,remainingSettlements,adjustedRevenue,investmentCost,effectiveDividendBps,effectText} from '../client/event-model.js';
import {initialOperations,dayPlan} from '../client/economy.js';import {DEFAULT_CONFIG} from '../client/business-policy.js';
const now=Date.parse('2026-10-18T03:00:00Z'),base=()=>({...initialOperations(),factory:1,revenue:10000,dividendBps:5000,settlementCount:5,production:{factory:10000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});
const receipt=(effect,start=5)=>({id:'count-event',effect:validateEffect(effect),startsAfterSettlement:start,effectiveAt:now,appliedAt:now});
test('counted revenue lasts exactly N actual settlements, regardless of elapsed calendar days',()=>{
 const r=receipt({kind:'revenue',percent:-50,settlements:2});
 for(const count of [5,6,7]){const o={...base(),settlementCount:count};assert.equal(remainingSettlements(o,r),Math.max(0,7-count));assert.equal(adjustedRevenue(o,100000,[r],now+100*86400000).revenue,count<7?10000:20000);}
 assert.equal(currentEffect(base(),r,now-1),false);assert.equal(remainingSettlements({...base(),settlementCount:0},receipt({kind:'revenue',percent:-50,settlements:2},0)),2);
});
test('counted efficiency includes R&D, costs and dividend caps expire at same company count',()=>{
 const o=base(),context={config:DEFAULT_CONFIG,eventId:'count-event',effectiveAt:now};
 const cost=receipt({kind:'cost',asset:'all',percent:-20,settlements:1});const discounted={...o,...eventMutation(o,cost.effect,context)};
 assert.equal(investmentCost(discounted,DEFAULT_CONFIG,'factory',now),1600000);assert.equal(investmentCost({...discounted,settlementCount:6},DEFAULT_CONFIG,'factory',now),2000000);
 assert.equal(currentEffect(discounted,cost,now),true);assert.equal(currentEffect({...discounted,settlementCount:6},cost,now),false);
 const cap=eventMutation(o,{kind:'dividendCap',percent:20,settlements:2},context),capped={...o,...cap};assert.equal(effectiveDividendBps(capped,now),2000);assert.equal(effectiveDividendBps({...capped,settlementCount:7},now),5000);
 const rd={...o,research:1,activeResearchBps:500};const effect=receipt({kind:'efficiency',asset:'research',percent:100,settlements:1});assert.equal(adjustedRevenue(rd,100000,[effect],now).revenue,22000);assert.equal(adjustedRevenue({...rd,settlementCount:6},100000,[effect],now).revenue,21000);
});
test('count validation, company isolation, legacy records and permanent changes remain supported',()=>{
 for(const n of [0,-1,1.5,366,NaN])assert.throws(()=>validateEffect({kind:'revenue',percent:10,settlements:n}));
 const r=receipt({kind:'revenue',percent:10,settlements:3});assert.match(effectText(r.effect),/정산 3회/);assert.equal(Object.hasOwn(r.effect,'hours'),false);
 assert.equal(currentEffect({...base(),settlementCount:8},r,now),false);assert.equal(currentEffect(base(),r,now),true);
 const legacy={id:'legacy',effect:validateEffect({kind:'revenue',percent:10,hours:1}),effectiveAt:now};assert.equal(currentEffect(base(),legacy,now+3600000),false);
 assert.equal(eventMutation(base(),{kind:'destroy',asset:'factory',count:1,settlements:0},{}).factory,0);
});

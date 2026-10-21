import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialOperations,dayPlan,koreaDay,validateConfig,DEFAULT_CONFIG,availableFunds} from '../client/economy.js';
test('Korean calendar day and next-day activation, no unearned purchase-day revenue',()=>{
 const day=koreaDay(Date.parse('2026-10-15T14:59:59Z'));assert.equal(koreaDay(Date.parse('2026-10-15T15:00:00Z')),day+1);
 const o={...initialOperations(),factory:1,production:{factory:0,equipment:0,research:0},pendingProduction:{factory:440000,equipment:0,research:0},pendingRevenue:440000,pendingDay:day+1,dividendBps:5000},b={issuerCash:100000,issuedShares:10,treasuryShares:4};
 assert.equal(dayPlan(o,b,day).revenue,0);const p=dayPlan(o,b,day+1);assert.equal(p.perShare,30000);assert.equal(p.dividend,180000);assert.equal(p.retained,420000);assert.equal(p.cash,520000);
 assert.equal(p.dividend+p.retained,600000);
});
test('issuer funding is collected once; no shareholders means all revenue retained; invalid dates blocked',()=>{
 const o={...initialOperations(),cash:10,receivedIssuerCash:100,factory:1,production:{factory:440000,equipment:0,research:0},revenue:440000,dividendBps:10000},b={issuerCash:200,issuedShares:10,treasuryShares:10};
 assert.equal(availableFunds(o,b),110);assert.equal(dayPlan(o,b,10).cash,600110);assert.equal(dayPlan(o,b,10).dividend,0);
 assert.throws(()=>dayPlan({...o,lastSettledDay:10},b,10));assert.throws(()=>dayPlan({...o,locked:true},b,10));
 assert.deepEqual(validateConfig(DEFAULT_CONFIG),DEFAULT_CONFIG);assert.throws(()=>validateConfig({...DEFAULT_CONFIG,factoryCost:0}));
});

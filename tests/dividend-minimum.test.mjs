import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialOperations,dayPlan} from '../client/economy.js';
import {effectiveDividendBps} from '../client/event-model.js';

test('new companies start with a 1% dividend rate',()=>{
 assert.equal(initialOperations().dividendBps,100);
});
test('legacy 0% companies receive at least 1% in settlement',()=>{
 const ops={...initialOperations(),factory:1,production:{factory:440000,equipment:0,research:0},revenue:440000,dividendBps:0};
 const plan=dayPlan(ops,{issuerCash:0,issuedShares:100,treasuryShares:0},1);
 assert.equal(plan.rateBps,100);
 assert.equal(plan.revenue,600000);
 assert.equal(plan.perShare,60);
 assert.equal(plan.dividend,6000);
});
test('active dividend caps cannot reduce the effective rate below 1%',()=>{
 const now=Date.parse('2026-10-21T12:00:00+09:00');
 const ops={...initialOperations(),dividendBps:5000,dividendLimit:{percent:0,startsAt:now-1000,endsAt:now+1000}};
 assert.equal(effectiveDividendBps(ops,now),100);
 assert.equal(effectiveDividendBps({...ops,dividendLimit:{...ops.dividendLimit,percent:20}},now),2000);
 assert.equal(effectiveDividendBps({...ops,dividendBps:0},now),100);
});

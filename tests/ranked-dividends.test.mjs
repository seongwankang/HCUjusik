import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankedRevenue,rankAllocation} from '../client/ranked-dividends.js';
import {dayPlan,initialOperations} from '../client/economy.js';
test('22 descending revenues yield 150 to 45 in five-won steps; equal revenues share competition ranks',()=>{
 const rows=rankedRevenue(Array.from({length:22},(_,i)=>({id:'c'+i,revenue:22-i})));
 assert.deepEqual(rows.map(r=>r.rankBase),Array.from({length:22},(_,i)=>150-i*5));
 assert.deepEqual(rankedRevenue([{id:'a',revenue:20},{id:'b',revenue:20},{id:'c',revenue:10}]).map(r=>[r.rank,r.rankBase]),[[1,150],[1,150],[3,140]]);
});
test('2250 is paid per share; a 15% revenue charge is independent of investor payouts and unsold shares',()=>{
 const context={model:'rank-v1',rank:1,revenue:4000000,rateBps:1500},book={issuedShares:1000,treasuryShares:400,issuerCash:0};
 const p=rankAllocation(4000000,1500,book,context);assert.equal(p.perShare,2250);assert.equal(p.dividend,1350000);assert.equal(p.companyCharge,600000);assert.equal(p.treasuryDividend,0);
 const ops={...initialOperations(),dividendModel:'rank-v1',cash:10000000,dividendBps:3000},plan=dayPlan(ops,book,100,[],Date.now(),context);
 assert.equal(plan.cash,13400000);assert.equal(plan.retained,3400000);assert.equal(plan.rateBps,1500);
 const unsold=rankAllocation(4000000,1500,{...book,treasuryShares:1000},context);assert.equal(unsold.dividend,0);assert.equal(unsold.companyCharge,600000);
 assert.throws(()=>dayPlan(ops,book,100),/순위/);
});
test('ranked rates clamp to 10–30%, fractional percent payouts round to whole won and zero-revenue rewards remain artificial',()=>{
 const c={model:'rank-v1',rank:1},b={issuedShares:1000,treasuryShares:0};
 assert.equal(rankAllocation(0,1500,b,c).perShare,2250);assert.equal(rankAllocation(0,1500,b,c).companyCharge,0);
 assert.equal(rankAllocation(1234567,1025,b,c).perShare,1537);assert.equal(rankAllocation(1234567,1025,b,c).companyCharge,126543);
 assert.equal(rankAllocation(1,1,b,c).rateBps,1000);assert.equal(rankAllocation(1,9999,b,c).rateBps,3000);
});

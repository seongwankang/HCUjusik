import {test} from 'node:test';import assert from 'node:assert/strict';import {companyRevenueMetrics,revenueRankingLists,priceRankings} from '../client/rankings.js';import {initialOperations,koreaDay} from '../client/economy.js';
const now=Date.parse('2026-10-19T03:00:00Z'),day=koreaDay(now),zero={factory:0,equipment:0,research:0};
test('expected revenue includes pending investment, staffing, R&D and applied effects; cumulative counts only completed operating revenue',()=>{
 const ops={...initialOperations(),cash:-1000000,factory:1,equipment:1,research:1,employees:2,revenue:400000,staffRevenue:40000,activeResearchBps:500,pendingRevenue:100000,pendingDay:day+1,production:{...zero,factory:400000},pendingProduction:{...zero,equipment:100000},lastSettledDay:day-1};
 const effects=[{effect:{kind:'revenue',percent:-20,settlements:2},startsAfterSettlement:0,appliedAt:now-1000}];
 assert.deepEqual(companyRevenueMetrics(ops,[{day:day-2,revenue:100},{day:day-1,revenue:200},{day,revenue:999999}],effects,now),{expectedRevenue:907200,cumulativeRevenue:300});
 assert.deepEqual(companyRevenueMetrics(null,[],[],now),{expectedRevenue:0,cumulativeRevenue:0});
 assert.equal(companyRevenueMetrics({...initialOperations(),revenue:100},[],[],now).expectedRevenue,null);
 assert.throws(()=>companyRevenueMetrics(ops,[{day:1,revenue:10},{day:1,revenue:10}],[],now),/정산/);
 assert.throws(()=>companyRevenueMetrics(ops,[{day:1,revenue:-1}],[],now),/정산/);
 assert.equal(companyRevenueMetrics(ops,[{day:1,revenue:1e12},{day:2,revenue:1e12}],[],now).cumulativeRevenue,2e12);
});
test('revenue tables rank all listed companies before top-100 truncation, share ties and exclude unavailable metrics independently',()=>{
 const companies=Array.from({length:102},(_,i)=>({id:'c'+i,name:'기업 '+i,ticker:'C'+i,status:'listed',referencePrice:10000-i*10})),prices=priceRankings(companies,[],Infinity),metrics=Object.fromEntries(prices.map(p=>[p.id,{expectedRevenue:1,cumulativeRevenue:2}]));
 metrics.c100={expectedRevenue:999,cumulativeRevenue:null};metrics.c101={expectedRevenue:999,cumulativeRevenue:9999};
 const r=revenueRankingLists(prices,metrics);assert.equal(r.expectedRevenue.length,100);assert.deepEqual(r.expectedRevenue.slice(0,3).map(x=>x.rank),[1,1,3]);assert.equal(r.cumulativeRevenue[0].id,'c101');assert.equal(r.cumulativeRevenueUnavailable,1);assert.equal(r.expectedRevenueUnavailable,0);
});

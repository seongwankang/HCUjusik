import {test} from 'node:test';
import assert from 'node:assert/strict';
import {investmentDay,nextSettlement,koreaDay} from '../client/settlement-time.js';
import {investorSnapshot} from '../client/investor.js';
import {initialOperations} from '../client/economy.js';
const at=Date.parse('2026-10-19T07:55:00+09:00'),day=koreaDay(at);
test('07:55 KST investment cutoff includes midnight and 07:54, excludes exact 07:55 and later',()=>{
 for(const time of [at-(7*60+55)*60000,at-1]){assert.equal(investmentDay({},time),day);assert.deepEqual(nextSettlement({},time),{day,at});}
 for(const time of [at,at+1,at+14*3600000])assert.equal(investmentDay({},time),day+1);
 assert.equal(investmentDay({lastSettledDay:day},at-1),day+1);
});
test('before-07:55 investor estimate includes same-day factories, staff and research at that morning settlement',()=>{
 const ops={...initialOperations(),factory:1,employees:1,research:1,pendingDay:day,pendingRevenue:400000,pendingStaffRevenue:20000,pendingResearchBps:500,activeResearchBps:0,dividendBps:5000,production:{factory:0,equipment:0,research:0},pendingProduction:{factory:400000,equipment:0,research:0}};
 const d=investorSnapshot({companyId:'one',ops,book:{issuedShares:1000,treasuryShares:0},account:{positions:{one:10}}},at-1);
 assert.equal(d.settlementAt,at);assert.equal(d.tomorrowRevenue,635850);assert.equal(d.perShare,317);assert.equal(d.myDividend,3170);
});

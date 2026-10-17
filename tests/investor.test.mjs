import {test} from 'node:test';
import assert from 'node:assert/strict';
import {investorSnapshot} from '../client/investor.js';
import {initialOperations,koreaDay,dayPlan} from '../client/economy.js';
const now=Date.parse('2026-10-16T03:00:00Z'),day=koreaDay(now),companyId='one';
const input=()=>({companyId,ops:{...initialOperations(),factory:1,revenue:1000,dividendBps:5000,production:{factory:1000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}},book:{issuedShares:10,treasuryShares:4},account:{positions:{one:2},reservedPositions:{one:2}},events:[],effects:[]});
test('tomorrow dividends use doubled income, sold shares and owned shares including sell reservations',()=>{
 const i=input(),d=investorSnapshot(i,now);assert.equal(d.tomorrowRevenue,2000);assert.equal(d.perShare,166);assert.equal(d.myDividend,332);assert.equal(d.myShares,2);assert.equal(d.tomorrowAt,Date.parse('2026-10-17T00:00:00Z'));
 assert.equal(dayPlan(i.ops,i.book,day+1,[],d.tomorrowAt).perShare,d.perShare);
 assert.equal(investorSnapshot({...i,account:null},now).myDividend,0);
 assert.equal(investorSnapshot({...i,book:{issuedShares:10,treasuryShares:10}},now).perShare,0);
 assert.equal(investorSnapshot({...i,ops:{...i.ops,dividendBps:0}},now).myDividend,0);
});
test('next-day facilities mature; current events expiring at Korean midnight do not affect tomorrow',()=>{
 const i=input();i.ops.pendingRevenue=500;i.ops.pendingDay=day+1;i.ops.pendingProduction.factory=500;
 const midnight=(day+1)*86400000-32400000;
 i.effects=[{id:'ends',effectiveAt:midnight-3600000,appliedAt:now,effect:{kind:'revenue',percent:100,hours:1}}];
 const d=investorSnapshot(i,midnight-1000);assert.equal(d.activeEvents.length,1);assert.equal(d.tomorrowRevenue,3000);assert.equal(d.myDividend,500);
 assert.equal(investorSnapshot(i,midnight).activeEvents.length,0);
});
test('unclassified income stays unknown, pending choices are warned and unapplied alternatives are absent',()=>{
 const i=input();delete i.ops.production;delete i.ops.pendingProduction;i.ops.pendingEvent='hidden';
 const d=investorSnapshot(i,now);assert.equal(d.myDividend,null);assert.equal(d.perShare,null);assert.equal(d.pendingEvent,true);assert.deepEqual(d.activeEvents,[]);
 assert.equal(investorSnapshot({...i,ops:null,book:null},now).initialized,false);
});

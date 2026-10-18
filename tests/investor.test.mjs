import {test} from 'node:test';
import assert from 'node:assert/strict';
import {investorSnapshot} from '../client/investor.js';
import {initialOperations,koreaDay,dayPlan} from '../client/economy.js';
const now=Date.parse('2026-10-16T03:00:00Z'),day=koreaDay(now),companyId='one';
const input=()=>({companyId,ops:{...initialOperations(),factory:1,revenue:1000,dividendBps:5000,production:{factory:1000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}},book:{issuedShares:10,treasuryShares:4},account:{positions:{one:2},reservedPositions:{one:2}},events:[],effects:[]});
test('tomorrow dividends use doubled income, all issued shares and owned shares including sell reservations',()=>{
 const i=input(),d=investorSnapshot(i,now);assert.equal(d.tomorrowRevenue,2000);assert.equal(d.perShare,100);assert.equal(d.myDividend,200);assert.equal(d.myShares,2);assert.equal(d.tomorrowAt,Date.parse('2026-10-17T00:00:00Z'));
 assert.equal(dayPlan(i.ops,i.book,day+1,[],d.tomorrowAt).perShare,d.perShare);
 assert.equal(investorSnapshot({...i,account:null},now).myDividend,0);
 assert.equal(investorSnapshot({...i,book:{issuedShares:10,treasuryShares:10}},now).perShare,100);
 assert.equal(investorSnapshot({...i,ops:{...i.ops,dividendBps:0}},now).myDividend,0);
});
test('next-day facilities mature; current events expiring at Korean midnight do not affect tomorrow',()=>{
 const i=input();i.ops.pendingRevenue=500;i.ops.pendingDay=day+1;i.ops.pendingProduction.factory=500;
 const midnight=(day+1)*86400000-32400000;
 i.effects=[{id:'ends',effectiveAt:midnight-3600000,appliedAt:now,effect:{kind:'revenue',percent:100,hours:1}}];
 const d=investorSnapshot(i,midnight-1000);assert.equal(d.activeEvents.length,1);assert.equal(d.tomorrowRevenue,3000);assert.equal(d.myDividend,300);
 assert.equal(investorSnapshot(i,midnight).activeEvents.length,0);
});
test('unclassified income stays unknown, pending choices are warned and unapplied alternatives are absent',()=>{
 const i=input();delete i.ops.production;delete i.ops.pendingProduction;i.ops.pendingEvent='hidden';
 const d=investorSnapshot(i,now);assert.equal(d.myDividend,null);assert.equal(d.perShare,null);assert.equal(d.pendingEvent,true);assert.deepEqual(d.activeEvents,[]);
 assert.equal(investorSnapshot({...i,ops:null,book:null},now).initialized,false);
});

test('public history includes actual one-time outcomes and merges investment costs without private metadata',()=>{
 const i=input();i.events=[{id:'support',title:'투자 지원'},{id:'hidden',title:'아직 미적용'}];
 i.effects=[{id:'support',appliedAt:now-3000,effect:{kind:'cash',amount:1000000},result:{amount:500000,privateUid:'secret-uid'},option:2},{id:'later',appliedAt:now+1000,effect:{kind:'none'}}];
 i.investments=[{id:'factory-buy',asset:'factory',quantity:1,cost:2000000,activeFromDay:day+1,createdAt:new Date(now-2000).toISOString(),uid:'secret-uid'},{id:'staff-buy',asset:'employee',quantity:1,cost:80000,activeFromDay:day,createdAt:{toMillis:()=>now-1000}}];
 const d=investorSnapshot(i,now);assert.deepEqual(d.recentHistory.map(r=>r.id),['staff-buy','factory-buy','support']);
 assert.equal(d.recentHistory[0].title,'직원 1명 채용');assert.match(d.recentHistory[0].description,/80,000원/);assert.equal(d.recentHistory[0].status,'applied');assert.equal(d.recentHistory[1].status,'pending');assert.match(d.recentHistory[2].description,/500,000원/);
 const publicData=JSON.stringify(d.recentHistory);assert.equal(publicData.includes('secret-uid'),false);assert.equal(publicData.includes('option'),false);assert.equal(publicData.includes('아직 미적용'),false);assert.equal(publicData.includes('later'),false);
});
test('public history is newest first, bounded to twenty and excludes invalid or future investment records',()=>{
 const i=input();i.effects=Array.from({length:25},(_,n)=>({id:'e'+n,appliedAt:now-n*1000,effect:{kind:'none'}}));
 i.investments=[{id:'bad',asset:'factory',quantity:1,cost:-1,activeFromDay:day,createdAt:now-1},{id:'future',asset:'factory',quantity:1,cost:1,activeFromDay:day,createdAt:now+1}];
 const d=investorSnapshot(i,now);assert.equal(d.recentHistory.length,20);assert.equal(d.recentHistory[0].id,'e0');assert.equal(d.recentHistory.at(-1).id,'e19');
});
test('history distinguishes permanent results, active and replaced or expired effects',()=>{
 const i=input();i.ops.costEvents={factory:{eventId:'new-cost',startsAt:now-1000,endsAt:now+10000,percent:-20}};
 i.effects=[{id:'damage',appliedAt:now-1,effect:{kind:'destroy',asset:'factory',count:1}},{id:'new-cost',appliedAt:now-2,effectiveAt:now-1000,effect:{kind:'cost',asset:'factory',percent:-20,hours:1}},{id:'old-cost',appliedAt:now-3,effectiveAt:now-1000,effect:{kind:'cost',asset:'factory',percent:-30,hours:1}},{id:'expired',appliedAt:now-7200000,effect:{kind:'revenue',percent:-20,hours:1}}];
 assert.deepEqual(investorSnapshot(i,now).recentHistory.map(r=>r.status),['applied','active','ended','ended']);
});

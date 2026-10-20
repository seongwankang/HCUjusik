import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankingRefreshDue,RANKING_INTERVAL} from '../client/ranking-schedule.js';
import {automaticRankings} from '../public/automatic-rankings.js';
test('valid asset rankings become due at fifteen minutes; missing or invalid data is rebuilt',()=>{
 const now=Date.parse('2026-10-20T10:00:00+09:00'),board={generation:'a',entries:[{totalValue:1000000}],updatedAt:new Date(now).toISOString()};
 assert.equal(rankingRefreshDue(board,now+RANKING_INTERVAL-1),false);assert.equal(rankingRefreshDue(board,now+RANKING_INTERVAL),true);
 assert.equal(rankingRefreshDue({...board,updatedAt:{toMillis:()=>now}},now),false);
 for(const value of [null,{...board,generation:''},{...board,entries:[{totalValue:null}]},{...board,updatedAt:null}])assert.equal(rankingRefreshDue(value,now),true);
});
test('automatic publishing is admin-only, visible-only, throttled and cannot overlap itself',async()=>{
 let user={id:'a',role:'student'},visible=true,time=1000,calls=0,tick,resolve;
 const runner=automaticRankings({api:()=>{calls++;return new Promise(r=>resolve=r);},getUser:()=>user,isVisible:()=>visible,now:()=>time,every:fn=>{tick=fn;return 1;},cancel:id=>assert.equal(id,1)});
 await runner.run();assert.equal(calls,0);user.role='admin';visible=false;await runner.run();assert.equal(calls,0);visible=true;
 const pending=runner.run();await runner.run();assert.equal(calls,1);resolve({nextAt:10000});await pending;await tick();assert.equal(calls,1);
 time=10000;const next=tick();assert.equal(calls,2);resolve({nextAt:20000});await next;runner.stop();
});
test('failed automatic publication backs off and can retry without unhandled rejections',async()=>{
 let time=1000,calls=0;const runner=automaticRankings({api:async()=>{calls++;if(calls===1)throw Error('offline');return {nextAt:100000};},getUser:()=>({id:'a',role:'admin'}),now:()=>time,every:()=>1,cancel:()=>{}});
 await runner.run();await runner.run();assert.equal(calls,1);time+=60000;await runner.run();assert.equal(calls,2);runner.stop();
});

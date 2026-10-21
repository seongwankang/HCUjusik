import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankingValue} from '../client/ranking-value.js';
import {cashRankings,investorSnapshots} from '../client/rankings.js';
import {rankingRefreshDue} from '../client/ranking-schedule.js';
test('stock weight is exactly 80%, rounded once after summing; cash is counted in full',()=>{
 assert.equal(rankingValue(1000000,2000000),2600000);
 assert.equal(rankingValue(123,1),123);assert.equal(rankingValue(123,6),127);
 assert.equal(rankingValue(0,5000000000000001),4000000000000000);
 for(const v of [-1,NaN,Infinity,1.5,null])assert.throws(()=>rankingValue(0,v));
});
test('weighted total reverses raw order; cash and stock lists remain independent and reservations are not counted twice',async()=>{
 const users=['cash','stock','tie'].map(id=>({id,displayName:id,role:'student',active:true}));
 const accounts=[{id:'cash',cash:1900000},{id:'stock',cash:0,positions:{a:100},reservedCash:0,reservedPositions:{a:80}},{id:'tie',cash:300000,positions:{a:100}}];
 const companies=[{id:'a',referencePrice:10000}],books=[{id:'a',lastPrice:99900,displayPrice:20000}];
 const {board}=await investorSnapshots(users,accounts,companies,books);
 assert.deepEqual(board.entries.map(r=>[r.name,r.totalValue,r.rank]),[['cash',1900000,1],['tie',1900000,1],['stock',1600000,3]]);
 assert.equal(board.cashEntries[0].name,'cash');assert.equal(board.stockEntries[0].stockValue,2000000);
 assert.deepEqual(accounts[1].positions,{a:100});assert.equal(accounts[1].cash,0);
 assert.deepEqual(cashRankings(users,accounts,companies,books).entries.map(r=>r.totalValue),[1900000,1900000,1600000]);
});
test('old undiscounted snapshots refresh immediately, even within the normal refresh interval',()=>{
 const now=Date.now(),board={generation:'weighted',updatedAt:new Date(now).toISOString(),entries:[{cash:1000000,stockValue:2000000,totalValue:2600000}]};
 assert.equal(rankingRefreshDue(board,now),false);
 assert.equal(rankingRefreshDue({...board,entries:[{...board.entries[0],totalValue:3000000}]},now),true);
});

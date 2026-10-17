import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cashRankings,priceRankings} from '../client/rankings.js';
import {settlementDue} from '../server/scheduled-economy.js';
test('cash ranks exclude admins/inactive users, include untraded starting cash, ties and no identities',()=>{
 const users=[['a','가','student',true],['b','나','president',true],['c','다','student',true],['admin','관리자','admin',true],['off','중지','student',false]].map(([id,displayName,role,active])=>({id,displayName,role,active}));
 const r=cashRankings(users,[{id:'a',cash:2000000,reservedCash:500000},{id:'b',cash:2000000},{id:'admin',cash:1e12},{id:'off',cash:1e12}]);
 assert.deepEqual(r.entries.map(x=>x.rank),[1,1,3]);assert.equal(r.participants,3);assert.equal(r.entries[2].cash,1000000);assert.equal(r.entries[0].cash,2000000);assert.equal('id' in r.entries[0],false);
 assert.throws(()=>cashRankings(users,[{id:'a',cash:-1}]));
 const many=cashRankings(Array.from({length:105},(_,i)=>({id:String(i),displayName:'참가자',role:'student',active:true})),[]);assert.equal(many.entries.length,100);assert.equal(many.participants,105);
});
test('price ranks use actual fills, honest initial price fallback and exclude unlisted companies',()=>{
 const companies=[{id:'a',name:'가',ticker:'A',status:'listed',referencePrice:10000},{id:'b',name:'나',ticker:'B',status:'paused',referencePrice:10000},{id:'c',name:'다',status:'draft',referencePrice:99999}];
 const r=priceRankings(companies,[{id:'a',lastPrice:12000}]);assert.deepEqual(r.map(x=>[x.id,x.price,x.initial,x.rank]),[['a',12000,false,1],['b',10000,true,2]]);
});
test('daily settlement becomes due at exactly 09:00 Korean time',()=>{
 assert.equal(settlementDue(Date.parse('2026-10-16T23:59:59.999Z')),false);
 assert.equal(settlementDue(Date.parse('2026-10-17T00:00:00.000Z')),true);
 assert.equal(settlementDue(Date.parse('2026-10-17T14:59:59Z')),true);
 assert.equal(settlementDue(Date.parse('2026-10-17T15:00:00Z')),false);
});

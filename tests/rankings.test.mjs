import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cashRankings,priceRankings,investorSnapshots,marketRankingLists} from '../client/rankings.js';
import {settlementDue} from '../server/scheduled-economy.js';
test('cash ranks exclude admins/inactive users, include untraded starting cash, ties and no identities',()=>{
 const users=[['a','가','student',true],['b','나','president',true],['c','다','student',true],['admin','관리자','admin',true],['off','중지','student',false]].map(([id,displayName,role,active])=>({id,displayName,role,active}));
 const r=cashRankings(users,[{id:'a',cash:3000000,reservedCash:500000},{id:'b',cash:3000000},{id:'admin',cash:1e12},{id:'off',cash:1e12}]);
 assert.deepEqual(r.entries.map(x=>x.rank),[1,1,3]);assert.equal(r.participants,3);assert.equal(r.entries[2].cash,2000000);assert.equal(r.entries[0].cash,3000000);assert.equal('id' in r.entries[0],false);
 assert.throws(()=>cashRankings(users,[{id:'a',cash:-1}]));
 const many=cashRankings(Array.from({length:105},(_,i)=>({id:String(i),displayName:'참가자',role:'student',active:true})),[]);assert.equal(many.entries.length,100);assert.equal(many.participants,105);
});
test('price ranks use actual fills, honest initial price fallback and exclude unlisted companies',()=>{
 const companies=[{id:'a',name:'가',ticker:'A',status:'listed',referencePrice:10000},{id:'b',name:'나',ticker:'B',status:'paused',referencePrice:10000},{id:'c',name:'다',status:'draft',referencePrice:99999}];
 const r=priceRankings(companies,[{id:'a',lastPrice:12000}]);assert.deepEqual(r.map(x=>[x.id,x.price,x.initial,x.rank]),[['a',12000,false,1],['b',10000,true,2]]);
});
test('daily settlement becomes due at exactly 07:55 Korean time',()=>{
 assert.equal(settlementDue(Date.parse('2026-10-16T22:54:59.999Z')),false);
 assert.equal(settlementDue(Date.parse('2026-10-16T22:55:00.000Z')),true);
 assert.equal(settlementDue(Date.parse('2026-10-17T14:59:59Z')),true);
 assert.equal(settlementDue(Date.parse('2026-10-17T15:00:00Z')),false);
});

test('asset rankings use cash plus current holdings without double counting reservations',()=>{
 const users=[{id:'a',displayName:'가',role:'student',active:true},{id:'b',displayName:'나',role:'student',active:true}];
 const accounts=[{id:'a',cash:500000,reservedCash:100000,positions:{one:100},reservedPositions:{one:80}},{id:'b',cash:1500000}];
 const companies=[{id:'one',referencePrice:10000}];
 const r=cashRankings(users,accounts,companies,[{id:'one',lastPrice:20000}]);assert.equal(r.entries[0].name,'가');assert.equal(r.entries[0].stockValue,2000000);assert.equal(r.entries[0].totalValue,2500000);assert.equal(r.entries[0].cash,500000);assert.equal('positions' in r.entries[0],false);
 const initial=cashRankings(users,accounts,companies,[]);assert.equal(initial.entries[0].totalValue,1500000);assert.deepEqual(initial.entries.map(x=>x.rank),[1,1]);
 assert.throws(()=>cashRankings(users,accounts,[],[]),/가격/);
});

test('public investor snapshots contain only name, cash and stock quantities, with stable opaque keys',async()=>{
 const users=[{id:'private-uid-a',displayName:'김학생',role:'student',active:true},{id:'private-off',displayName:'중지',role:'student',active:false}];
 const accounts=[{id:'private-uid-a',cash:700000,reservedCash:100000,positions:{one:20},reservedPositions:{one:5},email:'secret@example.test',lastMarket:'one'}],companies=[{id:'one',name:'기업',ticker:'ONE',referencePrice:10000}];
 const a=await investorSnapshots(users,accounts,companies),b=await investorSnapshots(users,accounts,companies);
 assert.equal(a.profiles.length,1);assert.equal(a.board.entries[0].investorKey,b.board.entries[0].investorKey);assert.notEqual(a.board.generation,b.board.generation);
 const p=a.profiles[0].profile;assert.deepEqual(p.holdings,[{companyId:'one',name:'기업',ticker:'ONE',quantity:20}]);assert.equal(p.cash,700000);
 const text=JSON.stringify(a);for(const secret of ['private-uid-a','private-off','secret@example.test','reservedCash','reservedPositions','lastMarket'])assert.equal(text.includes(secret),false);
});
test('market rankings separate daily volume, gains and losses, with shared ties and missing-data exclusion',()=>{
 const prices=['a','b','c','d','missing'].map((id,i)=>({id,name:id,price:10000,rank:i+1}));
 const r=marketRankingLists(prices,{a:{volume:20,change:{percent:5}},b:{volume:20,change:{percent:10}},c:{volume:100,change:{percent:-20}},d:{volume:0,change:{percent:0}}});
 assert.deepEqual(r.volume.map(x=>[x.id,x.rank]),[['c',1],['a',2],['b',2],['d',4]]);assert.deepEqual(r.gainers.map(x=>x.id),['b','a']);assert.deepEqual(r.losers.map(x=>x.id),['c']);assert.equal(r.unavailable,1);
});

test('cheap stocks outside the first hundred price ranks can lead volume and return rankings',()=>{
 const companies=Array.from({length:101},(_,i)=>({id:'c'+i,name:'기업 '+i,ticker:'C'+i,status:'listed',referencePrice:10000-i*10}));
 const prices=priceRankings(companies,[],Infinity),sessions=Object.fromEntries(prices.map(p=>[p.id,{volume:p.id==='c100'?999:1,change:{percent:p.id==='c100'?50:0}}]));
 const r=marketRankingLists(prices,sessions);assert.equal(r.prices.length,100);assert.equal(r.volume[0].id,'c100');assert.equal(r.gainers[0].id,'c100');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shareholderSnapshots} from '../client/shareholders.js';
import {shareholderMarkup} from '../public/shareholders.js';
test('company-only projection includes reserved holdings, inactive/admin owners and all 120 holders without identity or cash',async()=>{
 const users=Array.from({length:120},(_,i)=>({id:'private-'+i,displayName:'학생 '+i,email:'secret@hcu.hs.kr',active:i!==0,role:i===1?'admin':'student'}));
 const accounts=users.map(u=>({id:u.id,cash:999,positions:{one:1,two:5},reservedPositions:{one:1}}));
 const [s]=await shareholderSnapshots(users,accounts,[{id:'one',issuedShares:1000}],[{id:'one',issuedShares:1000,treasuryShares:880,version:7}]);
 assert.equal(s.entries.length,120);assert.equal(s.holderShares,120);assert.equal(s.treasuryShares,880);assert.equal(s.bookVersion,7);assert.equal(s.entries[0].quantity,1);
 assert.match(s.entries[0].investorKey,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(s.entries[0]).sort(),['investorKey','name','quantity']);
 for(const privateValue of ['private-','secret@','cash','two','reservedPositions'])assert.equal(JSON.stringify(s).includes(privateValue),false);
});
test('shareholder list sorts by quantity, excludes zero, and rejects impossible totals',async()=>{
 const users=[{id:'a',displayName:'가'},{id:'b',displayName:'나'}],accounts=[{id:'a',positions:{one:2}},{id:'b',positions:{one:5}}],companies=[{id:'one',issuedShares:10}];
 const [s]=await shareholderSnapshots(users,accounts,companies,[]);assert.deepEqual(s.entries.map(e=>[e.name,e.quantity]),[['나',5],['가',2]]);assert.equal(s.treasuryShares,3);
 await assert.rejects(shareholderSnapshots(users,accounts,[{id:'one',issuedShares:6}],[]),/발행/);
 await assert.rejects(shareholderSnapshots(users,[{id:'a',positions:{one:-1}}],companies,[]),/수량/);
});
test('shareholder UI escapes names, displays issued-share percentage and never renders opaque identities',()=>{
 const html=shareholderMarkup({entries:[{name:'<학생>',investorKey:'private-key',quantity:100}],issuedShares:1000,treasuryShares:900,updatedAt:'2026-10-21T07:00:00Z'});
 assert.match(html,/&lt;학생&gt;/);assert.match(html,/>10%</);assert.match(html,/회사 보유/);assert.doesNotMatch(html,/private-key/);assert.match(shareholderMarkup(null),/집계 중/);
});

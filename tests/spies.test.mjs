import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spyPolicy,DEFAULT_SPY_POLICY,spyTransfers} from '../client/spy-model.js';
test('conservative spy defaults and bounded admin policy',()=>{assert.deepEqual(spyPolicy(),{cost:1000000,bps:50,settlements:0});for(const p of [{...DEFAULT_SPY_POLICY,bps:501},{...DEFAULT_SPY_POLICY,cost:1},{...DEFAULT_SPY_POLICY,settlements:1},{...DEFAULT_SPY_POLICY,extra:1}])assert.throws(()=>spyPolicy(p));});
test('cyclic spies use only ordinary revenue, preserve total company cash',()=>{const c={a:{revenue:4000000,cash:1e7},b:{revenue:2000000,cash:1e7},c:{revenue:1000000,cash:1e7}},s=[{companyId:'a',targetId:'b',bps:200},{companyId:'b',targetId:'c',bps:200},{companyId:'c',targetId:'a',bps:200}];const p=spyTransfers(s,c);assert.deepEqual(p.transfers.map(x=>x.amount).sort((a,b)=>a-b),[20000,40000,80000]);assert.equal(p.entries.reduce((n,x)=>n+x.net,0),0);assert.deepEqual(spyTransfers(s.toReversed(),c),p);});
test('many attackers share 10 percent cap with exact deterministic rounding',()=>{const c={target:{revenue:10001,cash:1e7}},s=Array.from({length:7},(_,i)=>({companyId:'c'+i,targetId:'target',bps:200}));for(const x of s)c[x.companyId]={revenue:0,cash:0};const p=spyTransfers(s,c);assert.equal(p.transfers.reduce((n,x)=>n+x.amount,0),1000);assert.equal(p.entries.find(x=>x.companyId==='target').lost,1000);assert.deepEqual(spyTransfers(s.toReversed(),c),p);});
test('theft cannot exceed original cash; incoming stolen funds are never reused',()=>{const c={a:{revenue:1e6,cash:0},b:{revenue:1e6,cash:100},c:{revenue:1e6,cash:1e6}},s=[{companyId:'a',targetId:'b',bps:200},{companyId:'b',targetId:'a',bps:200},{companyId:'b',targetId:'c',bps:200}],p=spyTransfers(s,c);assert.equal(p.transfers.find(x=>x.companyId==='b'&&x.targetId==='a').amount,0);assert.equal(p.entries.find(x=>x.companyId==='b').lost,100);assert.equal(p.entries.reduce((n,x)=>n+x.net,0),0);});
test('zero income, removed target, and self theft do not mint money',()=>{assert.equal(spyTransfers([{companyId:'a',targetId:'b',bps:200},{companyId:'a',targetId:'a',bps:200}],{a:{revenue:0,cash:100}}).entries[0].net,0);});


test('indebted targets cannot create negative theft; incoming theft repays owner debt',()=>{
 const c={a:{revenue:1000000,cash:-100000},b:{revenue:1000000,cash:1000000}},s=[{companyId:'a',targetId:'b',bps:50},{companyId:'b',targetId:'a',bps:50}],p=spyTransfers(s,c);
 assert.equal(p.transfers.find(t=>t.targetId==='a').amount,0);assert.equal(p.entries.find(e=>e.companyId==='a').net,5000);assert.equal(p.entries.reduce((n,e)=>n+e.net,0),0);
});

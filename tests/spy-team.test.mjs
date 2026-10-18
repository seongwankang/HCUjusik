import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spyTransfers,activeSpies,effectiveSpyPolicy} from '../client/spy-model.js';
test('ten agents on one target earn exactly five percent, including small integer revenue',()=>{const agents=Array.from({length:10},(_,i)=>({companyId:'a',targetId:'b',hireId:String(i),bps:50}));const p=spyTransfers(agents,{a:{revenue:0,cash:0},b:{revenue:100,cash:100}});assert.equal(p.entries.find(x=>x.companyId==='a').stolen,5);});
test('legacy active spy remains available without duration; old policy cannot revive old price or rate',()=>{assert.equal(activeSpies({remaining:2}).length,1);assert.equal(activeSpies({remaining:0}).length,0);assert.deepEqual(effectiveSpyPolicy({cost:2000000,bps:200,settlements:3}),{cost:1000000,bps:50,settlements:0});});

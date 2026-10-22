import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spyTransfers,activeSpies,effectiveSpyPolicy} from '../client/spy-model.js';
test('two agents earn eight percent, including small integer revenue',()=>{const agents=[{companyId:'a',targetId:'b',hireId:'one',bps:400},{companyId:'a',targetId:'b',hireId:'two',bps:400}];const p=spyTransfers(agents,{a:{revenue:0,cash:0},b:{revenue:100,cash:100}});assert.equal(p.entries.find(x=>x.companyId==='a').stolen,8);});
test('legacy active spy remains available without duration; old policy cannot revive old price or rate',()=>{assert.equal(activeSpies({remaining:2}).length,1);assert.equal(activeSpies({remaining:0}).length,0);assert.deepEqual(effectiveSpyPolicy({cost:2000000,bps:200,settlements:3}),{cost:1000000,bps:400,settlements:0});});

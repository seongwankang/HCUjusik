import {test} from 'node:test';import assert from 'node:assert/strict';
import {eventMutation,adjustedRevenue} from '../client/event-model.js';
import {emptyUnits,unitPurchase} from '../client/production-units.js';
const base={productionModel:'units-v2',factory:0,equipment:0,research:0,employees:10,pendingDay:0,pendingUnits:emptyUnits()};
const workforce=(o,count)=>({...o,...eventMutation(o,{kind:'workforce',count,settlements:0},{})});
test('event staff exceed capacity and all produce; ordinary hiring remains capacity-bound',()=>{
 const o=workforce(base,8);assert.equal(o.employees,18);assert.equal(o.eventEmployees,8);assert.equal(adjustedRevenue(o,100).productionPower,2160);assert.equal(adjustedRevenue(o,100).capacity,10);assert.throws(()=>unitPurchase(o,'employee',100,1),/정원/);
 assert.equal(adjustedRevenue({...o,employees:30},100).productionPower,2160); // Ordinary excess staff still lack capacity.
 const again=workforce(o,3);assert.equal(again.employees,21);assert.equal(again.eventEmployees,11);
 const lost=workforce(o,-5);assert.equal(lost.employees,13);assert.equal(lost.eventEmployees,3);assert.equal(adjustedRevenue(lost,100).productionPower,1560);
 const all=workforce(lost,-1000);assert.equal(all.employees,0);assert.equal(all.eventEmployees,0);assert.equal(adjustedRevenue(all,100).productionPower,0);
});
test('event losses remove exempt staff before pending paid hires, without prematurely activating paid staff',()=>{
 const o=workforce({...base,employees:12,pendingDay:101,pendingUnits:{...emptyUnits(),employee:2}},8);
 assert.equal(adjustedRevenue(o,100).productionPower,2160);
 const lost=workforce(o,-3);assert.equal(lost.pendingUnits.employee,2);assert.equal(lost.eventEmployees,5);assert.equal(adjustedRevenue(lost,100).productionPower,1800);
 const capped=workforce({...base,employees:999},8);assert.equal(capped.employees,1000);assert.equal(capped.eventEmployees,1);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEffect,destruction,adjustedRevenue,activeEffect} from '../client/event-model.js';
import {initialOperations,dayPlan} from '../client/economy.js';
const o={...initialOperations(),factory:2,equipment:1,revenue:12000,pendingRevenue:5000,pendingDay:20,production:{factory:10000,equipment:2000,research:0},pendingProduction:{factory:5000,equipment:0,research:0}};
const event=(effect,appliedAt=1000)=>({effect:validateEffect(effect),appliedAt});
test('temporary revenue and facility effects add against base, expire exactly, and never compound',()=>{
 const records=[event({kind:'revenue',percent:-20,hours:1}),event({kind:'efficiency',asset:'factory',percent:50,hours:1})];
 assert.equal(adjustedRevenue(o,19,records,1000).revenue,14600);
 assert.equal(adjustedRevenue(o,20,records,1000).revenue,21100);
 assert.equal(adjustedRevenue(o,20,records,3601000).revenue,17000);
 assert.equal(activeEffect(records[0],999),false);
 assert.equal(adjustedRevenue(o,19,[event({kind:'revenue',percent:-100,hours:1}),event({kind:'revenue',percent:-100,hours:1})],1000).revenue,0);
 const p=dayPlan(o,{issuerCash:0,issuedShares:10,treasuryShares:0},19,records,1000);assert.equal(p.base,12000);assert.equal(p.revenue,14600);
});
test('destruction removes current and pending pooled yield, clamps to owned count, no refunds',()=>{
 const e=validateEffect({kind:'destroy',asset:'factory',count:1});const d=destruction(o,e);
 assert.equal(d.factory,1);assert.equal(d.revenue,7000);assert.equal(d.pendingRevenue,2500);assert.equal(d.production.equipment,2000);assert.equal(d.cash,undefined);
 const all=destruction(o,{...e,count:100});assert.equal(all.factory,0);assert.equal(all.revenue,2000);assert.equal(all.pendingRevenue,0);
 assert.throws(()=>destruction({...o,locked:true},e));
});
test('invalid effects and accounting overflow rejected',()=>{
 for(const e of [{kind:'oops'},{kind:'revenue',percent:-101,hours:1},{kind:'revenue',percent:1,hours:0},{kind:'destroy',asset:'factory',count:0},{kind:'efficiency',asset:'bad',percent:1,hours:1}])assert.throws(()=>validateEffect(e));
 assert.throws(()=>adjustedRevenue({...o,revenue:1e12},19,[event({kind:'revenue',percent:500,hours:1})],1000));
});

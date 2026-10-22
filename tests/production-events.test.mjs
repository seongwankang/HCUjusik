import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adjustedRevenue,validateEffect,effectText,revenueEffects} from '../client/event-model.js';
import {productionEffectKinds} from '../client/production-effects.js';
import {revenueEffectBadges} from '../public/revenue-effects.js';
const o={productionModel:'units-v2',factory:1,equipment:0,research:0,employees:10,pendingUnits:{},pendingDay:0,settlementCount:5};
const record=(kind,value)=>({id:kind,effect:validateEffect({kind,...(kind.endsWith('Flat')?{amount:value}:{percent:value}),settlements:2}),effectiveAt:100,startsAfterSettlement:5});
test('each production input modifies the actual profit formula, not stored inventory',()=>{
 const expected={salePrice:[1100,600,1200,600000],salePriceFlat:[1100,600,1200,600000],productionCost:[1000,660,1200,408000],productionCostFlat:[1000,700,1200,360000],productionPower:[1000,600,1320,528000],productionPowerFlat:[1000,600,1300,520000]};
 for(const kind of productionEffectKinds){const before=structuredClone(o),r=record(kind,kind.endsWith('Flat')?100:10),p=adjustedRevenue(o,10,[r],101);assert.deepEqual([p.salePrice,p.productionCost,p.productionPower,p.revenue],expected[kind]);assert.deepEqual(o,before);assert.match(effectText(r.effect),/정산 2회/);assert.equal(revenueEffects(o,[r],101)[0].kind,kind);}
});
test('modifiers add percentages then flat changes, are order independent and expire after exactly two settlements',()=>{
 const rows=[record('salePrice',20),record('salePrice',-10),record('salePriceFlat',50),record('productionCost',-20),record('productionPower',-50)];
 const p=adjustedRevenue(o,10,rows,101);assert.equal(p.salePrice,1150);assert.equal(p.productionCost,480);assert.equal(p.productionPower,600);assert.equal(p.revenue,402000);
 assert.deepEqual(adjustedRevenue(o,10,[...rows].reverse(),101),p);
 assert.equal(adjustedRevenue({...o,settlementCount:6},10,rows,101).revenue,402000);
 assert.equal(adjustedRevenue({...o,settlementCount:7},10,rows,101).revenue,480000);
 assert.equal(adjustedRevenue(o,10,rows,99).revenue,480000);
});
test('input floors and limits prevent negative quantities, negative cost and fabricated income',()=>{
 assert.equal(adjustedRevenue(o,10,[record('productionPowerFlat',-1000000)],101).productionPower,0);
 assert.equal(adjustedRevenue(o,10,[record('productionCostFlat',-1000000)],101).productionCost,1);
 assert.equal(adjustedRevenue(o,10,[record('salePriceFlat',-1000000)],101).revenue,0);
 for(const kind of productionEffectKinds){assert.throws(()=>validateEffect({kind,percent:501,amount:1000001,settlements:2}));assert.throws(()=>validateEffect({kind,percent:10,amount:10,settlements:0}));}
 assert.match(revenueEffectBadges([{kind:'productionCost',percent:20}]),/data-direction="down"/);
 assert.match(revenueEffectBadges([{kind:'productionCostFlat',amount:-100}]),/data-direction="up"/);
 assert.match(revenueEffectBadges([{kind:'salePriceFlat',amount:100}]),/판매가격 \+100원/);
});

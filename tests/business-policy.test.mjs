import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,effectiveConfig,validateConfig,staffCapacity} from '../client/business-policy.js';
import {startupExample,previewPurchase} from '../client/investment-preview.js';
import {initialOperations,dayPlan} from '../client/economy.js';
import {adjustedRevenue,destruction} from '../client/event-model.js';
const day=20000,zero={factory:0,equipment:0,research:0};
const company=()=>({...initialOperations(),factory:2,equipment:2,employees:5,research:1,revenue:370000,staffRevenue:90000,activeResearchBps:500,production:{factory:240000,equipment:130000,research:0},pendingProduction:{...zero}});
test('1,000-share startup plan costs eight million and earns 882,000 next day; stored policy must be v3',()=>{
 assert.deepEqual(startupExample(DEFAULT_CONFIG),{cost:8000000,remaining:2000000,additive:840000,revenue:882000,perShareAtHalf:441});
 assert.deepEqual(effectiveConfig({factoryCost:1,researchRevenue:999999}),DEFAULT_CONFIG);
 assert.throws(()=>validateConfig({...DEFAULT_CONFIG,researchBoostBps:1001}));
 assert.throws(()=>validateConfig({...DEFAULT_CONFIG,employeeCost:-1}));
});
test('hiring and R&D mature the next Korean day, with no daily compounding or invented revenue',()=>{
 const o={...company(),revenue:0,staffRevenue:0,activeResearchBps:0,pendingRevenue:370000,pendingStaffRevenue:90000,pendingResearchBps:500,pendingDay:day+1,production:{...zero},pendingProduction:{factory:240000,equipment:130000,research:0}};
 assert.equal(adjustedRevenue(o,day).revenue,0);assert.equal(adjustedRevenue(o,day+1).revenue,483000);
 const mature=company();const p=dayPlan(mature,{issuerCash:0,issuedShares:1000,treasuryShares:0},day);
 assert.equal(p.base,370000);assert.equal(p.revenue,483000);
 assert.equal(dayPlan({...mature,revenue:p.base,lastSettledDay:day},{issuerCash:0,issuedShares:1000,treasuryShares:0},day+1).revenue,483000);
});
test('centers add small percentage points to one multiplier and cap at 30%; purchasing previews use real context',()=>{
 const o=company();assert.equal(adjustedRevenue({...o,research:2,activeResearchBps:1000},day).revenue,506000);
 assert.equal(adjustedRevenue({...o,activeResearchBps:9000},day).revenue,598000);
 const p=previewPurchase(o,DEFAULT_CONFIG,'research',day);assert.equal(p.gain,23000);assert.equal(p.after,506000);
 assert.equal(previewPurchase(initialOperations(),DEFAULT_CONFIG,'research',day).gain,0);
 assert.equal(previewPurchase(initialOperations(),DEFAULT_CONFIG,'employee',day).allowed,true);
});
test('destroyed facilities reduce staff capacity without deleting employees; research destruction removes bonus',()=>{
 const o={...company(),factory:1,equipment:0,employees:5,revenue:120000,production:{factory:120000,equipment:0,research:0}};
 const broken={...o,...destruction(o,{kind:'destroy',asset:'factory',count:1})};assert.equal(broken.employees,5);assert.equal(adjustedRevenue(broken,day).revenue,94500);
 const rdBroken={...o,...destruction(o,{kind:'destroy',asset:'research',count:1})};assert.equal(rdBroken.activeResearchBps,0);assert.equal(adjustedRevenue(rdBroken,day).revenue,210000);
});
test('old additive research becomes percentage research without resetting cash or paying old yield twice',()=>{
 const o={...initialOperations(),cash:12345,factory:1,research:1,revenue:132000,production:{factory:120000,equipment:0,research:12000},pendingProduction:{...zero}};
 const p=dayPlan(o,{issuerCash:0,issuedShares:1000,treasuryShares:0},day);assert.equal(p.revenue,126000);assert.equal(p.base,132000);assert.equal(p.cash,138345);assert.equal(o.cash,12345);
});
test('R&D efficiency events change the multiplier, and revenue events use final boosted income',()=>{
 const o=company(),record=effect=>({effect,appliedAt:1000});
 const rd=record({kind:'efficiency',asset:'research',percent:-100,hours:1});assert.equal(adjustedRevenue(o,day,[rd],1000).revenue,460000);
 const hit=record({kind:'revenue',percent:-20,hours:1});assert.equal(adjustedRevenue(o,day,[hit],1000).revenue,386400);
 assert.equal(adjustedRevenue({...o,activeResearchBps:6000},day,[record({...rd.effect,percent:-50})],1000).boostBps,1500);
});

test('base staffing works without facilities, expands generously, and retains the hard cap',()=>{
 assert.equal(staffCapacity({factory:0,equipment:0}),10);
 assert.equal(staffCapacity({factory:2,equipment:2}),80);
 assert.equal(staffCapacity({factory:1000,equipment:1000}),1000);
 assert.equal(previewPurchase({...initialOperations(),employees:10},DEFAULT_CONFIG,'employee',day).allowed,false);
 assert.equal(adjustedRevenue({...initialOperations(),employees:10,staffRevenue:200000},day).revenue,200000);
 assert.deepEqual(effectiveConfig({...DEFAULT_CONFIG,version:2,employeeCost:300000}),DEFAULT_CONFIG);
});

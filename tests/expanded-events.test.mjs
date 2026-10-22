import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEffect,eventMutation,investmentCost,effectiveDividendBps,currentEffect,adjustedRevenue} from '../client/event-model.js';
import {DEFAULT_CONFIG as config} from '../client/business-policy.js';
import {initialOperations,dayPlan} from '../client/economy.js';
import {investorSnapshot} from '../client/investor.js';
const now=Date.parse('2026-10-17T03:00:00Z'),day=Math.floor((now+32400000)/86400000);
const base=()=>({...initialOperations(),cash:100000,receivedIssuerCash:100000,factory:1,equipment:0,research:0,employees:5,staffRevenue:100000,pendingStaffRevenue:50000,revenue:400000,production:{factory:400000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0},dividendBps:5000});
const context={config,book:{issuerCash:300000},effectiveAt:now,eventId:'event-one'};
test('one-time money uses all issuer proceeds once, allows company debt and rejects overflow',()=>{
 const o=base(),p=eventMutation(o,{kind:'cash',amount:1000000},context);assert.equal(p.cash,1300000);assert.equal(p.receivedIssuerCash,300000);
 assert.equal(eventMutation(o,{kind:'cash',amount:-1000000},context).cash,-700000);
 assert.throws(()=>eventMutation({...o,cash:1e12},{kind:'cash',amount:100000000},context),/한도/);
 assert.equal(adjustedRevenue({...o,...p},day).revenue,adjustedRevenue(o,day).revenue);
});
test('free workforce bypasses capacity and losses reduce active and pending yield proportionally',()=>{
 const o=base(),gain=eventMutation(o,{kind:'workforce',count:1000},context);assert.equal(gain.employees,1000);assert.equal(gain.staffRevenue,20000000);assert.equal(gain.cash,undefined);
 const loss=eventMutation(o,{kind:'workforce',count:-2},context);assert.equal(loss.employees,3);assert.equal(loss.staffRevenue,60000);assert.equal(loss.pendingStaffRevenue,30000);
 const all=eventMutation(o,{kind:'workforce',count:-1000},context);assert.equal(all.employees,0);assert.equal(all.staffRevenue+all.pendingStaffRevenue,0);
});
test('free facilities use catalog yield immediately, do not touch cash or pending pools and honor caps',()=>{
 const o=base(),p=eventMutation(o,{kind:'grant',asset:'equipment',count:2},context);assert.equal(p.equipment,2);assert.equal(p.revenue,800000);assert.equal(p.production.equipment,400000);assert.equal(p.cash,undefined);assert.deepEqual(p.pendingProduction,o.pendingProduction);
 const rd=eventMutation({...o,research:5,activeResearchBps:2500,pendingResearchBps:500},{kind:'grant',asset:'research',count:100},context);assert.equal(rd.research,6);assert.equal(rd.activeResearchBps,2500);
 assert.equal(eventMutation({...o,factory:999},{kind:'grant',asset:'factory',count:10},context).factory,1000);
});
test('discounts affect only purchase cost, expire exactly and last applied terms replace earlier terms',()=>{
 const o=base(),e={kind:'cost',asset:'all',percent:-20,hours:1},p=eventMutation(o,e,context),next={...o,...p};
 assert.equal(investmentCost(next,config,'factory',now),1600000);assert.equal(investmentCost(next,config,'employee',now),80000);
 assert.equal(investmentCost(next,config,'employee',now-1),100000);assert.equal(investmentCost(next,config,'employee',now+3600000),100000);
 const replaced={...next,...eventMutation(next,{...e,asset:'employee',percent:50},{...context,eventId:'event-two'})};
 assert.equal(investmentCost(replaced,config,'employee',now),150000);assert.equal(investmentCost(replaced,config,'factory',now),1600000);
 assert.equal(currentEffect(replaced,{id:'event-one',effect:validateEffect(e),effectiveAt:now},now),true);
 assert.equal(investmentCost({...o,...eventMutation(o,{...e,asset:'all',percent:-90},context)},{...config,employeeCost:1},'employee',now),1);
 assert.equal(adjustedRevenue(next,day,[{effect:validateEffect(e),effectiveAt:now}],now).revenue,adjustedRevenue(o,day).revenue);
});
test('dividend caps preserve configured rate and agree between settlement and next-9AM investor estimate',()=>{
 const o=base(),next={...o,...eventMutation(o,{kind:'dividendCap',percent:20,hours:48},context)},book={issuerCash:100000,issuedShares:1000,treasuryShares:0};
 assert.equal(next.dividendBps,5000);assert.equal(effectiveDividendBps(next,now),2000);assert.equal(effectiveDividendBps(next,now+48*3600000),5000);
 const p=dayPlan(next,book,day,[],now);assert.equal(p.rateBps,2000);assert.equal(p.dividend,p.perShare*1000);
 const d=investorSnapshot({companyId:'one',ops:next,book,account:{positions:{one:10}}},now);
 assert.equal(d.configuredDividendBps,5000);assert.equal(d.tomorrowDividendBps,2000);assert.equal(d.myDividend,d.perShare*10);
 assert.equal(d.perShare,dayPlan(next,book,day+1,[],d.tomorrowAt).perShare);
});
test('new effects reject invalid ranges and mutation during settlement',()=>{
 for(const e of [{kind:'cash',amount:0},{kind:'cash',amount:1.5},{kind:'cash',amount:100000001},{kind:'cost',asset:'employee',percent:-91,hours:1},{kind:'cost',asset:'bad',percent:10,hours:1},{kind:'workforce',count:0},{kind:'workforce',count:-1001},{kind:'grant',asset:'employee',count:1},{kind:'dividendCap',percent:101,hours:1},{kind:'dividendCap',percent:50,hours:0}])assert.throws(()=>validateEffect(e));
 assert.throws(()=>eventMutation({...base(),locked:true},{kind:'cash',amount:1},context),/정산/);
});


test('debt absorbs grants and future retained earnings; only company cash can go negative',()=>{
 const o={...base(),cash:-1000000,receivedIssuerCash:300000};
 const grant=eventMutation(o,{kind:'cash',amount:100000},context);assert.equal(grant.cash,-900000);
 const loss=eventMutation({...o,...grant},{kind:'cash',amount:-500000},context);assert.equal(loss.cash,-1400000);
 const plan=dayPlan({...o,...loss}, {issuerCash:300000,issuedShares:1000,treasuryShares:0},day,[],now);
 assert.equal(plan.cash,loss.cash+plan.retained);assert.ok(plan.cash<0);
 assert.throws(()=>eventMutation({...o,cash:-1e12},{kind:'cash',amount:-1},context),/한도/);
});

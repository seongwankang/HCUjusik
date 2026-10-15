import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';
import {initialOperations,initializeOperations,invest,operationsView,settleDay,dayPlan,koreaDay,DEFAULT_CONFIG} from '../../client/economy.js';
import {publishEvent,chooseEvent} from '../../client/events.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Loopback emulator required');
let env,admin,president,student;const cid='standard-ipo';
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-business-policy-v2',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role] of [['admin','admin'],['president','president'],['student','student']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});
 await setDoc(doc(db,'assignments/president'),{companyIds:[cid,'rd-cap']});
 for(const [id,funding] of [[cid,10000000],['rd-cap',10000000]]){await setDoc(doc(db,'companies',id),{name:id,status:'listed',referencePrice:10000,issuedShares:1000});await setDoc(doc(db,'sparkBooks',id),{issuerCash:funding,issuedShares:1000,treasuryShares:0});}
 await setDoc(doc(db,'sparkAccounts/student'),{cash:1000000,reservedCash:0,positions:{[cid]:1000},reservedPositions:{},version:1,lastMarket:cid});
 // An existing six-field catalog is preserved, but cannot silently select the old R&D model.
 await setDoc(doc(db,'economyConfig/main'),{factoryCost:1,factoryRevenue:1,equipmentCost:1,equipmentRevenue:1,researchCost:1,researchRevenue:99999});});
 const claims={email:'test@hcu.hs.kr',email_verified:true};admin=env.authenticatedContext('admin',claims).firestore();president=env.authenticatedContext('president',claims).firestore();student=env.authenticatedContext('student',claims).firestore();
});
after(async()=>env?.cleanup());
test('standard IPO finances exact starter plan atomically per purchase; hire requires facilities and ownership',async()=>{
 await initializeOperations(president,cid);const first=await operationsView(president,cid);assert.equal(first.available,10000000);assert.deepEqual(first.config,DEFAULT_CONFIG);
 await assert.rejects(invest(president,cid,'employee'),/수용/);await assertFails(invest(student,cid,'factory'));
 await assertFails(updateDoc(doc(president,'companyOperations',cid),{cash:9700000,receivedIssuerCash:10000000,employees:1,staffRevenue:0,pendingStaffRevenue:18000,activeResearchBps:0,pendingResearchBps:0,pendingDay:koreaDay()+1,production:{factory:0,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}}));
 for(const [asset,count] of [['factory',2],['equipment',2],['employee',5],['research',1]])for(let i=0;i<count;i++)await invest(president,cid,asset);
 const v=await operationsView(president,cid),o=v.ops;assert.equal(v.available,1000000);assert.equal(o.employees,5);assert.equal(o.research,1);assert.equal(o.pendingResearchBps,500);assert.equal(o.pendingStaffRevenue,90000);assert.equal(o.pendingRevenue,370000);assert.equal(o.production.research,0);assert.equal(o.pendingProduction.research,0);
 assert.equal(dayPlan(o,v.book,koreaDay()).revenue,0);assert.equal(dayPlan(o,v.book,koreaDay()+1).revenue,483000);
 await assertFails(updateDoc(doc(president,'companyOperations',cid),{employees:100,staffRevenue:999999,activeResearchBps:3000}));
 await assertFails(updateDoc(doc(president,'companyOperations',cid),{employees:6,pendingStaffRevenue:108000,cash:700000,employee:'unexpected-field'}));
});
test('matured staff and R&D pay dividends once from net income, preserving unmultipled base',async()=>{
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'companyOperations',cid),{pendingDay:koreaDay(),dividendBps:5000}));
 const result=await settleDay(admin,cid);assert.equal(result.recipients,1);
 const v=await operationsView(admin,cid),o=v.ops;assert.equal(o.revenue,370000);assert.equal(o.staffRevenue,90000);assert.equal(o.activeResearchBps,500);assert.equal(o.pendingStaffRevenue,0);assert.equal(o.pendingResearchBps,0);assert.equal(v.days[0].revenue,483000);assert.equal(v.days[0].perShare,241);assert.equal(v.available,1242000);
 assert.equal((await getDoc(doc(student,'sparkAccounts/student'))).data().cash,1241000);await assert.rejects(settleDay(admin,cid),/이미 완료/);
 assert.equal(dayPlan(o,v.book,koreaDay()+1).revenue,483000);
});
test('policy changes preserve purchased staff yield and R&D points; new purchases store new policy',async()=>{
 await setDoc(doc(admin,'economyConfig/main'),{...DEFAULT_CONFIG,employeeRevenue:1,researchBoostBps:100,researchCost:100000});
 await invest(president,cid,'employee');await invest(president,cid,'research');const v=await operationsView(president,cid),o=v.ops;
 assert.equal(o.staffRevenue,90000);assert.equal(o.pendingStaffRevenue,1);assert.equal(o.activeResearchBps,500);assert.equal(o.pendingResearchBps,100);assert.equal(dayPlan(o,v.book,koreaDay()+1).revenue,487601);
 await assertFails(updateDoc(doc(president,'companyOperations',cid),{cash:o.cash+1,pendingResearchBps:3000}));
});
test('research choice destruction updates both current and pending bonus without refund or double application',async()=>{
 const e={kind:'destroy',asset:'research',count:1};await publishEvent(admin,{id:'rd-damage',type:'choice',title:'R&D 손상',content:'대응하세요',deadline:new Date(Date.now()+86400000).toISOString(),options:[0,1,2].map(i=>({label:'선택 '+i,effect:e}))});
 const before=(await operationsView(president,cid)).ops;await chooseEvent(president,cid,'rd-damage',0);await chooseEvent(president,cid,'rd-damage',0);
 const o=(await operationsView(president,cid)).ops;assert.equal(o.research,1);assert.equal(o.activeResearchBps,250);assert.equal(o.pendingResearchBps,50);assert.equal(o.cash,before.cash);assert.equal(o.staffRevenue,before.staffRevenue);
});
test('six-center limit and workforce capacity are enforced by rules, including raw forged requests',async()=>{
 await setDoc(doc(admin,'economyConfig/main'),DEFAULT_CONFIG);await initializeOperations(president,'rd-cap');
 await invest(president,'rd-cap','factory');for(let i=0;i<5;i++)await invest(president,'rd-cap','employee');
 await assert.rejects(invest(president,'rd-cap','employee'),/수용/);
 // A bounded synthetic reserve isolates the six-center limit from the budget limit.
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'companyOperations/rd-cap'),{cash:10000000}));
 for(let i=0;i<6;i++)await invest(president,'rd-cap','research');await assert.rejects(invest(president,'rd-cap','research'),/최대 6개/);
 const o=(await operationsView(president,'rd-cap')).ops;assert.equal(o.pendingResearchBps,3000);assert.equal(o.research,6);
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'companyOperations/rd-cap'),{cash:10000000}));
 await assertFails(updateDoc(doc(president,'companyOperations/rd-cap'),{research:7,pendingResearchBps:3500,cash:10000000-DEFAULT_CONFIG.researchCost}));
});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,serverTimestamp,writeBatch} from 'firebase/firestore';
import {newOperations,invest,refundInvestment,koreaDay} from '../../client/economy.js';
import {applyEvent,publishEvent,chooseEvent} from '../../client/events.js';
import {emptyUnits} from '../../client/production-units.js';
import {initializeApp,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';
import {buildJob} from '../../scripts/build-jobs.mjs';
const rules=readFileSync('firestore.rules','utf8'),claims={email:'test@hcu.hs.kr',email_verified:true};
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('presidents buy new quantity model and refund only same-day exact original payment, atomic and once',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-units-refund',firestore:{rules}});
 try{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role] of [['boss','president'],['other','president'],['student','student'],['admin','admin']]){await setDoc(doc(db,'users',id),{role,active:true});await setDoc(doc(db,'assignments',id),{companyIds:id==='boss'?['one']:[]});}await setDoc(doc(db,'companies/one'),{name:'회사',status:'listed'});await setDoc(doc(db,'companyOperations/one'),{...newOperations(),cash:20000000});await setDoc(doc(db,'sparkBooks/one'),{issuerCash:0});});
 const db=env.authenticatedContext('boss',claims).firestore();
 for(const asset of ['factory','employee','equipment','research']){await invest(db,'one',asset);const o=(await getDoc(doc(db,'companyOperations/one'))).data();assert.equal(o.pendingUnits[asset],1);const id=o.lastInvestment;await refundInvestment(db,'one',id);const after=(await getDoc(doc(db,'companyOperations/one'))).data();assert.equal(after.cash,20000000);assert.equal(after.pendingUnits[asset],0);await refundInvestment(db,'one',id);assert.equal((await getDoc(doc(db,'companyOperations/one'))).data().cash,20000000);}
 await invest(db,'one','employee');const o=(await getDoc(doc(db,'companyOperations/one'))).data(),id=o.lastInvestment;
 await assertFails(refundInvestment(env.authenticatedContext('other',claims).firestore(),'one',id));await assertFails(refundInvestment(env.authenticatedContext('student',claims).firestore(),'one',id));
 const b=writeBatch(db);b.update(doc(db,'companyOperations/one'),{cash:20000001,employees:0,pendingUnits:emptyUnits(),lastRefund:id});b.set(doc(db,'companyOperations/one/refunds/'+id),{investmentId:id,asset:'employee',quantity:1,amount:100001,createdAt:serverTimestamp()});await assertFails(b.commit());
 await assertFails(updateDoc(doc(db,'companyOperations/one'),{cash:20000000,employees:0,pendingUnits:emptyUnits()}));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/one/investments/'+id),{createdAt:new Date((koreaDay()-1)*86400000)}));await assert.rejects(refundInvestment(db,'one',id));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/one/investments/'+id),{createdAt:new Date()}));
 const results=await Promise.allSettled([refundInvestment(db,'one',id),refundInvestment(db,'one',id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal((await getDoc(doc(db,'companyOperations/one'))).data().cash,20000000);
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/one'),{costEvents:{research:{eventId:'discount',percent:-50,startsAt:0,endsAt:Date.now()+86400000}}}));
 await invest(db,'one','research');let current=(await getDoc(doc(db,'companyOperations/one'))).data();assert.equal(current.cash,19750000);await refundInvestment(db,'one',current.lastInvestment);assert.equal((await getDoc(doc(db,'companyOperations/one'))).data().cash,20000000);
 await invest(db,'one','factory');current=(await getDoc(doc(db,'companyOperations/one'))).data();const factoryId=current.lastInvestment;
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/one'),{locked:true}));await assert.rejects(refundInvestment(db,'one',factoryId));await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/one'),{locked:false}));
 const admin=env.authenticatedContext('admin',claims).firestore(),effect={kind:'destroy',asset:'factory',count:1};await publishEvent(admin,{id:'destroy-choice',type:'choice',title:'파괴',content:'테스트',deadline:new Date(Date.now()+86400000).toISOString(),companyId:'one',options:[0,1,2].map(i=>({label:String(i),effect}))});await chooseEvent(db,'one','destroy-choice',0);
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'events/destroy-choice'),{endsAt:new Date(Date.now()-1000)}));await applyEvent(db,'one','destroy-choice',0);assert.equal((await getDoc(doc(db,'companyOperations/one'))).data().factory,0);await assert.rejects(refundInvestment(db,'one',factoryId));
 }finally{await env.cleanup();}
});
test('count migration preserves cash/inventory and repeats safely; settlement matures counts',async()=>{
 writeFileSync('.generated-units-entry.mjs',"export {migrateProductionUnits} from './server/production-units-migration.js';export {settleDay} from './client/economy.js';");await buildJob('.generated-units-entry.mjs','.generated-units-job.mjs');const job=await import('../../.generated-units-job.mjs?'+Date.now());
 const app=initializeApp({projectId:'demo-units-migration'},'units-migration'),db=getFirestore(app);
 try{await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-units-migration/databases/(default)/documents',{method:'DELETE'});const day=koreaDay(),legacy={...newOperations(),cash:7890000,dividendModel:'legacy',dividendBps:1000,lastSettledDay:day-1,factory:1,employees:2,research:8,revenue:999999,pendingRevenue:999999,pendingDay:day,production:{factory:999999,equipment:0,research:0},pendingProduction:{factory:999999,equipment:0,research:0}};delete legacy.productionModel;delete legacy.pendingUnits;
 await db.doc('companies/one').set({name:'회사',status:'listed'});await db.doc('companyOperations/one').set(legacy);await db.doc('sparkBooks/one').set({issuerCash:0,issuedShares:1000,treasuryShares:1000});await db.doc('companyOperations/one/investments/today').set({asset:'employee',quantity:1,cost:100000,activeFromDay:day,createdAt:new Date()});
 const first=await job.migrateProductionUnits(db);assert.equal(first.updated,1);let o=(await db.doc('companyOperations/one').get()).data();assert.equal(o.cash,7890000);assert.equal(o.factory,1);assert.equal(o.research,8);assert.equal(o.pendingUnits.employee,1);assert.equal((await job.migrateProductionUnits(db)).updated,0);
 await job.settleDay(db,'one');o=(await db.doc('companyOperations/one').get()).data();assert.deepEqual(o.pendingUnits,emptyUnits());assert.equal(o.cash,7890000+115200);assert.equal(o.research,8);
 }finally{await db.terminate();await deleteApp(app);}
});

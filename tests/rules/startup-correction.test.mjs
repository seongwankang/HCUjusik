import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {writeFile} from 'node:fs/promises';
import {buildJob} from '../../scripts/build-jobs.mjs';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('startup correction reverses only revenue and actual dividends atomically, preserves investments, and is retry safe',async()=>{
 await writeFile('.generated-correction-entry.mjs',"export {correctStartupSettlement} from './server/settlement-correction.js';export {initializeOperations,dayPlan} from './client/economy.js';");
 await buildJob('.generated-correction-entry.mjs','.generated-correction.mjs');const job=await import('../../.generated-correction.mjs?'+Date.now());
 const app=initializeApp({projectId:'demo-startup-correction'},'startup-correction'),db=getFirestore(app),day=20747;
 try{
 await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-startup-correction/databases/(default)/documents',{method:'DELETE'});
 await db.doc('events/startup').set({title:'창업',type:'choice',targets:['one','two','three','four'],endsAt:new Date('2026-10-21T04:30:00Z')});
 for(const cid of ['one','two','three','four']){
  await db.doc('companyOperations/'+cid).set({cash:1234567,lastSettledDay:day,settlementCount:1,locked:false,paidAmount:40000,pendingRevenue:2000000,factory:5});
  await db.doc('companyOperations/'+cid+'/days/d'+day).set({day,revenue:400000,dividend:40000,retained:360000,perShare:40,sold:1000,treasuryDividend:0,createdAt:new Date('2026-10-21T04:49:00Z')});
  await db.doc('companyEffects/'+cid+'/items/startup').set({effect:{kind:'grant',asset:'equipment'},result:{count:1},appliedAt:new Date('2026-10-21T04:48:00Z')});
  await db.doc('companyOperations/'+cid+'/days/d'+day+'/payouts/student').set({shares:1000,amount:40000});
  await db.doc('sparkAccounts/student/dividends/'+cid+'_d'+day).set({companyId:cid,shares:1000,amount:40000});
 }
 await db.doc('sparkAccounts/student').set({cash:2000000,reservedCash:200000,version:7,positions:{one:1000}});
 await db.doc('sparkAccounts/student').update({cash:100});await assert.rejects(job.correctStartupSettlement(db),/already spent/);assert.equal((await db.doc('companyOperations/one').get()).data().cash,1234567);assert.equal((await db.doc('companyOperations/one/days/d'+day).get()).data().revenue,400000);
 await db.doc('sparkAccounts/student').update({cash:2000000});
 const r=await job.correctStartupSettlement(db);assert.equal(r.reversedRevenue,1600000);assert.equal(r.reversedDividends,160000);
 const a=(await db.doc('sparkAccounts/student').get()).data();assert.equal(a.cash,1840000);assert.equal(a.reservedCash,200000);assert.equal(a.version,8);assert.deepEqual(a.positions,{one:1000});
 const o=(await db.doc('companyOperations/one').get()).data();assert.equal(o.cash,874567);assert.equal(o.factory,5);assert.equal(o.pendingRevenue,2000000);assert.equal(o.lastSettledDay,day);
 assert.equal((await db.doc('companyOperations/one/days/d'+day).get()).data().revenue,0);assert.equal((await db.doc('sparkAccounts/student/dividends/one_d'+day).get()).data().amount,0);
 assert.ok((await db.collection('settlementCorrections/startup-cutoff-'+day+'/documents').get()).size>0);
 assert.equal((await job.correctStartupSettlement(db)).status,'complete');assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,1840000);
 // New midday accounts skip today's settlement even after a grant becomes active.
 await job.initializeOperations(db,'fresh');const fresh=(await db.doc('companyOperations/fresh').get()).data();assert.equal(fresh.lastSettledDay,Math.floor((Date.now()+32400000)/86400000));
 }finally{await db.terminate();await deleteApp(app);}
});

test('school president initialization uses the server cutoff and cannot backdate a new account',async()=>{
 const {initializeTestEnvironment,assertFails}=await import('@firebase/rules-unit-testing');const {doc,setDoc,getDoc}=await import('firebase/firestore');const {initializeOperations,initialOperations,koreaDay}=await import('../../client/economy.js');
 const env=await initializeTestEnvironment({projectId:'demo-startup-rules',firestore:{rules:(await import('node:fs')).readFileSync('firestore.rules','utf8')}});
 try{await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users/boss'),{role:'president',active:true});await setDoc(doc(c.firestore(),'assignments/boss'),{companyIds:['fresh','backdated']});for(const id of ['fresh','backdated'])await setDoc(doc(c.firestore(),'companies',id),{status:'listed'});});
 const db=env.authenticatedContext('boss',{email:'boss@hcu.hs.kr',email_verified:true}).firestore();await initializeOperations(db,'fresh');assert.equal((await getDoc(doc(db,'companyOperations/fresh'))).data().lastSettledDay,koreaDay());await assertFails(setDoc(doc(db,'companyOperations/backdated'),initialOperations()));
 }finally{await env.cleanup();}
});

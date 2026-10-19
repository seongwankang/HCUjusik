import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc} from 'firebase/firestore';
import {readFileSync} from 'node:fs';
import {resetMarket,RESET_ID} from '../../server/market-reset.js';
import {runScheduledEconomy} from '../../server/scheduled-economy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('reset backs up nested data privately, preserves identities/config, restores starting assets and is idempotent',async()=>{
 const projectId='demo-market-reset',env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}}),app=initializeApp({projectId},'market-reset'),db=getFirestore(app);
 try{
  await env.clearFirestore();
  const paused=await runScheduledEconomy(db,{now:Date.parse('2026-10-20T07:55:00+09:00'),settle:()=>assert.fail('paused'),publish:()=>assert.fail('paused')});assert.equal(paused.maintenance,true);assert.equal(paused.settled,0);
  await db.doc('users/student').set({role:'student',active:true,displayName:'test'});await db.doc('users/admin').set({role:'admin',active:true,displayName:'staff'});
  await db.doc('sparkAccounts/student').set({cash:23,positions:{a:9}});await db.doc('sparkAccounts/student/fills/old').set({quantity:9});
  await db.doc('news/n/comments/c').set({content:'old'});await db.doc('companies/a').set({name:'old'});await db.doc('economyConfig/main').set({version:4});
  const result=await resetMarket(db);assert.equal(result.users,2);
  assert.equal((await db.doc('companies/a').get()).exists,false);assert.equal((await db.doc('news/n/comments/c').get()).exists,false);
  assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,1000000);assert.deepEqual((await db.doc('sparkAccounts/student').get()).data().positions,{});
  assert.equal((await db.doc('sparkAccounts/student/fills/old').get()).exists,false);assert.equal((await db.doc('users/admin').get()).data().role,'admin');assert.equal((await db.doc('economyConfig/main').get()).data().version,4);
  const saved=await db.collection('resetBackups/'+RESET_ID+'/documents').get();assert.equal(saved.docs.find(s=>s.data().path==='sparkAccounts/student').data().data.cash,23);
  const client=env.authenticatedContext('student',{email:'test@hcu.hs.kr',email_verified:true}).firestore();await assertFails(getDoc(doc(client,'resetBackups',RESET_ID)));
  assert.equal((await db.doc('systemMaintenance/reset').get()).exists,false);
  await db.doc('sparkAccounts/student').update({cash:999});assert.equal((await resetMarket(db)).status,'complete');assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,999);
 }finally{await db.terminate();await env.cleanup();await deleteApp(app);}
});

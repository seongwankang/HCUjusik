import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {getDoc,doc} from 'firebase/firestore';
import {readFileSync} from 'node:fs';
import {increaseInitialCapital,CAPITAL_MIGRATION} from '../../server/initial-capital-migration.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('capital increase is atomic and exactly once, retains trades/reservations, skips admins and newly funded users',async()=>{
 const projectId='demo-initial-capital',env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}}),app=initializeApp({projectId},'capital-test'),db=getFirestore(app);
 try{
  await env.clearFirestore();
  for(const [uid,role,active]of [['student','student',true],['president','president',true],['inactive','student',false],['admin','admin',true],['new','student',true]])await db.doc('users/'+uid).set({role,active,displayName:uid});
  const original={cash:740000,reservedCash:230000,positions:{one:25},reservedPositions:{one:4},version:7,lastMarket:'one'};
  await db.doc('sparkAccounts/student').set(original);await db.doc('portfolios/student').set({cash:1000000,holdings:[],version:0});
  await db.doc('sparkAccounts/admin').set(original);
  await db.doc('portfolios/new').set({cash:2000000,holdings:[],version:0,initialCapital:2000000});
  await Promise.all([increaseInitialCapital(db),increaseInitialCapital(db)]);
  assert.deepEqual((await db.doc('sparkAccounts/student').get()).data(),{...original,cash:1740000,version:8});
  assert.equal((await db.doc('sparkAccounts/president').get()).data().cash,2000000);
  assert.equal((await db.doc('sparkAccounts/inactive').get()).data().cash,2000000);
  assert.deepEqual((await db.doc('sparkAccounts/admin').get()).data(),original);
  assert.equal((await db.doc('sparkAccounts/new').get()).exists,false);
  const receipt=db.doc('capitalAdjustments/'+CAPITAL_MIGRATION+'/users/student');assert.deepEqual((await receipt.get()).data().beforeAccount,original);
  await db.doc('sparkAccounts/student').update({cash:1500000});await increaseInitialCapital(db);assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,1500000);
  const student=env.authenticatedContext('student',{email:'test@hcu.hs.kr',email_verified:true}).firestore();await assertFails(getDoc(doc(student,receipt.path)));
 }finally{await db.terminate();await env.cleanup();await deleteApp(app);}
});

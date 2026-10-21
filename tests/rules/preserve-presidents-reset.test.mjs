import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc} from 'firebase/firestore';
import {readFileSync} from 'node:fs';
import {resetPreservingPresidents,PRESERVED_RESET_ID} from '../../server/preserve-presidents-reset.js';
import {increaseInitialCapital} from '../../server/initial-capital-migration.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');

test('preserves company identity and presidents; backs up and resets all trading and operations data exactly once',async()=>{
 const projectId='demo-preserve-reset',env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}}),app=initializeApp({projectId},'preserve-reset'),db=getFirestore(app);
 try{
  await env.clearFirestore();
  for(const [path,data] of Object.entries({
   'users/student':{role:'student',displayName:'S',active:true},'users/president':{role:'president',displayName:'P',active:true},'users/admin':{role:'admin',active:true},
   'assignments/president':{companyIds:['a']},'companyLeadership/main':{companies:{a:['P']}},
   'companies/a':{name:'A',ticker:'A',category:'제조',description:'소개',status:'listed',referencePrice:50000,issuedShares:1000,companyCash:9,dailyRevenue:9},
   'sparkBooks/a':{version:12,correctionRevision:3,treasuryShares:900,issuerCash:1000000,displayPriceAnchor:{price:40000,version:12}},
   'sparkBooks/a/trades/t':{price:50000},'sparkAccounts/student':{cash:23,positions:{a:100},version:4},'sparkAccounts/student/orders/o':{price:50000},
   'companyOperations/a':{cash:-100,employees:10,factory:5,revenue:400000},'companyOperations/a/days/d/payouts/s':{amount:100},
   'companySpies/a/agents/x':{targetId:'b'},'events/e':{type:'random'},'news/n/comments/c':{body:'comment'},
   'exchangeState/limit-v1':{accounts:{student:{cash:999}}},
   'economyConfig/main':{version:4},'spyPolicy/main':{bps:250},'tradeCorrections/history':{status:'complete'}
  }))await db.doc(path).set(data);
  const publish=async()=>{assert.equal((await db.doc('systemMaintenance/reset').get()).exists,true);await db.doc('leaderboards/cash').set({participants:2});};
  const result=await resetPreservingPresidents(db,{publish,now:Date.parse('2026-10-22T12:00:00+09:00')});
  assert.deepEqual(result,{status:'reset',users:3,companies:1});
  assert.deepEqual((await db.doc('assignments/president').get()).data(),{companyIds:['a']});
  assert.deepEqual((await db.doc('companyLeadership/main').get()).data(),{companies:{a:['P']}});
  assert.equal((await db.doc('users/president').get()).data().role,'president');
  const company=(await db.doc('companies/a').get()).data();assert.equal(company.name,'A');assert.equal(company.description,'소개');assert.equal(company.category,'제조');assert.equal(company.referencePrice,10000);assert.equal(company.companyCash,0);
  const book=(await db.doc('sparkBooks/a').get()).data();assert.equal(book.treasuryShares,1000);assert.equal(book.issuerCash,0);assert.equal(book.version,13);assert.equal(book.correctionRevision,4);assert.equal(book.displayPriceAnchor,undefined);
  for(const id of ['student','president','admin']){const account=(await db.doc('sparkAccounts/'+id).get()).data();assert.equal(account.cash,1000000);assert.equal(account.reservedCash,0);assert.deepEqual(account.positions,{});assert.deepEqual(account.reservedPositions,{});assert.equal((await db.doc('portfolios/'+id).get()).data().initialCapital,1000000);}
  const ops=(await db.doc('companyOperations/a').get()).data();assert.equal(ops.cash,0);assert.equal(ops.factory,0);assert.equal(ops.employees,0);assert.equal(ops.revenue,0);assert.equal(ops.lastSettledDay,20748);
  for(const path of ['sparkBooks/a/trades/t','sparkAccounts/student/orders/o','companyOperations/a/days/d/payouts/s','companySpies/a/agents/x','events/e','news/n/comments/c','exchangeState/limit-v1'])assert.equal((await db.doc(path).get()).exists,false,path);
  assert.equal((await db.doc('economyConfig/main').get()).data().version,4);assert.equal((await db.doc('tradeCorrections/history').get()).exists,true);
  const receipt=db.doc('resetBackups/'+PRESERVED_RESET_ID);assert.equal((await receipt.get()).data().status,'complete');
  const saved=(await receipt.collection('documents').get()).docs.map(s=>s.data());assert.equal(saved.find(s=>s.path==='sparkAccounts/student').data.cash,23);assert.equal(saved.find(s=>s.path==='companyOperations/a/days/d/payouts/s').data.amount,100);
  const client=env.authenticatedContext('student',{email:'test@hcu.hs.kr',email_verified:true}).firestore();await assertFails(getDoc(doc(client,'resetBackups',PRESERVED_RESET_ID)));
  assert.equal((await db.doc('systemMaintenance/reset').get()).exists,false);
  assert.equal((await increaseInitialCapital(db)).superseded,true);assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,1000000);
  await db.doc('sparkAccounts/student').update({cash:999});assert.deepEqual(await resetPreservingPresidents(db,{publish}),{status:'complete'});assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,999);
 }finally{await db.terminate();await env.cleanup();await deleteApp(app);}
});

test('backup failure does not delete data and leaves maintenance locked',async()=>{
 const projectId='demo-preserve-reset-failure',app=initializeApp({projectId},'preserve-reset-failure'),db=getFirestore(app);
 try{
  await db.doc('sparkAccounts/student').set({cash:456});
  const facade={doc:db.doc.bind(db),runTransaction:db.runTransaction.bind(db),collection:()=>({listDocuments:async()=>{throw Error('backup unavailable');}}),recursiveDelete:()=>assert.fail('must not delete before backup completes')};
  await assert.rejects(resetPreservingPresidents(facade,{publish:()=>assert.fail('must not publish')}),/backup unavailable/);
  assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,456);assert.equal((await db.doc('systemMaintenance/reset').get()).data().resetId,PRESERVED_RESET_ID);
 }finally{await db.terminate();await deleteApp(app);}
});

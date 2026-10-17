import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {writeFile} from 'node:fs/promises';
import {buildJob} from '../../scripts/build-jobs.mjs';
import {initialOperations,koreaDay} from '../../client/economy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let app,db,job;
before(async()=>{
 await writeFile('.generated-scheduled-test-entry.mjs',"export {runScheduledEconomy} from './server/scheduled-economy.js';export {beginDay,payHolder} from './client/economy.js';");
 await buildJob('.generated-scheduled-test-entry.mjs','.generated-scheduled-test.mjs');job=await import('../../.generated-scheduled-test.mjs?test='+Date.now());
 app=initializeApp({projectId:'demo-scheduled-economy'},'scheduled-test');db=getFirestore(app);
 await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-scheduled-economy/databases/(default)/documents',{method:'DELETE'});
 await db.doc('users/student').set({displayName:'테스트',role:'student',active:true});await db.doc('users/operator').set({displayName:'관리자',role:'admin',active:true});
 await seed('one');await db.doc('sparkAccounts/student').set({cash:1000000,positions:{one:10},reservedCash:0,reservedPositions:{},version:0,lastMarket:'one'});
});
async function seed(cid){await db.doc('companies/'+cid).set({name:cid,status:'listed',referencePrice:10000});await db.doc('companyOperations/'+cid).set({...initialOperations(),factory:1,revenue:1000,dividendBps:5000,production:{factory:1000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});await db.doc('sparkBooks/'+cid).set({issuerCash:0,issuedShares:10,treasuryShares:0});}
after(async()=>{await db?.terminate();if(app)await deleteApp(app);});
test('trusted job pays after 09:00, skips repeats and publishes only an asset projection',async()=>{
 const day=koreaDay();let r=await job.runScheduledEconomy(db,{now:day*86400000-1});assert.equal(r.settled,0);assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,1000000);
 r=await job.runScheduledEconomy(db,{now:day*86400000+1});assert.equal(r.settled,1);assert.deepEqual(r.failed,[]);assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,1001000);
 const board=(await db.doc('leaderboards/cash').get()).data();assert.deepEqual(board.entries,[{name:'테스트',cash:1001000,stockValue:100000,totalValue:1101000,rank:1}]);
 r=await job.runScheduledEconomy(db,{now:day*86400000+2});assert.equal(r.settled,0);assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,1001000);assert.equal((await db.doc('companyOperations/one').get()).data().revenue,1000);
});
test('interrupted payouts resume without duplicating receipts; one broken company cannot stop others',async()=>{
 await seed('resume');await db.doc('sparkAccounts/student').update({'positions.resume':10});const key=await job.beginDay(db,'resume');await job.payHolder(db,'resume',key,'student');
 await seed('broken');await db.doc('companyOperations/broken').update({pendingEvent:'missing'});
 const before=(await db.doc('sparkAccounts/student').get()).data().cash;
 const r=await job.runScheduledEconomy(db,{now:koreaDay()*86400000+1});assert.equal(r.resumed,1);assert.deepEqual(r.failed,['broken']);assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,before);assert.equal((await db.doc('companyOperations/resume').get()).data().locked,false);
});

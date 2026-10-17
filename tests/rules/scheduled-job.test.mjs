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
 await writeFile('.generated-scheduled-test-entry.mjs',"export {runScheduledEconomy} from './server/scheduled-economy.js';export {runDueChoiceEvents} from './server/choice-events.js';export {beginDay,payHolder} from './client/economy.js';");
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

test('deadline queue waits, applies destruction exactly once and retries locked targets without selecting for absent companies',async()=>{
 const cid='deadline-company',eid='deadline-event',future=new Date(Date.now()+60000);await seed(cid);await db.doc('companyOperations/'+cid).update({factory:2,revenue:2000,production:{factory:2000,equipment:0,research:0}});
 await db.doc('events/'+eid).set({type:'choice',targets:[cid,'no-choice'],endsAt:future,startsAt:new Date(),options:['a','b','c']});await db.doc('eventOutcomes/'+eid+'/options/0').set({effect:{kind:'destroy',asset:'factory',count:1,percent:0,hours:0}});await db.doc('companyChoices/'+cid+'/items/'+eid).set({option:0,chosenAt:new Date(Date.now()-60000)});await db.doc('eventQueue/'+eid).set({endsAt:future});
 let r=await job.runDueChoiceEvents(db);assert.equal(r.processed,0);assert.equal((await db.doc('companyEffects/'+cid+'/items/'+eid).get()).exists,false);
 const deadline=new Date(Date.now()-1000);await db.doc('events/'+eid).update({endsAt:deadline});await db.doc('eventQueue/'+eid).update({endsAt:deadline});await db.doc('companyOperations/'+cid).update({locked:true});r=await job.runDueChoiceEvents(db);assert.equal(r.failed,1);assert.equal((await db.doc('eventQueue/'+eid).get()).exists,true);
 await db.doc('companyOperations/'+cid).update({locked:false});r=await job.runDueChoiceEvents(db);assert.equal(r.processed,1);assert.equal((await db.doc('companyOperations/'+cid).get()).data().factory,1);assert.equal((await db.doc('companyEffects/'+cid+'/items/'+eid).get()).data().effectiveAt.toMillis(),deadline.getTime());assert.equal((await db.doc('companyEffects/no-choice/items/'+eid).get()).exists,false);assert.equal((await db.doc('eventQueue/'+eid).get()).exists,false);
 await job.runDueChoiceEvents(db);assert.equal((await db.doc('companyOperations/'+cid).get()).data().factory,1);
});

test('overdue choice cannot deadlock a previously interrupted settlement',async()=>{
 const cid='locked-choice-recovery',eid='locked-choice-event';await seed(cid);await db.doc('sparkBooks/'+cid).update({treasuryShares:10});const future=new Date(Date.now()+60000);await db.doc('events/'+eid).set({type:'choice',targets:[cid],endsAt:future,startsAt:new Date(),options:['a','b','c']});await db.doc('eventOutcomes/'+eid+'/options/0').set({effect:{kind:'destroy',asset:'factory',count:1,percent:0,hours:0}});await db.doc('companyChoices/'+cid+'/items/'+eid).set({option:0,chosenAt:new Date()});await db.doc('eventQueue/'+eid).set({endsAt:future});await job.beginDay(db,cid);
 const deadline=new Date(Date.now()-1000);await db.doc('events/'+eid).update({endsAt:deadline});await db.doc('eventQueue/'+eid).update({endsAt:deadline});await job.runScheduledEconomy(db);assert.equal((await db.doc('companyOperations/'+cid).get()).data().locked,false);assert.equal((await db.doc('eventQueue/'+eid).get()).exists,true);
 await job.runScheduledEconomy(db);assert.equal((await db.doc('companyOperations/'+cid).get()).data().factory,0);assert.equal((await db.doc('eventQueue/'+eid).get()).exists,false);
});

test('trusted deadline worker applies new cash, grant, discount and dividend-cap choices idempotently',async()=>{
 const cid='new-effects';await seed(cid);
 const endsAt=new Date(Date.now()-1000),startsAt=new Date(Date.now()-2000);
 const effects=[{kind:'cash',asset:'factory',percent:0,count:0,hours:0,amount:500000},{kind:'grant',asset:'equipment',percent:0,count:1,hours:0},{kind:'cost',asset:'employee',percent:-20,count:0,hours:24},{kind:'dividendCap',asset:'factory',percent:20,count:0,hours:24}];
 for(let i=0;i<effects.length;i++){
  const id='expanded-'+i;
  await db.doc('events/'+id).set({type:'choice',title:id,content:'상황',targets:[cid],options:['1','2','3'],startsAt,endsAt});
  await db.doc('eventOutcomes/'+id+'/options/0').set({effect:effects[i]});
  await db.doc('companyChoices/'+cid+'/items/'+id).set({option:0,chosenAt:startsAt});
  await db.doc('eventQueue/'+id).set({endsAt});
 }
 const r=await job.runDueChoiceEvents(db);assert.equal(r.processed,4);assert.equal(r.failed,0);
 const o=(await db.doc('companyOperations/'+cid).get()).data();assert.equal(o.cash,500000);assert.equal(o.equipment,1);assert.equal(o.revenue,201000);assert.equal(o.costEvents.employee.percent,-20);assert.equal(o.dividendLimit.percent,20);
 const again=await job.runDueChoiceEvents(db);assert.equal(again.processed,0);assert.equal((await db.doc('companyOperations/'+cid).get()).data().cash,500000);
});

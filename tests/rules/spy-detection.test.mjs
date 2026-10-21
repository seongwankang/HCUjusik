import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {readFileSync} from 'node:fs';import {writeFile} from 'node:fs/promises';
import {detectDailySpy} from '../../server/spy-detection.js';
import {initialOperations,koreaDay} from '../../client/economy.js';
import {activeSpies} from '../../client/spy-model.js';
import {settlementTime} from '../../client/settlement-time.js';
import {hireSpy} from '../../client/spies.js';
import {buildJob} from '../../scripts/build-jobs.mjs';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
const projectId='demo-spy-detection',day=koreaDay(),now=Math.max(Date.now(),settlementTime(day)+1),key='preflight-d'+day;
let app,db,env,job;
before(async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}});
 app=initializeApp({projectId},'spy-detection');db=getFirestore(app);
 await writeFile('.generated-spy-detection-entry.mjs',"export {runScheduledEconomy} from './server/scheduled-economy.js';export {settleDay} from './client/economy.js';");await buildJob('.generated-spy-detection-entry.mjs','.generated-spy-detection-job.mjs');const loaded=await import('../../.generated-spy-detection-job.mjs?'+Date.now());job={...loaded,runScheduledEconomy:(db,options={})=>loaded.runScheduledEconomy(db,{isPaused:()=>false,prepareLimits:async()=>{},...options})};
});
beforeEach(async()=>{await env.clearFirestore();for(const [id,revenue]of [['owner',100000],['target',2000000]]){
 await db.doc('companies/'+id).set({name:id==='owner'?'파견 기업':'대상 기업',ticker:id,status:'listed',referencePrice:10000,issuedShares:1000});
 await db.doc('companyOperations/'+id).set({...initialOperations(),cash:10000,factory:1,revenue,production:{factory:revenue,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});
 await db.doc('sparkBooks/'+id).set({issuerCash:0,issuedShares:1000,treasuryShares:1000});
 }});
after(async()=>{await db?.terminate();await env?.cleanup();if(app)await deleteApp(app);});
async function seed(agents=1,{legacy=false}={}){const entries=Object.fromEntries(Array.from({length:agents},(_,n)=>[String(n),{companyId:'owner',targetId:'target',hireId:'agent-'+n,cost:1000000,bps:50,settlements:0,remaining:1,activeFromDay:day,lastRoundDay:0,createdAt:Timestamp.fromMillis(now-1000)}]));const latest=entries[String(agents-1)];await db.doc('companySpies/owner').set({...latest,...(!legacy?{slot:String(agents-1),agents:entries}:{})});await db.doc('spyRegistry/main').set({version:agents,companyId:'owner',hireId:latest.hireId});return entries;}
const draw=extra=>detectDailySpy(db,{now,pick:()=>0,...extra});
test('not due leaves no marker; no agents produces no news and is final for that day',async()=>{
 assert.equal((await draw({now:settlementTime(day)-1})).status,'not-due');assert.equal((await db.doc('spyRounds/'+key).get()).exists,false);
 assert.equal((await draw()).status,'empty');await seed();assert.equal((await draw()).status,'empty');assert.equal((await db.collection('news').get()).size,0);assert.equal(activeSpies((await db.doc('companySpies/owner').get()).data()).length,1);
});
test('one agent is removed; 150 percent compensation conserves funds, allows negative cash and publishes once',async()=>{
 await seed(3);const first=await draw({pick:n=>{assert.equal(n,2);return 0;}});assert.equal(first.slot,'0');assert.equal(first.intended,100000);assert.equal(first.compensation,150000);
 const s=(await db.doc('companySpies/owner').get()).data();assert.equal(activeSpies(s).length,1);assert.equal(s.agents['1'].remaining,1);assert.equal(s.agents['0'].remaining,0);
 assert.equal((await db.doc('companyOperations/owner').get()).data().cash,-140000);assert.equal((await db.doc('companyOperations/target').get()).data().cash,160000);assert.equal((await db.doc('spyRegistry/main').get()).data().version,5);
 const news=await db.collection('news').get();assert.equal(news.size,1);assert.match(news.docs[0].data().content,/파견 기업/);assert.match(news.docs[0].data().content,/대상 기업/);assert.match(news.docs[0].data().content,/150,000원/);
 const again=await draw({pick:()=>assert.fail('must not draw twice')});assert.equal(again.repeated,true);assert.equal((await db.doc('companyOperations/owner').get()).data().cash,-140000);assert.equal((await db.collection('news').get()).size,1);
});
test('concurrent draws remove and compensate exactly one individual',async()=>{
 await seed(2);const results=await Promise.all([draw(),draw({pick:()=>0})]);assert.equal(results.filter(r=>!r.repeated).length,1);assert.equal(activeSpies((await db.doc('companySpies/owner').get()).data()).length,1);assert.equal((await db.doc('companyOperations/owner').get()).data().cash,-140000);assert.equal((await db.collection('news').get()).size,1);
});
test('news ID conflict rolls back agent removal, funds, registry and marker together',async()=>{
 await seed();await db.doc('news/spy-detection-d'+day).set({title:'기존 기사'});await assert.rejects(draw());assert.equal(activeSpies((await db.doc('companySpies/owner').get()).data()).length,1);assert.equal((await db.doc('companyOperations/owner').get()).data().cash,10000);assert.equal((await db.doc('spyRounds/'+key).get()).exists,false);assert.equal((await db.doc('news/spy-detection-d'+day).get()).data().title,'기존 기사');
});
test('revenue includes matured investments and applied events, and legacy last agent becomes inactive',async()=>{
 await seed(1,{legacy:true});await db.doc('companyOperations/target').update({pendingRevenue:1000000,pendingDay:day,pendingProduction:{factory:1000000,equipment:0,research:0}});
 await db.doc('companyEffects/target/items/reduced').set({effect:{kind:'revenue',percent:-20,hours:24},appliedAt:Timestamp.fromMillis(now-1000)});
 const r=await draw();assert.equal(r.targetRevenue,4800000);assert.equal(r.compensation,180000);const s=(await db.doc('companySpies/owner').get()).data();assert.equal(s.remaining,0);assert.equal(activeSpies(s).length,0);
});
test('already started settlement is not charged retrospectively; old locks and pending events wait',async()=>{
 await seed();await db.doc('companyOperations/owner').update({locked:true,currentDay:'d'+(day-1)});assert.equal((await draw()).status,'waiting');assert.equal((await draw({blocked:new Set(['target'])})).status,'waiting');assert.equal((await db.doc('spyRounds/'+key).get()).exists,false);
 await db.doc('companyOperations/owner').update({locked:false,lastSettledDay:day});assert.equal((await draw()).status,'skipped');assert.equal((await db.collection('news').get()).size,0);assert.equal((await db.doc('companyOperations/owner').get()).data().cash,10000);
});
test('removed slot can be hired again only with a new full hiring payment under existing rules',async()=>{
 await seed();await db.doc('companyOperations/owner').update({cash:3000000});await draw();
 await db.doc('users/boss').set({displayName:'사장',role:'president',active:true});await db.doc('assignments/boss').set({companyIds:['owner']});
 const client=env.authenticatedContext('boss',{email:'boss@hcu.hs.kr',email_verified:true}).firestore();await hireSpy(client,'owner','target');
 const s=(await db.doc('companySpies/owner').get()).data();assert.equal(activeSpies(s).length,1);assert.notEqual(s.hireId,'agent-0');assert.equal((await db.doc('companyOperations/owner').get()).data().cash,1850000);
});
test('policy-only mode preserves the earliest two hires and history, ends extras without refunds or settlement',async()=>{
 await seed(3);await db.doc('companySpies/owner').update({'agents.1.createdAt':Timestamp.fromMillis(now-10000)});
 await db.doc('companySpies/owner/hires/agent-2').set({cost:1000000});
 const first=await job.runScheduledEconomy(db,{mode:'spies-policy-only',settle:()=>assert.fail('no settlement'),publish:()=>assert.fail('no ranking')});
 assert.equal(first.spyPolicy.retired,1);const s=(await db.doc('companySpies/owner').get()).data();assert.equal(activeSpies(s).length,2);assert.equal(s.hireId,'agent-1');assert.equal(s.bps,250);assert.equal(s.agents['0'].remaining,1);assert.equal(s.agents['2'].remaining,0);
 assert.equal((await db.doc('companyOperations/owner').get()).data().cash,10000);assert.equal((await db.doc('companySpies/owner/hires/agent-2').get()).exists,true);assert.equal((await db.collection('news').get()).size,0);assert.equal((await db.doc('spyRounds/'+key).get()).exists,false);
 const again=await job.runScheduledEconomy(db,{mode:'spies-policy-only'});assert.equal(again.spyPolicy.status,'complete');assert.equal((await db.doc('companyOperations/owner').get()).data().cash,10000);
});
test('scheduled draw, compensation and news finish before ordinary payouts; detected agent cannot steal',async()=>{
 await seed();let entered=0;
 const r=await job.runScheduledEconomy(db,{now,detect:(d,o)=>detectDailySpy(d,{...o,pick:()=>0}),settle:async(d,cid)=>{entered++;assert.equal((await db.doc('spyRounds/'+key).get()).data().status,'detected');assert.equal((await db.collection('news').get()).size,1);assert.equal(activeSpies((await db.doc('companySpies/owner').get()).data()).length,0);return job.settleDay(d,cid);}});
 assert.equal(entered,2);assert.deepEqual(r.failed,[]);assert.equal(r.spyDetection.status,'detected');assert.equal(r.spies.status,'empty');assert.equal((await db.doc('companyOperations/owner').get()).data().cash,60000);assert.equal((await db.doc('companyOperations/target').get()).data().cash,4160000);
});

test('two-agent migration never revives a previously retired paid agent',async()=>{
 await seed(2);await db.doc('companySpies/owner').update({'agents.1.remaining':0});
 const r=await job.runScheduledEconomy(db,{mode:'spies-policy-only'});assert.equal(r.spyPolicy.retired,0);
 const s=(await db.doc('companySpies/owner').get()).data();assert.equal(activeSpies(s).length,1);assert.equal(s.agents['0'].bps,250);assert.equal(s.agents['1'].remaining,0);
 assert.equal((await db.doc('companyOperations/owner').get()).data().cash,10000);
});

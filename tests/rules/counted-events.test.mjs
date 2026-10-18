import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,Timestamp,writeBatch,serverTimestamp} from 'firebase/firestore';
import {publishEvent,applyRandomEvent,chooseEvent,applyEvent,eventCompanyView} from '../../client/events.js';
import {initialOperations,settleDay,beginDay,koreaDay,invest} from '../../client/economy.js';
import {investmentCost} from '../../client/event-model.js';import {DEFAULT_CONFIG} from '../../client/business-policy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('counted random/choice effects settle N times, isolate companies, enforce costs and never consume retries',async()=>{
 const source=readFileSync('firestore.rules','utf8'),projectId='demo-counted-events',realNow=Date.now,day=koreaDay(realNow()),environments=[];
 const env=await initializeTestEnvironment({projectId,firestore:{rules:source}});environments.push(env);
 try{
 await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();for(const [uid,role]of [['admin','admin'],['president','president'],['student','student']])await setDoc(doc(db,'users',uid),{displayName:'synthetic '+uid,role,active:true});await setDoc(doc(db,'assignments/president'),{companyIds:['one','two']});
 for(const cid of ['one','two']){await setDoc(doc(db,'companies',cid),{status:'listed'});await setDoc(doc(db,'companyOperations',cid),{...initialOperations(),factory:1,revenue:10000,dividendBps:5000,production:{factory:10000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});await setDoc(doc(db,'sparkBooks',cid),{issuerCash:10000000,issuedShares:1000,treasuryShares:0});}await setDoc(doc(db,'sparkAccounts/student'),{cash:1000000,reservedCash:0,positions:{one:1000,two:1000},reservedPositions:{},version:0,lastMarket:''});});
 const claims={email:'test@hcu.hs.kr',email_verified:true},admin=env.authenticatedContext('admin',claims).firestore(),p=env.authenticatedContext('president',claims).firestore();
 const body=(id,effect,companyId='')=>({id,type:'random',title:id,content:'synthetic event',deadline:new Date(realNow()+86400000).toISOString(),companyId,effect});
 await publishEvent(admin,body('two-count-revenue',{kind:'revenue',percent:-50,settlements:2}));assert.deepEqual((await applyRandomEvent(admin,'two-count-revenue')).failed,[]);
 await publishEvent(admin,body('two-count-cap',{kind:'dividendCap',percent:20,settlements:2},'one'));assert.deepEqual((await applyRandomEvent(admin,'two-count-cap')).failed,[]);
 await publishEvent(admin,body('one-count-cost',{kind:'cost',asset:'all',percent:-20,settlements:1},'one'));assert.deepEqual((await applyRandomEvent(admin,'one-count-cost')).failed,[]);
 const choiceEffect={kind:'efficiency',asset:'factory',percent:50,settlements:1};await publishEvent(admin,{...body('counted-choice',choiceEffect),type:'choice',options:['A','B','C'].map(label=>({label,effect:choiceEffect}))});await chooseEvent(p,'two','counted-choice',0);await assert.rejects(applyEvent(p,'two','counted-choice'),/마감/);await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'events/counted-choice'),{endsAt:Timestamp.fromMillis(realNow()-1)}));await applyEvent(p,'two','counted-choice');
 await publishEvent(admin,body('forged-baseline',{kind:'revenue',percent:0,settlements:2},'one'));const ev=(await getDoc(doc(admin,'events/forged-baseline'))).data(),out=(await getDoc(doc(admin,'eventOutcomes/forged-baseline/options/0'))).data();const forged=writeBatch(admin);forged.set(doc(admin,'companyEffects/one/items/forged-baseline'),{option:0,effect:out.effect,startsAfterSettlement:100,appliedAt:serverTimestamp(),effectiveAt:ev.startsAt});forged.update(doc(admin,'companyOperations/one'),{lastEvent:'forged-baseline'});await assertFails(forged.commit());
 await assertFails(updateDoc(doc(p,'companyOperations/one'),{settlementCount:100}));await assertFails(updateDoc(doc(p,'companyEffects/one/items/two-count-revenue'),{startsAfterSettlement:100}));
 for(const [i,asset]of ['factory','equipment','research','employee'].entries()){const id='distinct-cost-'+i;await publishEvent(admin,body(id,{kind:'cost',asset,percent:-10-i,settlements:2},'two'));assert.deepEqual((await applyRandomEvent(admin,id)).failed,[]);}
 await invest(p,'one','employee');let o=(await getDoc(doc(p,'companyOperations/one'))).data();assert.equal(o.cash,9920000);assert.equal(investmentCost(o,DEFAULT_CONFIG,'employee'),80000);
 const before=(await getDoc(doc(admin,'companyEffects/one/items/two-count-revenue'))).data();assert.equal(before.startsAfterSettlement,0);
 const first=await beginDay(admin,'one');assert.equal(await beginDay(admin,'one'),first);assert.equal((await getDoc(doc(admin,'companyOperations/one'))).data().settlementCount,1);
 await settleDay(admin,'one');assert.equal((await getDoc(doc(admin,'companyOperations/one/days',first))).data().revenue,10000);assert.equal((await getDoc(doc(admin,'sparkAccounts/student'))).data().cash,1002000);
 await assert.rejects(settleDay(admin,'one'),/이미/);assert.equal((await getDoc(doc(admin,'companyOperations/one'))).data().settlementCount,1);
 o=(await getDoc(doc(p,'companyOperations/one'))).data();assert.equal(investmentCost(o,DEFAULT_CONFIG,'employee'),100000);
 let v=await eventCompanyView(p,'one');assert.equal(v.effects.find(r=>r.id==='two-count-revenue').remainingSettlements,1);assert.equal(v.effects.find(r=>r.id==='one-count-cost').active,false);
 assert.equal((await eventCompanyView(p,'two')).effects.find(r=>r.id==='two-count-revenue').remainingSettlements,2);
 // Advance only the synthetic calendar used by Rules; no production data involved.
 for(let n=1;n<=2;n++){Date.now=()=> (day+n)*86400000+3*3600000;const rules=source.replace('function dayNumber() { return int((request.time.toMillis()+32400000) / 86400000); }','function dayNumber() { return '+(day+n)+'; }');assert.notEqual(rules,source);environments.push(await initializeTestEnvironment({projectId,firestore:{rules}}));await settleDay(admin,'one');}
 o=(await getDoc(doc(admin,'companyOperations/one'))).data();assert.equal(o.settlementCount,3);assert.equal((await eventCompanyView(p,'one')).effects.find(r=>r.id==='two-count-revenue').remainingSettlements,0);
 // First day base=10k, next days also include the hired employee's 20k contribution.
 assert.equal((await getDoc(doc(admin,'companyOperations/one/days','d'+(day+1)))).data().rateBps,2000);assert.equal((await getDoc(doc(admin,'companyOperations/one/days','d'+(day+2)))).data().rateBps,5000);
 assert.equal((await eventCompanyView(p,'two')).effects.find(r=>r.id==='counted-choice').remainingSettlements,1);
 assert.equal((await getDoc(doc(admin,'companyOperations/one/days','d'+(day+1)))).data().revenue,30000);assert.equal((await getDoc(doc(admin,'companyOperations/one/days','d'+(day+2)))).data().revenue,60000);assert.equal((await getDoc(doc(admin,'sparkAccounts/student'))).data().cash,1038000);
 }finally{Date.now=realNow;for(const e of environments)await e.cleanup();}
});

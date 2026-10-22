import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,serverTimestamp,writeBatch} from 'firebase/firestore';
import {publishEvent,applyEvent,applyRandomEvent,eventCompanyView} from '../../client/events.js';
import {initialOperations} from '../../client/economy.js';
import {eventNewsId} from '../../client/event-news.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('one random event supports per-effect targets, overlapping companies, exact retries and one news item',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-multi-random-events',firestore:{rules:readFileSync('firestore.rules','utf8')}});try{
 await env.clearFirestore();const claims={email:'test@hcu.hs.kr',email_verified:true},admin=env.authenticatedContext('admin',claims).firestore(),student=env.authenticatedContext('student',claims).firestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role] of [['admin','admin'],['student','student']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});for(const id of ['a','b']){await setDoc(doc(db,'companies',id),{name:id,status:'listed',referencePrice:10000,issuedShares:1000});await setDoc(doc(db,'sparkBooks',id),{issuerCash:0,issuedShares:1000,treasuryShares:1000});await setDoc(doc(db,'companyOperations',id),{...initialOperations(),productionModel:'units-v2',employees:1,pendingUnits:{factory:0,employee:0,equipment:0,research:0},settlementCount:4});}});
 const body={id:'bundle',type:'random',title:'여러 기업 복합 사건',content:'기업별로 다른 영향',deadline:new Date(Date.now()+86400000).toISOString(),news:{title:'기사 하나',content:'관리자가 작성한 기사'},effects:[{companyIds:['a'],effect:{kind:'cash',amount:1000}},{companyIds:['a','b'],effect:{kind:'cash',amount:-200}},{companyIds:['b'],effect:{kind:'salePriceFlat',amount:100,settlements:2}},{companyIds:['a'],effect:{kind:'workforce',count:2}}]};
 await publishEvent(admin,body);await assertFails(applyEvent(student,'a','bundle',0));let result=await applyRandomEvent(admin,'bundle');assert.deepEqual(result.failed,[]);assert.equal(result.applied,2);assert.equal(result.newsPending,undefined);
 await Promise.all([applyRandomEvent(admin,'bundle'),applyRandomEvent(admin,'bundle')]);
 const a=(await getDoc(doc(admin,'companyOperations/a'))).data(),b=(await getDoc(doc(admin,'companyOperations/b'))).data();assert.equal(a.cash,800);assert.equal(b.cash,-200);assert.equal(a.employees,3);assert.equal(b.employees,1);
 await assert.rejects(applyEvent(admin,'a','bundle',2),/대상/);
 const receipt=(await getDoc(doc(student,'companyEffects/b/items/bundle_e2'))).data();assert.equal(receipt.eventId,'bundle');assert.equal(receipt.startsAfterSettlement,4);
 const view=await eventCompanyView(admin,'b');assert.equal(view.effects.length,2);assert.ok(view.effects.every(r=>r.title===body.title));
 const article=(await getDoc(doc(student,'news',await eventNewsId('bundle')))).data();assert.equal(article.title,'기사 하나');assert.equal(article.eventSummary.groups.length,4);assert.deepEqual(article.eventSummary.groups.map(g=>g.companies.map(c=>c.companyId)),[['a'],['a','b'],['b'],['a']]);assert.ok(article.eventSummary.groups.every(g=>g.companies.every(c=>c.status==='applied')));
 // Alternate receipt IDs may never duplicate the same effect, even for an admin client.
 const forged=writeBatch(admin);forged.set(doc(admin,'companyEffects/b/items/arbitrary'),{...receipt,appliedAt:serverTimestamp()});forged.update(doc(admin,'companyOperations/b'),{lastEvent:'arbitrary'});await assertFails(forged.commit());
 // Effects beyond the former 3-option choice limit are allowed for random events only.
 await publishEvent(admin,{...body,id:'many',news:null,effects:Array.from({length:20},()=>({companyIds:['a'],effect:{kind:'none'}}))});assert.deepEqual((await applyRandomEvent(admin,'many')).failed,[]);
 // A locked company fails safely, then resumes without paying completed companies twice.
 await publishEvent(admin,{...body,id:'resume',news:null,effects:[{companyIds:['a','b'],effect:{kind:'cash',amount:300}}]});await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/b'),{locked:true}));assert.equal((await applyRandomEvent(admin,'resume')).failed.length,1);await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/b'),{locked:false}));assert.deepEqual((await applyRandomEvent(admin,'resume')).failed,[]);assert.equal((await getDoc(doc(admin,'companyOperations/a'))).data().cash,1100);assert.equal((await getDoc(doc(admin,'companyOperations/b'))).data().cash,100);
 }finally{await env.cleanup();}
});

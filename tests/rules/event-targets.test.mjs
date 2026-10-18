import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {publishEvent,applyRandomEvent,applyEvent} from '../../client/events.js';
import {initialOperations} from '../../client/economy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('multi-company random events apply once to selected companies only; empty selections cannot become global',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-event-targets',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 try{
  await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();
   for(const [id,role] of [['admin','admin'],['student','student']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});
   for(const cid of ['one','two','three'])await setDoc(doc(db,'companies',cid),{name:cid,status:'listed',issuedShares:1000,referencePrice:10000});
   for(const cid of ['one','two','three'])await setDoc(doc(db,'companyOperations',cid),{...initialOperations(),factory:2,revenue:20000,production:{factory:20000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});
  });
  const claims={email:'test@hcu.hs.kr',email_verified:true},admin=env.authenticatedContext('admin',claims).firestore(),student=env.authenticatedContext('student',claims).firestore();
  const body={id:'multiple',type:'random',title:'선택 기업 설비 피해',content:'에뮬레이터 검증',companyIds:['one','three','one'],deadline:new Date(Date.now()+86400000).toISOString(),effect:{kind:'destroy',asset:'factory',count:1}};
  await publishEvent(admin,body);const event=(await getDoc(doc(student,'events/multiple'))).data();assert.deepEqual(event.targets,['one','three']);assert.equal(event.companyId,'');
  assert.deepEqual(await applyRandomEvent(admin,'multiple'),{applied:2,failed:[]});assert.deepEqual(await applyRandomEvent(admin,'multiple'),{applied:2,failed:[]});
  for(const cid of ['one','three']){assert.equal((await getDoc(doc(student,'companyOperations',cid))).data().factory,1);assert.equal((await getDoc(doc(student,'companyEffects',cid,'items','multiple'))).exists(),true);}
  assert.equal((await getDoc(doc(student,'companyOperations/two'))).data().factory,2);assert.equal((await getDoc(doc(student,'companyEffects/two/items/multiple'))).exists(),false);
  await assert.rejects(applyEvent(admin,'two','multiple'),/대상 기업/);await assertFails(publishEvent(student,{...body,id:'unauthorized'}));
  for(const companyIds of [[],['missing']]){await assert.rejects(publishEvent(admin,{...body,id:'invalid',companyIds}));assert.equal((await getDoc(doc(admin,'events/invalid'))).exists(),false);}
  const {companyIds,...legacy}=body;await publishEvent(admin,{...legacy,id:'all',companyId:''});assert.deepEqual((await getDoc(doc(admin,'events/all'))).data().targets.sort(),['one','three','two']);
  await publishEvent(admin,{...legacy,id:'single',companyId:'two'});assert.equal((await getDoc(doc(admin,'events/single'))).data().companyId,'two');
 }finally{await env.cleanup();}
});

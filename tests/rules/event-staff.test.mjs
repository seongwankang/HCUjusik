import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc} from 'firebase/firestore';
import {publishEvent,applyRandomEvent} from '../../client/events.js';
import {initialOperations,invest} from '../../client/economy.js';
import {adjustedRevenue} from '../../client/event-model.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('admin event grants beyond capacity exactly once, ordinary hiring and forged exemptions remain blocked',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-event-staff',firestore:{rules:readFileSync('firestore.rules','utf8')}});try{
 await env.clearFirestore();const claims={email:'test@hcu.hs.kr',email_verified:true},admin=env.authenticatedContext('admin',claims).firestore(),president=env.authenticatedContext('president',claims).firestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role] of [['admin','admin'],['president','president']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});await setDoc(doc(db,'assignments/president'),{companyIds:['one']});await setDoc(doc(db,'companies/one'),{name:'One',status:'listed',referencePrice:10000,issuedShares:1000});await setDoc(doc(db,'sparkBooks/one'),{issuerCash:0,issuedShares:1000,treasuryShares:1000});await setDoc(doc(db,'companyOperations/one'),{...initialOperations(),productionModel:'units-v2',pendingUnits:{factory:0,employee:0,equipment:0,research:0},cash:10000000,employees:10});});
 const event=count=>({id:count>0?'grant':'loss',type:'random',title:'직원 이벤트',content:'인력 변동',deadline:new Date(Date.now()+86400000).toISOString(),effects:[{companyIds:['one'],effect:{kind:'workforce',count}}]});
 await publishEvent(admin,event(8));assert.deepEqual((await applyRandomEvent(admin,'grant')).failed,[]);await applyRandomEvent(admin,'grant');let o=(await getDoc(doc(admin,'companyOperations/one'))).data();assert.equal(o.employees,18);assert.equal(o.eventEmployees,8);assert.equal(o.cash,10000000);assert.equal(adjustedRevenue(o,999999).productionPower,2160);
 await assert.rejects(invest(president,'one','employee',1),/정원/);await assertFails(updateDoc(doc(president,'companyOperations/one'),{eventEmployees:18}));await assertFails(updateDoc(doc(admin,'companyOperations/one'),{eventEmployees:19}));
 await invest(president,'one','factory');o=(await getDoc(doc(admin,'companyOperations/one'))).data();assert.equal(o.eventEmployees,8);
 await publishEvent(admin,event(-5));assert.deepEqual((await applyRandomEvent(admin,'loss')).failed,[]);o=(await getDoc(doc(admin,'companyOperations/one'))).data();assert.equal(o.employees,13);assert.equal(o.eventEmployees,3);
 }finally{await env.cleanup();}
});

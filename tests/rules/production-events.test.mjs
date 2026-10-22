import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,Timestamp} from 'firebase/firestore';
import {publishEvent,applyRandomEvent,applyEvent,chooseEvent,closeChoiceEvent} from '../../client/events.js';
import {initialOperations} from '../../client/economy.js';
import {productionEffectKinds} from '../../client/production-effects.js';
import {adjustedRevenue} from '../../client/event-model.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('production events publish, apply exactly once, stay secret until choice deadline and reject forged parameters',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-production-effects',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 try{
 await env.clearFirestore();const claims={email:'test@hcu.hs.kr',email_verified:true};const admin=env.authenticatedContext('admin',claims).firestore(),president=env.authenticatedContext('president',claims).firestore(),student=env.authenticatedContext('student',claims).firestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role] of [['admin','admin'],['president','president'],['student','student']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});await setDoc(doc(db,'assignments/president'),{companyIds:['one']});await setDoc(doc(db,'companies/one'),{name:'One',status:'listed',referencePrice:10000,issuedShares:1000});await setDoc(doc(db,'sparkBooks/one'),{issuerCash:0,issuedShares:1000,treasuryShares:1000});await setDoc(doc(db,'companyOperations/one'),{...initialOperations(),productionModel:'units-v2',factory:1,employees:10,pendingUnits:{factory:0,equipment:0,research:0,employee:0},settlementCount:5});});
 const body=(id,effect,type='random')=>({id,type,title:id,content:'원자재 및 생산 상황 변화',companyId:type==='random'?'one':'',deadline:new Date(Date.now()+86400000).toISOString(),effect,...(type==='choice'?{defaultOption:0}:{}),options:[{label:'유지',effect},{label:'대응',effect:{kind:'none'}},{label:'대기',effect:{kind:'none'}}]});
 for(const kind of productionEffectKinds){const effect={kind,settlements:2,...(kind.endsWith('Flat')?{amount:100}:{percent:10})};await publishEvent(admin,body(kind,effect));await assertFails(applyEvent(student,'one',kind));const result=await applyRandomEvent(admin,kind);assert.deepEqual(result.failed,[]);await applyRandomEvent(admin,kind);const receipt=(await getDoc(doc(student,'companyEffects/one/items',kind))).data();assert.equal(receipt.startsAfterSettlement,5);assert.equal(receipt.effect.kind,kind);}
 const op=(await getDoc(doc(admin,'companyOperations/one'))).data();assert.equal(op.cash,0);assert.equal(op.employees,10);assert.equal(op.factory,1);assert.equal(op.settlementCount,5);
 await publishEvent(admin,body('choice',{kind:'salePriceFlat',amount:100,settlements:1},'choice'));await chooseEvent(president,'one','choice',0);await assertFails(getDoc(doc(president,'eventOutcomes/choice/options/0')));
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'events/choice'),{endsAt:Timestamp.fromMillis(Date.now()-1000)}));assert.equal((await applyEvent(president,'one','choice',0,{operator:false})).queued,true);const closed=await closeChoiceEvent(admin,'choice');assert.deepEqual(closed.failed,[]);const receipt=(await getDoc(doc(student,'companyEffects/one/items/choice'))).data();assert.equal(receipt.effect.amount,100);assert.equal(adjustedRevenue(op,999,[receipt],Date.now()).salePrice,1100);
 for(const effect of [{kind:'productionCostFlat',asset:'factory',percent:0,count:0,settlements:2,amount:1000001},{kind:'salePrice',asset:'factory',percent:501,count:0,settlements:2},{kind:'productionPower',asset:'factory',percent:-101,count:0,settlements:2}])await assertFails(setDoc(doc(admin,'eventOutcomes/choice/options/99'),{effect}));
 }finally{await env.cleanup();}
});

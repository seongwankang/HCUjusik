import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc} from 'firebase/firestore';
import {initialOperations,koreaDay} from '../../client/economy.js';
import {hireSpy,settleSpies,spyView} from '../../client/spies.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,admin,president,student;const day=koreaDay();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-industrial-spies',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role] of [['admin','admin'],['president','president'],['student','student']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});await setDoc(doc(db,'assignments/president'),{companyIds:['a','b','c']});for(const id of ['a','b','c','poor','other']){await setDoc(doc(db,'companies',id),{name:id,status:'listed'});await setDoc(doc(db,'companyOperations',id),{...initialOperations(),cash:id==='poor'?1:10000000});await setDoc(doc(db,'sparkBooks',id),{issuerCash:0,issuedShares:1000,treasuryShares:1000});}});
 const claims={email:'spy@hcu.hs.kr',email_verified:true};admin=env.authenticatedContext('admin',claims).firestore();president=env.authenticatedContext('president',claims).firestore();student=env.authenticatedContext('student',claims).firestore();});
after(async()=>env?.cleanup());
async function trusted(fn){let result;await env.withSecurityRulesDisabled(async c=>{result=await fn(c.firestore());});return result;}
test('assigned president hires atomically at the exact policy; cannot hire a second spy, steal raw funds, or impersonate another company',async()=>{
 await hireSpy(president,'a','b');let s=(await spyView(president,'a')).contract;assert.equal(s.cost,2000000);assert.equal(s.bps,200);assert.equal(s.remaining,3);assert.equal((await getDoc(doc(admin,'companyOperations/a'))).data().cash,8000000);
 await assert.rejects(hireSpy(president,'a','c'),/활동 중/);await assert.rejects(hireSpy(president,'b','b'),/다른/);await assertFails(hireSpy(student,'b','a'));await assertFails(hireSpy(president,'other','a'));await assert.rejects(hireSpy(admin,'poor','a'),/자금/);
 await assertFails(updateDoc(doc(president,'companySpies/a'),{bps:500,remaining:30}));await assertFails(updateDoc(doc(president,'companyOperations/a'),{cash:9000000}));await assertFails(setDoc(doc(student,'spyPolicy/main'),{cost:1,bps:10000,settlements:100}));
 await assertFails(setDoc(doc(president,'companySpies/a/history/forged'),{day,net:100}));await assertFails(setDoc(doc(president,'spyRounds/forged'),{day}));
});
test('global final phase waits for every ordinary payout, computes cycles from fixed revenue, and retries exactly once',async()=>{
 await hireSpy(president,'b','c');await hireSpy(president,'c','a');
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,revenue] of [['a',4000000],['b',2000000],['c',1000000]]){await updateDoc(doc(db,'companySpies',id),{activeFromDay:day});await updateDoc(doc(db,'companyOperations',id),{lastSettledDay:day,locked:false});if(id!=='c')await setDoc(doc(db,'companyOperations',id,'days','d'+day),{day,revenue});}});
 assert.equal((await trusted(db=>settleSpies(db))).status,'waiting');assert.equal((await getDoc(doc(admin,'companyOperations/a'))).data().cash,8000000);
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'companyOperations/c/days/d'+day),{day,revenue:1000000}));
 const results=await trusted(db=>Promise.all([settleSpies(db),settleSpies(db)]));assert.equal(results.filter(r=>r.status==='settled').length,1);
 for(const [id,cash] of [['a',7960000],['b',7980000],['c',8060000]]){assert.equal((await getDoc(doc(admin,'companyOperations',id))).data().cash,cash);assert.equal((await spyView(student,id)).contract.remaining,2);}
 assert.equal((await trusted(db=>settleSpies(db))).status,'complete');assert.equal((await getDoc(doc(admin,'companyOperations/a'))).data().cash,7960000);
});
test('policy changes affect future hires; old contracts retain their original economics',async()=>{
 await setDoc(doc(admin,'spyPolicy/main'),{cost:3000000,bps:100,settlements:2});assert.equal((await spyView(admin,'a')).contract.bps,200);await hireSpy(admin,'other','a');assert.equal((await spyView(admin,'other')).contract.bps,100);
 await assertFails(setDoc(doc(admin,'spyPolicy/main'),{cost:1000000,bps:501,settlements:3}));
});
test('contracts consume only completed rounds, expire and allow a newly paid hire',async()=>{
 for(const next of [day+1,day+2]){
  await env.withSecurityRulesDisabled(async c=>{for(const id of ['a','b','c','other']){await updateDoc(doc(c.firestore(),'companyOperations',id),{lastSettledDay:next,locked:false});await setDoc(doc(c.firestore(),'companyOperations',id,'days','d'+next),{day:next,revenue:1000000});}});
  assert.equal((await trusted(db=>settleSpies(db,next*86400000+1))).status,'settled');
 }
 assert.equal((await spyView(admin,'a')).contract.remaining,0);const before=(await getDoc(doc(admin,'companyOperations/a'))).data().cash;
 await hireSpy(president,'a','c');assert.equal((await getDoc(doc(admin,'companyOperations/a'))).data().cash,before-3000000);assert.equal((await spyView(admin,'a')).contract.remaining,2);
});

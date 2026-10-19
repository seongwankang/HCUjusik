import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc} from 'firebase/firestore';
import {initialOperations,koreaDay} from '../../client/economy.js';
import {hireSpy,settleSpies,spyView} from '../../client/spies.js';
import {activeSpies} from '../../client/spy-model.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,admin,president,student;const day=koreaDay(),due=day*86400000+1;
async function trusted(fn){let result;await env.withSecurityRulesDisabled(async c=>{result=await fn(c.firestore());});return result;}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-industrial-spies-ten',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await trusted(async db=>{for(const [id,role] of [['admin','admin'],['president','president'],['student','student']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});await setDoc(doc(db,'assignments/president'),{companyIds:['a','b','c','cap','legacy']});for(const id of ['a','b','c','cap','legacy','other','poor']){await setDoc(doc(db,'companies',id),{name:id,status:'listed'});await setDoc(doc(db,'companyOperations',id),{...initialOperations(),cash:id==='poor'?1:20000000});await setDoc(doc(db,'sparkBooks',id),{issuerCash:0,issuedShares:1000,treasuryShares:1000});}});
 const claims={email:'spy@hcu.hs.kr',email_verified:true};admin=env.authenticatedContext('admin',claims).firestore();president=env.authenticatedContext('president',claims).firestore();student=env.authenticatedContext('student',claims).firestore();});
after(async()=>env?.cleanup());
test('one million per agent, 2.5 percent, permanent; authorization and raw money forgery blocked',async()=>{
 await hireSpy(president,'a','b');const s=(await spyView(president,'a')).contract;assert.equal(s.cost,1000000);assert.equal(s.bps,250);assert.equal(s.settlements,0);assert.equal(activeSpies(s).length,1);assert.equal((await getDoc(doc(admin,'companyOperations/a'))).data().cash,19000000);
 await assert.rejects(hireSpy(president,'b','b'),/다른/);await assertFails(hireSpy(student,'b','a'));await assertFails(hireSpy(president,'other','a'));await assert.rejects(hireSpy(admin,'poor','a'),/자금/);
 await assertFails(updateDoc(doc(president,'companySpies/a'),{bps:500,remaining:30}));await assertFails(updateDoc(doc(president,'companyOperations/a'),{cash:21000000}));await assertFails(setDoc(doc(president,'companySpies/a/history/forged'),{day,net:100}));await assertFails(setDoc(doc(president,'spyRounds/forged'),{day}));
});
test('two agents only: concurrent hires charge twice and third hire is denied',async()=>{
 const results=await Promise.allSettled([hireSpy(president,'cap','a'),hireSpy(president,'cap','b'),hireSpy(president,'cap','c')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,2);const v=await spyView(president,'cap');assert.equal(activeSpies(v.contract).length,2);assert.equal((await getDoc(doc(admin,'companyOperations/cap'))).data().cash,18000000);
 await assert.rejects(hireSpy(president,'cap','a'),/최대 2명/);await assertFails(updateDoc(doc(president,'companySpies/cap'),{'agents.1':Object.values(v.contract.agents)[0]}));
});
test('an active legacy paid agent permits a second hire but blocks a third',async()=>{
 const legacy={companyId:'legacy',targetId:'a',hireId:'legacy-paid',cost:2000000,bps:200,settlements:3,remaining:2,activeFromDay:day,lastRoundDay:0};
 await trusted(async db=>{await setDoc(doc(db,'companySpies/legacy'),legacy);await updateDoc(doc(db,'companyOperations/legacy'),{lastSpyHire:'legacy-paid'});});
 await hireSpy(president,'legacy','b');await assert.rejects(hireSpy(president,'legacy','c'),/최대 2명/);const v=await spyView(president,'legacy');assert.equal(activeSpies(v.contract).length,2);assert.equal((await getDoc(doc(admin,'companyOperations/legacy'))).data().cash,19000000);
});

test('atomic final phase waits for every payout, never cascades, retries once and never consumes duration',async()=>{
 await hireSpy(president,'b','c');await hireSpy(president,'c','a');
 // Isolate three companies' cycle from the separate capacity/migration fixtures.
 await trusted(async db=>{for(const id of ['cap','legacy'])await updateDoc(doc(db,'companySpies',id),{agents:{}});for(const [id,revenue] of [['a',4000000],['b',2000000],['c',1000000]]){const v=(await getDoc(doc(db,'companySpies',id))).data(),agents=Object.fromEntries(Object.entries(v.agents).map(([k,a])=>[k,{...a,activeFromDay:day}]));await updateDoc(doc(db,'companySpies',id),{agents});await updateDoc(doc(db,'companyOperations',id),{lastSettledDay:day,locked:false});if(id!=='c')await setDoc(doc(db,'companyOperations',id,'days','d'+day),{day,revenue});}});
 assert.equal((await trusted(db=>settleSpies(db,due))).status,'waiting');await trusted(db=>setDoc(doc(db,'companyOperations/c/days/d'+day),{day,revenue:1000000}));
 const result=await trusted(db=>Promise.all([settleSpies(db,due),settleSpies(db,due)]));assert.equal(result.filter(r=>r.status==='settled').length,1);
 for(const [id,cash] of [['a',18950000],['b',18975000],['c',19075000]])assert.equal((await getDoc(doc(admin,'companyOperations',id))).data().cash,cash);
 for(let i=1;i<=5;i++){const next=day+i;await trusted(async db=>{for(const id of ['a','b','c']){await updateDoc(doc(db,'companyOperations',id),{lastSettledDay:next});await setDoc(doc(db,'companyOperations',id,'days','d'+next),{day:next,revenue:1000000});}});assert.equal((await trusted(db=>settleSpies(db,next*86400000+1))).status,'settled');}
 for(const id of ['a','b','c']){const a=activeSpies((await spyView(admin,id)).contract);assert.equal(a.length,1);assert.equal(a[0].remaining,1);}
});

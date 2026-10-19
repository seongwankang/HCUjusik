import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {publishEvent,applyEvent,applyRandomEvent,chooseEvent,closeChoiceEvent} from '../../client/events.js';
import {initialOperations,invest,operationsView,beginDay,koreaDay,settleDay} from '../../client/economy.js';
import {validateEffect,effectiveDividendBps} from '../../client/event-model.js';
import {createClientApi} from '../../client/data.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,admin,president,student;
const claims={email:'test@hcu.hs.kr',email_verified:true};
const publish=(id,effect,type='random')=>publishEvent(admin,{id,type,title:id,content:'예시 상황',companyId:type==='random'?'one':'',deadline:new Date(Date.now()+86400000).toISOString(),effect,options:[{label:'선택 1',effect},{label:'선택 2',effect:{kind:'none'}},{label:'선택 3',effect:{kind:'none'}}]});
const op=async()=> (await getDoc(doc(admin,'companyOperations/one'))).data();
async function reset(){await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'companyOperations/one'),{...initialOperations(),production:{factory:0,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0},dividendBps:5000});});}
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-expanded-effects',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const [id,role] of [['admin','admin'],['president','president'],['student','student']])await setDoc(doc(d,'users',id),{displayName:id,role,active:true});
 await setDoc(doc(d,'assignments/president'),{companyIds:['one']});
 for(const id of ['one','fresh']){await setDoc(doc(d,'companies',id),{name:id,status:'listed',referencePrice:10000,issuedShares:1000});await setDoc(doc(d,'sparkBooks',id),{issuerCash:10000000,issuedShares:1000,treasuryShares:1000});}});
 admin=env.authenticatedContext('admin',claims).firestore();president=env.authenticatedContext('president',claims).firestore();student=env.authenticatedContext('student',claims).firestore();await reset();
});
after(async()=>env?.cleanup());
test('new money effects are operator-only, atomic, idempotent and record full losses including company debt',async()=>{
 await publish('support',{kind:'cash',amount:1000000});
 await assertFails(applyEvent(president,'one','support'));await assertFails(applyEvent(student,'one','support'));
 await applyRandomEvent(admin,'support');await applyRandomEvent(admin,'support');assert.equal((await op()).cash,11000000);
 await publish('loss',{kind:'cash',amount:-100000000});await applyRandomEvent(admin,'loss');assert.equal((await op()).cash,-89000000);
 await assert.rejects(invest(president,'one','factory'),/자금/);
 await assertFails(updateDoc(doc(president,'companyOperations/one'),{cash:-1}));
 const receipt=(await getDoc(doc(student,'companyEffects/one/items/loss'))).data();assert.equal(receipt.result.amount,-100000000);
 const before=(await op()).receivedIssuerCash;await applyRandomEvent(admin,'loss');assert.equal((await op()).receivedIssuerCash,before);assert.equal((await op()).cash,-89000000);
 await publish('debt-support',{kind:'cash',amount:1000000});await applyRandomEvent(admin,'debt-support');assert.equal((await op()).cash,-88000000);
});
test('free recruitment, departure and equipment grants honor caps and store real deltas',async()=>{
 await reset();await publish('recruit',{kind:'workforce',count:1000});await applyRandomEvent(admin,'recruit');assert.equal((await op()).employees,10);assert.equal((await op()).staffRevenue,200000);
 assert.equal((await getDoc(doc(admin,'companyEffects/one/items/recruit'))).data().result.count,10);
 await publish('depart',{kind:'workforce',count:-1000});await applyRandomEvent(admin,'depart');assert.equal((await op()).employees,0);assert.equal((await op()).staffRevenue,0);
 await publish('grant',{kind:'grant',asset:'factory',count:2});await applyRandomEvent(admin,'grant');await applyRandomEvent(admin,'grant');assert.equal((await op()).factory,2);assert.equal((await op()).revenue,880000);assert.equal((await op()).cash,0);
 await publish('rd',{kind:'grant',asset:'research',count:100});await applyRandomEvent(admin,'rd');assert.equal((await op()).research,6);assert.equal((await op()).activeResearchBps,3000);
});
test('discounted president purchases use exact rules-verified price and cannot edit event terms',async()=>{
 await reset();await publish('discount',{kind:'cost',asset:'factory',percent:-20,hours:24});await applyRandomEvent(admin,'discount');
 await invest(president,'one','factory');let o=await op();assert.equal(o.cash,8400000);assert.equal(o.pendingRevenue,440000);
 await assertFails(updateDoc(doc(president,'companyOperations/one'),{costEvents:{}}));
 await assertFails(updateDoc(doc(president,'companyOperations/one'),{cash:o.cash+1}));
 const term={...o.costEvents.factory,startsAt:Date.now()-3600001,endsAt:Date.now()-1};await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'companyOperations/one'),{costEvents:{factory:term}}));
 await invest(president,'one','factory');assert.equal((await op()).cash,6400000);
});
test('new selected effects stay hidden before deadline and operator closes them once after deadline',async()=>{
 await reset();await publish('choice-money',{kind:'cash',amount:2000000},'choice');await chooseEvent(president,'one','choice-money',0);
 await assertFails(getDoc(doc(president,'eventOutcomes/choice-money/options/0')));await assert.rejects(applyEvent(admin,'one','choice-money',0),/마감/);
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'events/choice-money'),{endsAt:Timestamp.fromMillis(Date.now()-1000)}));
 const api=createClientApi({db:president,getUser:async()=>({uid:'president',getIdTokenResult:async()=>({claims})})});
 assert.equal((await api('/api/event-apply',{method:'POST',body:JSON.stringify({companyId:'one',id:'choice-money',option:0})})).queued,true);assert.equal((await op()).cash,0);
 await assertFails(applyEvent(president,'one','choice-money',0));
 assert.equal((await closeChoiceEvent(admin,'choice-money')).applied,1);await closeChoiceEvent(admin,'choice-money');assert.equal((await op()).cash,12000000);
});
test('caps change settlement rate without rewriting president setting; forged terms and receipts rejected',async()=>{
 await reset();await publish('cap',{kind:'dividendCap',percent:20,hours:48});await applyRandomEvent(admin,'cap');assert.equal((await op()).dividendBps,5000);assert.equal(effectiveDividendBps(await op()),2000);
 await assertFails(updateDoc(doc(president,'companyOperations/one'),{dividendLimit:{}}));
 const key=await beginDay(admin,'one'),day=(await getDoc(doc(admin,'companyOperations/one/days/'+key))).data();assert.equal(day.rateBps,2000);
 await publish('locked-money',{kind:'cash',amount:1});const r=await applyRandomEvent(admin,'locked-money');assert.equal(r.failed.length,1);
 await reset();await publish('fake',{kind:'cost',asset:'all',percent:-50,hours:1});
 const n=(await getDoc(doc(admin,'events/fake'))).data();const batch=writeBatch(president);
 batch.set(doc(president,'companyEffects/one/items/fake'),{option:0,effect:validateEffect({kind:'cost',asset:'all',percent:-50,hours:1}),appliedAt:serverTimestamp(),effectiveAt:n.startsAt});batch.update(doc(president,'companyOperations/one'),{lastEvent:'fake',costEvents:{}});await assertFails(batch.commit());
});
test('random new effect initializes missing company operations and malformed outcomes cannot be published',async()=>{
 await publishEvent(admin,{id:'fresh-support',type:'random',companyId:'fresh',title:'지원',content:'초기 지원',deadline:new Date(Date.now()+86400000).toISOString(),effect:{kind:'cash',amount:1000000}});
 const r=await applyRandomEvent(admin,'fresh-support');assert.deepEqual(r.failed,[]);assert.equal((await getDoc(doc(admin,'companyOperations/fresh'))).data().cash,11000000);
 await assert.rejects(publish('bad',{kind:'cost',asset:'all',percent:-100,hours:1}));
});


test('negative company cash survives ordinary settlement; assets and student cash remain nonnegative',async()=>{
 const cid='debt-settlement';await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'companies',cid),{name:cid,status:'listed'});await setDoc(doc(db,'sparkBooks',cid),{issuerCash:0,issuedShares:1000,treasuryShares:1000});await setDoc(doc(db,'companyOperations',cid),{...initialOperations(),cash:-1000000,factory:1,revenue:100000,production:{factory:100000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});});
 await settleDay(admin,cid);const o=(await getDoc(doc(admin,'companyOperations',cid))).data();assert.equal(o.cash,-800000);assert.equal(o.locked,false);
 await assertFails(updateDoc(doc(admin,'companyOperations',cid),{factory:-1}));
 await assertFails(updateDoc(doc(admin,'companyOperations',cid),{employees:-1}));
 await assertFails(setDoc(doc(student,'sparkAccounts/student'),{cash:-1,reservedCash:0,positions:{},reservedPositions:{},version:0,lastMarket:''}));
});

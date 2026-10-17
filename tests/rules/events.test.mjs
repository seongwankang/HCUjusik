import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,writeBatch,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';
import {publishEvent,chooseEvent,applyEvent,applyRandomEvent,eventCompanyView} from '../../client/events.js';
import {initialOperations,beginDay} from '../../client/economy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Loopback emulator required');
let env,admin,president,other,student;
const effect={kind:'revenue',percent:-20,hours:24},deadline=new Date(Date.now()+86400000).toISOString();
const body=(id,type='choice',extra={})=>({id,type,title:'이벤트 '+id,content:'생산 상황이 바뀌었습니다.',deadline,options:[{label:'유지',effect},{label:'개선',effect:{kind:'efficiency',asset:'factory',percent:50,hours:24}},{label:'철수',effect:{kind:'destroy',asset:'factory',count:1}}],effect,...extra});
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-economic-events',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role] of [['admin','admin'],['president','president'],['other','president'],['student','student']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});
 for(const cid of ['one','two']){await setDoc(doc(db,'companies',cid),{name:cid,ticker:cid,status:'listed',issuedShares:100,referencePrice:10000});await setDoc(doc(db,'companyOperations',cid),{...initialOperations(),factory:2,revenue:10000,production:{factory:10000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});await setDoc(doc(db,'sparkBooks',cid),{issuerCash:0,issuedShares:100,treasuryShares:100});}
 await setDoc(doc(db,'assignments/president'),{companyIds:['one']});await setDoc(doc(db,'assignments/other'),{companyIds:['two']});});
 const claims={email:'test@hcu.hs.kr',email_verified:true};admin=env.authenticatedContext('admin',claims).firestore();president=env.authenticatedContext('president',claims).firestore();other=env.authenticatedContext('other',claims).firestore();student=env.authenticatedContext('student',claims).firestore();
});
after(async()=>env?.cleanup());
async function chooseOnly(db,cid,eid,option){const batch=writeBatch(db);batch.set(doc(db,'companyChoices',cid,'items',eid),{option,chosenAt:serverTimestamp()});await batch.commit();}
test('publish and selection keep all outcomes hidden until deadline; only selected outcome readable afterward',async()=>{
 await publishEvent(admin,body('secret'));
 const pub=(await getDoc(doc(student,'events/secret'))).data();assert.deepEqual(pub.options,['유지','개선','철수']);assert.equal(JSON.stringify(pub).includes('percent'),false);
 for(const db of [student,president,other])for(const i of [0,1,2])await assertFails(getDoc(doc(db,'eventOutcomes/secret/options',String(i))));
 await chooseEvent(president,'one','secret',0);
 await assertFails(getDoc(doc(president,'eventOutcomes/secret/options/0')));await assert.rejects(applyEvent(president,'one','secret',0),/마감/);assert.equal((await getDoc(doc(admin,'companyEffects/one/items/secret'))).exists(),false);
 await publishEvent(admin,body('second-pending'));await chooseEvent(president,'one','second-pending',1);assert.equal((await getDoc(doc(admin,'companyOperations/one'))).data().pendingEvent||'','');
 await expire('secret');await applyEvent(president,'one','secret',0);
 assert.equal((await getDoc(doc(president,'eventOutcomes/secret/options/0'))).data().effect.percent,-20);
 await assertFails(getDoc(doc(president,'eventOutcomes/secret/options/1')));await assertFails(getDoc(doc(other,'eventOutcomes/secret/options/0')));
 assert.equal((await getDoc(doc(other,'companyEffects/one/items/secret'))).data().effect.percent,-20);assert.equal((await getDoc(doc(student,'companyEffects/one/items/secret'))).data().effect.percent,-20);
 await assert.rejects(chooseEvent(president,'one','secret',1),/변경/);
 await assertFails(chooseEvent(president,'two','secret',0));await assertFails(chooseEvent(student,'one','secret',0));
 await chooseEvent(president,'one','secret',0);assert.equal((await eventCompanyView(president,'one')).effects.length,1);
});
test('permanent destruction is atomic, exact and idempotent; forged cash and receipts denied',async()=>{
 await publishEvent(admin,body('destroy-choice'));await chooseEvent(president,'one','destroy-choice',2);assert.equal((await getDoc(doc(admin,'companyOperations/one'))).data().factory,2);await expire('destroy-choice');await applyEvent(president,'one','destroy-choice',2);
 let o=(await getDoc(doc(admin,'companyOperations/one'))).data();assert.equal(o.factory,1);assert.equal(o.revenue,5000);assert.equal(o.production.factory,5000);
 await applyEvent(president,'one','destroy-choice',2);o=(await getDoc(doc(admin,'companyOperations/one'))).data();assert.equal(o.factory,1);
 await publishEvent(admin,body('forged'));await chooseOnly(president,'one','forged',0);await expire('forged');const effectiveAt=(await getDoc(doc(admin,'events/forged'))).data().endsAt;
 await assertFails(setDoc(doc(president,'companyEffects/one/items/forged'),{option:0,effect:{kind:'revenue',asset:'factory',percent:500,hours:24,count:0},effectiveAt,appliedAt:serverTimestamp()}));
 const batch=writeBatch(president);batch.set(doc(president,'companyEffects/one/items/forged'),{option:0,effect:{kind:'revenue',asset:'factory',percent:-20,hours:24,count:0},effectiveAt,appliedAt:serverTimestamp()});batch.update(doc(president,'companyOperations/one'),{lastEvent:'forged',pendingEvent:'',cash:999999});await assertFails(batch.commit());
 await assertFails(updateDoc(doc(admin,'events/forged'),{title:'변경'}));await assertFails(updateDoc(doc(admin,'eventOutcomes/forged/options/0'),{effect:{kind:'none',asset:'factory',percent:0,hours:0,count:0}}));
});
test('global random event resumes safely; presidents cannot trigger it; settlement snapshots adjusted revenue',async()=>{
 await publishEvent(admin,body('global','random'));await assertFails(applyEvent(president,'one','global',0));
 await applyEvent(president,'one','forged',0);let result=await applyRandomEvent(admin,'global');assert.equal(result.applied,2);assert.deepEqual(result.failed,[]);result=await applyRandomEvent(admin,'global');assert.equal(result.applied,2);
 const key=await beginDay(admin,'one');const d=(await getDoc(doc(admin,'companyOperations/one/days',key))).data();assert.equal(d.revenue,4000); // three -20% effects on remaining 5,000 base
 assert.equal((await getDoc(doc(admin,'companyOperations/one'))).data().revenue,5000);
 await publishEvent(admin,body('locked','random',{companyId:'one'}));result=await applyRandomEvent(admin,'locked');assert.equal(result.failed.length,1);
 await assertFails(setDoc(doc(president,'companyChoices/one/items/secret'),{option:2,chosenAt:serverTimestamp()}));
});
test('expired choice cannot be submitted; saved choice can resume after deadline',async()=>{
 await publishEvent(admin,body('expired'));await publishEvent(admin,body('resume'));
 await chooseOnly(other,'two','resume',1);
 await env.withSecurityRulesDisabled(async c=>{for(const id of ['expired','resume'])await updateDoc(doc(c.firestore(),'events',id),{endsAt:Timestamp.fromMillis(Date.now()-1000)});});
 await assertFails(setDoc(doc(other,'companyChoices/two/items/expired'),{option:0,chosenAt:serverTimestamp()}));await applyEvent(other,'two','resume',1);
 assert.equal((await getDoc(doc(other,'companyEffects/two/items/resume'))).data().effect.kind,'efficiency');
});
test('saved overdue choices cannot avoid destruction at settlement and pending flags cannot be forged',async()=>{
 await publishEvent(admin,body('withheld'));
 await chooseOnly(other,'two','withheld',2);
 await expire('withheld');const chosen=(await getDoc(doc(admin,'events/withheld'))).data().endsAt;
 await assertFails(updateDoc(doc(other,'companyOperations/two'),{pendingEvent:'forged'}));
 await assertFails(updateDoc(doc(other,'companyOperations/two'),{cash:99999,pendingEvent:'withheld'}));
 const key=await beginDay(admin,'two');
 const o=(await getDoc(doc(admin,'companyOperations/two'))).data();assert.equal(o.factory,1);assert.equal(o.pendingEvent,'');
 const receipt=(await getDoc(doc(admin,'companyEffects/two/items/withheld'))).data();assert.equal(receipt.effectiveAt.toMillis(),chosen.toMillis());
 const d=(await getDoc(doc(admin,'companyOperations/two/days',key))).data();assert.equal(d.revenue,13000); // remaining 5k factory, +50% efficiency, -20% revenue
});

async function expire(id){await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'events',id),{endsAt:Timestamp.fromMillis(Date.now()-1000)}));}

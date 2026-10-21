import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';import {doc,setDoc,getDoc,updateDoc,Timestamp} from 'firebase/firestore';import {createClientApi} from '../../client/data.js';import {initialOperations,koreaDay} from '../../client/economy.js';
if(!/^127[.]0[.]0[.]1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,db,api;const day=koreaDay(),zero={factory:0,equipment:0,research:0};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-revenue-rankings',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await setDoc(doc(d,'users/student'),{displayName:'student',role:'student',active:true});for(const [id,status]of [['one','listed'],['two','paused'],['new','listed'],['unclassified','listed'],['hidden','draft']]){await setDoc(doc(d,'companies',id),{name:id,ticker:id,status,referencePrice:10000});await setDoc(doc(d,'sparkBooks',id),{lastPrice:0,issuerCash:99000000,issuedShares:1000,treasuryShares:1000});}
 for(const id of ['one','two'])await setDoc(doc(d,'companyOperations',id),{...initialOperations(),cash:-1000000,factory:1,revenue:100000,production:{...zero,factory:100000},pendingRevenue:50000,pendingProduction:{...zero,factory:50000},pendingDay:day+1,lastSettledDay:day-1,locked:id==='one',currentDay:'d'+day});
 for(let i=0;i<61;i++)await setDoc(doc(d,'companyOperations/one/days','d'+(day-61+i)),{day:day-61+i,revenue:1000+i,dividend:9000000,retained:8000000});
 await setDoc(doc(d,'companyOperations/one/days','d'+day),{day,revenue:7777});await setDoc(doc(d,'companyOperations/one/days/future'),{day:day+1,revenue:9999999});await setDoc(doc(d,'companyOperations/two/days/previous'),{day:day-1,revenue:90000});
 await setDoc(doc(d,'companyEffects/one/items/effect'),{effect:{kind:'revenue',percent:-20,settlements:2},startsAfterSettlement:0,appliedAt:Timestamp.fromMillis(Date.now()-1000)});
 await setDoc(doc(d,'companyOperations/unclassified'),{...initialOperations(),revenue:123,lastSettledDay:day-1});await setDoc(doc(d,'companyOperations/unclassified/days/previous'),{day:day-1,revenue:50});
 });db=env.authenticatedContext('student',{email:'student@hcu.hs.kr',email_verified:true}).firestore();api=createClientApi({db,getUser:async()=>({uid:'student',getIdTokenResult:async()=>({claims:{email:'student@hcu.hs.kr',email_verified:true}})})});});after(async()=>env?.cleanup());
test('ordinary investor sees forecast and 61-day cumulative revenue, matching company view; no company writes or private account reads granted',async()=>{
 const r=await api('/api/rankings');assert.equal(r.expectedRevenue[0].id,'two');assert.equal(r.expectedRevenue[0].expectedRevenue,300000);assert.equal(r.expectedRevenue.find(x=>x.id==='one').expectedRevenue,240000);assert.equal(r.cumulativeRevenue.find(x=>x.id==='one').cumulativeRevenue,62830);assert.equal(r.cumulativeRevenue[0].id,'two');assert.equal(r.expectedRevenue.find(x=>x.id==='new').expectedRevenue,0);assert.equal(r.expectedRevenueUnavailable,1);assert.equal(r.cumulativeRevenue.find(x=>x.id==='unclassified').cumulativeRevenue,50);assert.equal(r.expectedRevenue.some(x=>x.id==='hidden'),false);
 const company=await api('/api/company-investor?companyId=one');assert.equal(r.expectedRevenue.find(x=>x.id==='one').expectedRevenue,company.tomorrowRevenue);
 await assertFails(updateDoc(doc(db,'companyOperations/one'),{revenue:999999}));await assertFails(getDoc(doc(db,'sparkAccounts/other')));
});
test('completion invalidates cached totals and adds newly completed revenue once; pending/future snapshots remain excluded',async()=>{
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/one'),{lastSettledDay:day,locked:false}));
 for(let i=0;i<2;i++)assert.equal((await api('/api/rankings')).cumulativeRevenue.find(x=>x.id==='one').cumulativeRevenue,70607);
});
test('an audited correction invalidates the cached total without changing the settlement day',async()=>{
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await updateDoc(doc(d,'companyOperations/one/days','d'+day),{revenue:0});await updateDoc(doc(d,'companyOperations/one'),{revenueRevision:1});});
 assert.equal((await api('/api/rankings')).cumulativeRevenue.find(x=>x.id==='one').cumulativeRevenue,62830);
});

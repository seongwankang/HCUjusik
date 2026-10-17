import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,serverTimestamp} from 'firebase/firestore';
import {createClientApi} from '../../client/data.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,admin,student,studentApi,adminApi;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-rankings',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role]of [['admin','admin'],['student','student'],['other','president']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});await setDoc(doc(db,'sparkAccounts/student'),{cash:900000,reservedCash:200000,positions:{one:100},reservedPositions:{one:50}});await setDoc(doc(db,'sparkAccounts/other'),{cash:2000000,positions:{}});await setDoc(doc(db,'companies/one'),{name:'One',ticker:'ONE',status:'listed',referencePrice:10000});await setDoc(doc(db,'sparkBooks/one'),{lastPrice:12000});});
 const claims={email:'school@hcu.hs.kr',email_verified:true},make=(uid)=>createClientApi({db:env.authenticatedContext(uid,claims).firestore(),getUser:async()=>({uid,getIdTokenResult:async()=>({claims})})});admin=env.authenticatedContext('admin',claims).firestore();student=env.authenticatedContext('student',claims).firestore();studentApi=make('student');adminApi=make('admin');
});
after(async()=>env?.cleanup());
test('only admin publishes projected ranks; student reads snapshot and own cash but cannot access source accounts',async()=>{
 await adminApi('/api/rankings-publish',{method:'POST'});const r=await studentApi('/api/rankings?uid=other');assert.equal(r.myCash,900000);assert.equal(r.myTotalValue,2100000);assert.equal(r.cash.entries[0].totalValue,2100000);assert.equal(r.cash.participants,2);assert.deepEqual(r.cash.entries.map(e=>[e.name,e.cash,e.rank]),[['student',900000,1],['other',2000000,2]]);assert.equal(r.prices[0].price,12000);assert.equal('id' in r.cash.entries[0],false);
 await assert.rejects(studentApi('/api/rankings-publish',{method:'POST'}),/관리자/);await assertFails(getDoc(doc(student,'sparkAccounts/other')));await assertFails(getDocs(collection(student,'sparkAccounts')));
 await assertFails(setDoc(doc(student,'leaderboards/cash'),{entries:[],participants:0,updatedAt:serverTimestamp()}));await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'leaderboards/cash')));
 await assertFails(setDoc(doc(admin,'leaderboards/cash'),{entries:Array.from({length:101},()=>({name:'x',cash:1,rank:1})),participants:101,updatedAt:serverTimestamp()}));
});

test('company leadership exposes names only and denies student writes and private source reads',async()=>{
 await setDoc(doc(admin,'companyLeadership/main'),{companies:{one:['사장 이름']},updatedAt:serverTimestamp()});
 assert.deepEqual((await getDoc(doc(student,'companyLeadership/main'))).data().companies,{one:['사장 이름']});
 await assertFails(setDoc(doc(student,'companyLeadership/main'),{companies:{one:['위조']},updatedAt:serverTimestamp()}));
 await assertFails(getDoc(doc(student,'users/other')));await assertFails(getDoc(doc(student,'assignments/other')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'companyLeadership/main')));
 await assertFails(setDoc(doc(admin,'companyLeadership/main'),{companies:{},uid:'private',updatedAt:serverTimestamp()}));
});

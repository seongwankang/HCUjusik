import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,serverTimestamp,Timestamp} from 'firebase/firestore';
import {koreaDayStart} from '../../client/market-session.js';
import {createClientApi} from '../../client/data.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,admin,student,studentApi,adminApi;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-rankings',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();for(const [id,role]of [['admin','admin'],['student','student'],['other','president']])await setDoc(doc(db,'users',id),{displayName:id,role,active:true});await setDoc(doc(db,'sparkAccounts/student'),{cash:900000,reservedCash:200000,positions:{one:100},reservedPositions:{one:50}});await setDoc(doc(db,'sparkAccounts/other'),{cash:2000000,positions:{}});await setDoc(doc(db,'companies/one'),{name:'One',ticker:'ONE',status:'listed',referencePrice:10000});await setDoc(doc(db,'sparkBooks/one'),{lastPrice:12000});});
 const claims={email:'school@hcu.hs.kr',email_verified:true},make=(uid)=>createClientApi({db:env.authenticatedContext(uid,claims).firestore(),getUser:async()=>({uid,getIdTokenResult:async()=>({claims})})});admin=env.authenticatedContext('admin',claims).firestore();student=env.authenticatedContext('student',claims).firestore();studentApi=make('student');adminApi=make('admin');
});
after(async()=>env?.cleanup());

test('admin automation is throttled and cannot be invoked by ordinary participants',async()=>{
 await adminApi('/api/rankings-publish',{method:'POST'});
 const before=(await getDoc(doc(student,'sparkAccounts/student'))).data();
 const result=await adminApi('/api/rankings-auto',{method:'POST'});assert.equal(result.updated,false);assert.ok(result.nextAt>Date.now());
 assert.deepEqual((await getDoc(doc(student,'sparkAccounts/student'))).data(),before);
 await assert.rejects(studentApi('/api/rankings-auto',{method:'POST'}),/관리자/);
 await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'leaderboards/cash'),{updatedAt:Timestamp.fromMillis(Date.now()-16*60000)},{merge:true});});
 assert.equal((await adminApi('/api/rankings-auto',{method:'POST'})).updated,true);
 assert.deepEqual((await getDoc(doc(student,'sparkAccounts/student'))).data(),before);
});
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

test('investor details expose projected holdings only; private accounts, stale snapshots and writes stay blocked',async()=>{
 const board=(await studentApi('/api/rankings')).cash,entry=board.entries.find(e=>e.name==='student'),other=board.entries.find(e=>e.name==='other');
 const p=await studentApi('/api/investor-profile?id='+entry.investorKey);assert.equal(p.cash,900000);assert.deepEqual(p.holdings,[{companyId:'one',name:'One',ticker:'ONE',quantity:100}]);
 assert.deepEqual(Object.keys(p).sort(),['cash','holdings','name','updatedAt']);assert.equal((await studentApi('/api/investor-profile?id='+other.investorKey)).cash,2000000);
 await assert.rejects(studentApi('/api/investor-profile?id=other'),/순위표/);await assertFails(getDoc(doc(student,'sparkAccounts/other')));await assertFails(getDocs(collection(student,'investorSnapshots')));
 const ref=doc(student,'investorSnapshots',entry.investorKey),saved=(await getDoc(ref)).data();
 await assertFails(setDoc(ref,{...saved,cash:999999,updatedAt:serverTimestamp()}));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'investorSnapshots',entry.investorKey)));
 await assertFails(setDoc(doc(admin,'investorSnapshots',entry.investorKey),{...saved,email:'private@example.test',updatedAt:serverTimestamp()}));
 await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'users/other'),{displayName:'other',role:'president',active:false}));
 await adminApi('/api/rankings-publish',{method:'POST'});await assertFails(getDoc(doc(student,'investorSnapshots',other.investorKey)));assert.equal((await studentApi('/api/rankings')).cash.participants,1);
});

test('volume counts all pages of today trades once, and percent changes use the previous close',async()=>{
 const start=koreaDayStart();await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();await setDoc(doc(db,'sparkBooks/one/trades/previous'),{price:10000,quantity:999,createdAt:Timestamp.fromMillis(start-1000),marketVersion:1});
  for(let i=0;i<101;i++)await setDoc(doc(db,'sparkBooks/one/trades','today-'+i),{price:12000,quantity:2,createdAt:Timestamp.fromMillis(start+1000+i),marketVersion:i+2});
 });
 const r=await studentApi('/api/rankings');assert.equal(r.volume[0].volume,202);assert.equal(r.gainers[0].change.percent,20);assert.equal(r.losers.length,0);assert.equal(r.unavailable,0);
});

test('top hundred investor snapshots publish atomically within rules batch access limits',async()=>{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await Promise.all(Array.from({length:105},(_,i)=>setDoc(doc(db,'users','bulk-'+i),{displayName:'추가 참가자 '+i,role:'student',active:true})));});
 await adminApi('/api/rankings-publish',{method:'POST'});const board=(await studentApi('/api/rankings')).cash;assert.equal(board.entries.length,100);assert.equal(board.participants,106);
 for(const entry of [board.entries[0],board.entries.at(-1)]){const p=(await getDoc(doc(student,'investorSnapshots',entry.investorKey))).data();assert.equal(p.generation,board.generation);assert.equal(p.cash,entry.cash);}
});

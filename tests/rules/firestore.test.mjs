import assert from 'node:assert/strict';
import {before, after, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, getDocs, collection, query, limit, orderBy, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp} from 'firebase/firestore';
import {publishEvent} from '../../client/events.js';
import {createFirestore} from '../../src/firestore.js';

// Explicit emulator only; never default to production.
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run inside Firestore emulators:exec.');
let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-school-stock',
    firestore: {rules: readFileSync('firestore.rules', 'utf8')}
  });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/a'), {displayName: 'A', role: 'student', active: true}),
      setDoc(doc(db, 'users/b'), {displayName: 'B', role: 'student', active: true}),
      setDoc(doc(db, 'users/inactive'), {displayName: 'I', role: 'student', active: false}),
      setDoc(doc(db, 'portfolios/a'), {cash: 1000000, holdings: [], version: 0}),
      setDoc(doc(db, 'portfolios/b'), {cash: 1000000, holdings: [], version: 0}),
      setDoc(doc(db, 'portfolios/inactive'), {cash: 0, holdings: [], version: 0}),
      setDoc(doc(db, 'assignments/a'), {companyIds: ['club01']}),
      setDoc(doc(db, 'companies/club01'), {ticker: 'CLUB01', name: '동아리 01'}),
      setDoc(doc(db, 'news/n1'), {title: '시험', publishedAt: new Date()})
    ]);
  });
});
after(async () => {await environment?.cleanup();});
test('anonymous reads and unregistered bounded list are denied', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'users/a')));
  await assertFails(getDocs(query(collection(db, 'companies'), limit(100))));
  await assertFails(getDocs(query(collection(environment.authenticatedContext('stranger',{email:'student@hcu.hs.kr',email_verified:true}).firestore(), 'companies'), limit(100))));
});
test('own profile, portfolio, assignments and exact app queries are allowed', async () => {
  const db = environment.authenticatedContext('a',{email:'student@hcu.hs.kr',email_verified:true}).firestore();
  await assertSucceeds(getDoc(doc(db, 'users/a')));
  await assertSucceeds(getDoc(doc(db, 'portfolios/a')));
  await assertSucceeds(getDoc(doc(db, 'assignments/a')));
  await assertSucceeds(getDocs(query(collection(db, 'companies'), orderBy('ticker'), limit(100))));
  await assertSucceeds(getDocs(query(collection(db, 'news'), orderBy('publishedAt', 'desc'), limit(30))));
});
test('REST listDocuments pageSize permits the exact Worker requests', async () => {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const token = encode({alg: 'none', typ: 'JWT'}) + '.' + encode({
    sub: 'a', user_id: 'a', aud: 'demo-school-stock', email:'student@hcu.hs.kr', email_verified:true,
    iss: 'https://securetoken.google.com/demo-school-stock',
    iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600,
    auth_time: Math.floor(Date.now()/1000),
    firebase: {sign_in_provider: 'password', identities: {}}
  }) + '.';
  const rest = createFirestore({FIREBASE_PROJECT_ID: 'demo-school-stock'}, token,
    (url, options) => fetch(url.replace('https://firestore.googleapis.com',
      `http://${process.env.FIRESTORE_EMULATOR_HOST}`), options));
  const companies = await rest.list('companies', 100, 'ticker');
  if (companies[0]?.id !== 'club01') throw new Error('REST companies mismatch');
  const news = await rest.list('news', 30, 'publishedAt desc');
  if (news[0]?.id !== 'n1') throw new Error('REST news mismatch');
});
test('other UID, user lists, asset lists, unbounded and oversized lists denied', async () => {
  const db = environment.authenticatedContext('a',{email:'student@hcu.hs.kr',email_verified:true}).firestore();
  await assertFails(getDoc(doc(db, 'users/b')));
  await assertFails(getDoc(doc(db, 'portfolios/b')));
  await assertFails(getDoc(doc(db, 'assignments/b')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(getDocs(collection(db, 'portfolios')));
  await assertFails(getDocs(collection(db, 'companies')));
  await assertFails(getDocs(query(collection(db, 'companies'), limit(101))));
  await assertFails(getDocs(query(collection(db, 'news'), limit(31))));
});
test('inactive registration denies asset and company reads', async () => {
  const db = environment.authenticatedContext('inactive',{email:'student@hcu.hs.kr',email_verified:true}).firestore();
  await assertSucceeds(getDoc(doc(db, 'users/inactive')));
  await assertFails(getDoc(doc(db, 'portfolios/inactive')));
  await assertFails(getDoc(doc(db, 'companies/club01')));
});
test('all client writes denied, even with claimed admin role', async () => {
  for (const uid of ['a', 'b']) {
    const db = environment.authenticatedContext(uid, {admin: true}).firestore();
    for (const path of [`users/${uid}`, `portfolios/${uid}`, `assignments/${uid}`, 'companies/club01', 'news/n1', 'orders/o1']) {
      await assertFails(setDoc(doc(db, path), {cash: -1, role: 'admin', active: true}));
      await assertFails(updateDoc(doc(db, path), {cash: 9007199254740992, extraData: 'x'.repeat(10000)}));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});
test('unknown paths and orphan subcollections denied', async () => {
  const db = environment.authenticatedContext('a',{email:'student@hcu.hs.kr',email_verified:true}).firestore();
  await assertFails(getDoc(doc(db, 'admin/config')));
  await assertFails(getDoc(doc(db, 'users/a/private/key')));
  await assertFails(setDoc(doc(db, 'users/a/private/key'), {value: 'test'}));
});

test('admin rules allow content and atomic registration, deny escalation and asset edits', async()=>{
 await environment.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users/operator'),{displayName:'Operator',role:'admin',active:true});});
 const db=environment.authenticatedContext('operator',{email:'student@hcu.hs.kr',email_verified:true}).firestore();
 const company={name:'Test',ticker:'TEST',category:'Test',description:'Test',status:'listed',referencePrice:10000,issuedShares:1000,companyCash:0,dailyRevenue:0};
 await assertSucceeds(setDoc(doc(db,'companies/test'),company));
 await assertSucceeds(updateDoc(doc(db,'companies/test'),{name:'Updated'}));
 await assertFails(updateDoc(doc(db,'companies/test'),{referencePrice:20000}));
 await assertFails(updateDoc(doc(db,'portfolios/a'),{cash:999}));
 await assertFails(setDoc(doc(db,'users/evil'),{displayName:'Evil',role:'admin',active:true}));
 await assertFails(updateDoc(doc(db,'users/operator'),{role:'student'}));
 await assertFails(setDoc(doc(db,'users/new-student'),{displayName:'New',role:'president',active:true}));
 await environment.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users/new-student'),{displayName:'New',role:'student',active:true});});
 await assertSucceeds(updateDoc(doc(db,'users/new-student'),{role:'president'}));
 await assertSucceeds(setDoc(doc(db,'assignments/new-student'),{companyIds:['test']}));
 await assertSucceeds(setDoc(doc(db,'news/admin-news'),{title:'News',content:'Content',companyId:'test',companyName:'Updated',publishedAt:serverTimestamp()}));
 await assertSucceeds(publishEvent(db,{id:'event1',type:'random',title:'Event',content:'Content',companyId:'test',deadline:new Date(Date.now()+86400000).toISOString(),effect:{kind:'none'}}));
 await assertFails(setDoc(doc(environment.authenticatedContext('a',{email:'student@hcu.hs.kr',email_verified:true}).firestore(),'events/student-event'),{title:'Event',content:'Content',companyId:'test',startsAt:'2026-10-01',endsAt:'2026-10-02'}));
 await assertFails(updateDoc(doc(environment.authenticatedContext('a',{email:'student@hcu.hs.kr',email_verified:true}).firestore(),'users/a'),{role:'admin'}));
});

test('self signup is atomic, one-time and cannot choose roles or cash',async()=>{
 const db=environment.authenticatedContext('signup-student',{email:'student@hcu.hs.kr',email_verified:true}).firestore();
 const user=doc(db,'users/signup-student'),asset=doc(db,'portfolios/signup-student');
 await assertFails(setDoc(user,{displayName:'Student',role:'student',active:true}));
 const forged=writeBatch(db);forged.set(user,{displayName:'Student',role:'admin',active:true});forged.set(asset,{cash:1000000,holdings:[],version:0});await assertFails(forged.commit());
 const rich=writeBatch(db);rich.set(user,{displayName:'Student',role:'student',active:true});rich.set(asset,{cash:2000000,holdings:[],version:0});await assertFails(rich.commit());
 const batch=writeBatch(db);batch.set(user,{displayName:'Student',role:'student',active:true});batch.set(asset,{cash:1000000,holdings:[],version:0});await assertSucceeds(batch.commit());
 await assertFails(updateDoc(user,{role:'president'}));
 await assertFails(setDoc(asset,{cash:1000000,holdings:[],version:0}));
});

test('unverified and non-school users cannot register or read market; existing admin exempt',async()=>{
 for(const claims of [{email:'student@hcu.hs.kr',email_verified:false},{email:'student@gmail.com',email_verified:true},{email:'student@hcu.hs.kr.evil.test',email_verified:true},{email:'student@sub.hcu.hs.kr',email_verified:true}]){
  const db=environment.authenticatedContext('email-test',claims).firestore();const b=writeBatch(db);b.set(doc(db,'users/email-test'),{displayName:'Student',role:'student',active:true});b.set(doc(db,'portfolios/email-test'),{cash:1000000,holdings:[],version:0});await assertFails(b.commit());await assertFails(getDocs(query(collection(db,'companies'),limit(100))));
 }
 const db=environment.authenticatedContext('operator',{email:'admin@example.test',email_verified:false}).firestore();await assertSucceeds(getDocs(query(collection(db,'companies'),limit(100))));
});

test('direct Firebase client uses transactions and preserves authorization',async()=>{
 const {createClientApi}=await import('../../client/data.js');
 const make=(uid,role='student')=>createClientApi({db:environment.authenticatedContext(uid,{email:role==='admin'?'admin@gmail.com':'student@hcu.hs.kr',email_verified:role!=='admin'}).firestore(),getUser:async()=>({uid,getIdTokenResult:async()=>({claims:{email:role==='admin'?'admin@gmail.com':'student@hcu.hs.kr',email_verified:role!=='admin'}})})});
 const student=make('pages-student');await assert.rejects(student('/api/me'),{code:'registration-required'});
 await student('/api/register',{method:'POST',body:JSON.stringify({displayName:'Pages student'})});
 assert.equal((await student('/api/portfolio')).cash,1000000);
 await student('/api/register',{method:'POST',body:JSON.stringify({displayName:'Other name'})});
 await assert.rejects(student('/api/admin/news'),/관리자/);
 await assert.rejects(student('/api/orders',{method:'POST'}),/주문/);
 const admin=make('operator','admin');
 await admin('/api/admin/news',{method:'POST',body:JSON.stringify({id:'pages-news',title:'Pages News',content:'Test',companyId:'test'})});
 assert.ok((await student('/api/news')).news.some(n=>n.id==='pages-news'&&typeof n.publishedAt==='string'));
 await admin('/api/admin/users',{method:'POST',body:JSON.stringify({id:'pages-student',displayName:'Forged',role:'president',active:false,companyIds:['test']})});
 await assert.rejects(student('/api/portfolio'),/비활성/);
 await assert.rejects(student('/api/me'),error=>error.code!=='registration-required'&&error.message.includes('비활성'));
 const saved=await getDoc(doc(environment.authenticatedContext('operator',{email:'admin@gmail.com',email_verified:false}).firestore(),'users/pages-student'));assert.equal(saved.data().displayName,'Pages student');
});

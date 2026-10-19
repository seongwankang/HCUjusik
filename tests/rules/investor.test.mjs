import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,limit,Timestamp,updateDoc,writeBatch,serverTimestamp,deleteDoc} from 'firebase/firestore';
import {createClientApi} from '../../client/data.js';
import {initialOperations,invest,koreaDay} from '../../client/economy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,db,api;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-investor',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();
 await setDoc(doc(d,'users/viewer'),{displayName:'Investor',role:'student',active:true});
 for(const id of ['one','two'])await setDoc(doc(d,'companies',id),{name:id,ticker:id,status:'listed',issuedShares:10,referencePrice:10000});
 await setDoc(doc(d,'companyOperations/one'),{...initialOperations(),factory:1,revenue:1000,dividendBps:5000,production:{factory:1000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});
 await setDoc(doc(d,'sparkBooks/one'),{issuedShares:10,treasuryShares:0,issuerCash:100000});
 await setDoc(doc(d,'sparkAccounts/viewer'),{cash:1000,positions:{one:2},reservedPositions:{one:2}});
 await setDoc(doc(d,'sparkAccounts/other'),{cash:999999,positions:{one:8}});
 const at=Timestamp.fromMillis(Date.now()-1000),effect={kind:'revenue',asset:'factory',percent:-20,count:0,hours:48};
 await setDoc(doc(d,'events/applied'),{title:'공개된 생산 차질',startsAt:at,type:'choice',targets:['one'],options:['A','B','C']});
 await setDoc(doc(d,'companyEffects/one/items/applied'),{option:1,effect,effectiveAt:at,appliedAt:at});
 await setDoc(doc(d,'eventOutcomes/applied/options/0'),{effect:{...effect,percent:500}});
 await setDoc(doc(d,'companyChoices/one/items/applied'),{option:1,chosenAt:at});
 });
 const claims={email:'investor@hcu.hs.kr',email_verified:true};db=env.authenticatedContext('viewer',claims).firestore();api=createClientApi({db,getUser:async()=>({uid:'viewer',getIdTokenResult:async()=>({claims})})});
});
after(async()=>env?.cleanup());
test('student investor reads applied effects and own estimated dividends; query UID cannot select another account',async()=>{
 const d=await api('/api/company-investor?companyId=one&uid=other');assert.equal(d.factory,1);assert.equal(d.dividendBps,5000);assert.equal(d.myShares,2);assert.equal(d.tomorrowRevenue,1600);assert.equal(d.perShare,80);assert.equal(d.myDividend,160);assert.equal(d.activeEvents[0].title,'공개된 생산 차질');
 await assertFails(getDoc(doc(db,'sparkAccounts/other')));await assertFails(getDoc(doc(db,'companyChoices/one/items/applied')));await assertFails(getDoc(doc(db,'eventOutcomes/applied/options/0')));
 await assertFails(updateDoc(doc(db,'companyOperations/one'),{dividendBps:10000}));await assertFails(setDoc(doc(db,'companyEffects/one/items/forged'),{effect:{kind:'none'}}));
 await assertFails(getDocs(collection(db,'companyEffects/one/items')));
 assert.equal((await getDocs(query(collection(db,'companyEffects/one/items'),limit(100)))).size,1);
 const missing=await api('/api/company-investor?companyId=two');assert.equal(missing.initialized,false);assert.equal((await getDoc(doc(db,'companyOperations/two'))).exists(),false);
});

test('student sees actual event results and president investments; records cannot be forged, edited or removed',async()=>{
 const cid='ledger',at=Timestamp.now();
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();
  await setDoc(doc(d,'users/boss'),{displayName:'사장',role:'president',active:true});await setDoc(doc(d,'assignments/boss'),{companyIds:[cid]});
  await setDoc(doc(d,'companies',cid),{name:'기록 기업',status:'listed',referencePrice:10000,issuedShares:1000});
  await setDoc(doc(d,'companyOperations',cid),initialOperations());await setDoc(doc(d,'sparkBooks',cid),{issuerCash:10000000,issuedShares:1000,treasuryShares:1000});
  await setDoc(doc(d,'events/support-ledger'),{title:'실제 지원금',type:'random',startsAt:at});
  await setDoc(doc(d,'companyEffects',cid,'items','support-ledger'),{effect:{kind:'cash',amount:1000000},result:{amount:1000000},appliedAt:at,effectiveAt:at});
  await setDoc(doc(d,'events/unapplied-ledger'),{title:'미공개 결과',type:'choice',startsAt:at});await setDoc(doc(d,'eventOutcomes/unapplied-ledger/options/0'),{effect:{kind:'cash',amount:999999}});
 });
 const boss=env.authenticatedContext('boss',{email:'boss@hcu.hs.kr',email_verified:true}).firestore();
 await invest(boss,cid,'factory');await invest(boss,cid,'employee');
 const records=await getDocs(query(collection(db,'companyOperations',cid,'investments'),limit(30)));assert.equal(records.size,2);
 const result=await api('/api/company-history?companyId='+cid);assert.equal(result.rows.length,3);assert.ok(result.rows.some(r=>r.title==='공장 1개 건설'&&r.description.includes('2,000,000원')));assert.ok(result.rows.some(r=>r.title==='직원 1명 채용'&&r.description.includes('100,000원')));assert.ok(result.rows.some(r=>r.title==='실제 지원금'));assert.equal(JSON.stringify(result.rows).includes('미공개 결과'),false);
 await assertFails(getDocs(collection(db,'companyOperations',cid,'investments')));
 const existing=doc(boss,'companyOperations',cid,'investments',records.docs[0].id);await assertFails(updateDoc(existing,{cost:1}));await assertFails(deleteDoc(existing));await assertFails(setDoc(doc(db,'companyOperations',cid,'investments','student-fake'),{asset:'factory',quantity:1,cost:1,createdAt:serverTimestamp(),activeFromDay:koreaDay()+1}));
 const o=(await getDoc(doc(boss,'companyOperations',cid))).data();
 const patch={lastInvestment:'forged-record',factory:o.factory+1,cash:o.cash-1,pendingRevenue:o.pendingRevenue+400000,pendingProduction:{...o.pendingProduction,factory:o.pendingProduction.factory+400000}};
 const batch=writeBatch(boss);batch.set(doc(boss,'companyOperations',cid,'investments','forged-record'),{asset:'factory',quantity:1,cost:1,createdAt:serverTimestamp(),activeFromDay:koreaDay()+1});batch.update(doc(boss,'companyOperations',cid),patch);await assertFails(batch.commit());
 await assertFails(updateDoc(doc(boss,'companyOperations',cid),{...patch,lastInvestment:'missing-record',cash:o.cash-2000000}));
 assert.equal((await getDocs(query(collection(db,'companyOperations',cid,'investments'),limit(30)))).size,2);assert.equal((await getDoc(doc(boss,'companyOperations',cid))).data().cash,7900000);
 await env.withSecurityRulesDisabled(async c=>{const term={eventId:'all-discount',percent:-20,startsAt:Date.now()-1000,endsAt:Date.now()+86400000};await updateDoc(doc(c.firestore(),'companyOperations',cid),{costEvents:{factory:term,equipment:term,research:term,employee:term}});});
 await invest(boss,cid,'research');const discounted=await api('/api/company-history?companyId='+cid);assert.ok(discounted.rows.some(r=>r.title==='R&D센터 1개 건설'&&r.description.includes('400,000원')));
});


test('student history pages past thirty investments and retains the older cash-loss receipt',async()=>{
 const cid='paged-history',now=Date.now();
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();
  await setDoc(doc(d,'companies',cid),{name:'Pagination fixture',status:'listed'});
  await setDoc(doc(d,'companyOperations',cid),initialOperations());
  await setDoc(doc(d,'events/history-loss'),{title:'실제 손실금',type:'random',startsAt:Timestamp.fromMillis(now-60000)});
  await setDoc(doc(d,'companyEffects',cid,'items','history-loss'),{effect:{kind:'cash',amount:-1000000},result:{amount:-54246},appliedAt:Timestamp.fromMillis(now-60000)});
  await Promise.all(Array.from({length:35},(_,n)=>setDoc(doc(d,'companyOperations',cid,'investments','buy-'+n),{asset:'employee',quantity:1,cost:100000,activeFromDay:koreaDay(),createdAt:Timestamp.fromMillis(now-1000)})));
 });
 const summary=await api('/api/company-investor?companyId='+cid);assert.equal(summary.historyPending,true);assert.deepEqual(summary.recentHistory,[]);
 const first=await api('/api/company-history?companyId='+cid);assert.equal(first.rows.length,20);assert.ok(first.next);
 const second=await api('/api/company-history?companyId='+cid+'&cursor='+encodeURIComponent(JSON.stringify(first.next)));assert.equal(second.next,null);
 const result={rows:[...first.rows,...second.rows]};
 assert.equal(result.rows.length,36);assert.equal(new Set(result.rows.map(r=>r.id)).size,36);
 assert.equal(result.rows.at(-1).id,'history-loss');assert.equal(result.rows.at(-1).amount,-54246);assert.match(result.rows.at(-1).description,/-54,246원/);
});

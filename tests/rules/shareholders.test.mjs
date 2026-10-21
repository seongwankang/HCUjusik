import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,writeBatch,serverTimestamp} from 'firebase/firestore';
import {publishCashRankings} from '../../client/rankings.js';
import {createClientApi} from '../../client/data.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('only assigned president/admin reads projected company holdings; no private accounts or other companies',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-company-shareholders',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 try{
  await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore(),b=writeBatch(d);for(const [uid,role] of [['admin','admin'],['boss','president'],['other','president'],['student','student']])b.set(doc(d,'users',uid),{displayName:uid,role,active:true});b.set(doc(d,'assignments/boss'),{companyIds:['one']});b.set(doc(d,'assignments/other'),{companyIds:['two']});for(const id of ['one','two']){b.set(doc(d,'companies',id),{name:id,ticker:id,issuedShares:1000,referencePrice:10000,status:'listed'});b.set(doc(d,'sparkBooks',id),{issuedShares:1000,treasuryShares:id==='one'?880:1000,lastPrice:10000,version:0});}for(let i=0;i<120;i++){b.set(doc(d,'users/u'+i),{displayName:'학생 '+i,role:'student',active:true,email:'private'+i+'@hcu.hs.kr'});b.set(doc(d,'sparkAccounts/u'+i),{cash:2000000,reservedCash:0,positions:{one:1},reservedPositions:{one:1},version:0,lastMarket:'one'});}await b.commit();});
  const claims={email:'test@hcu.hs.kr',email_verified:true},db=uid=>env.authenticatedContext(uid,claims).firestore(),admin=db('admin');
  await publishCashRankings(admin);
  const s=(await getDoc(doc(db('boss'),'companyShareholders/one'))).data();assert.equal(s.entries.length,120);assert.equal(s.holderShares,120);assert.equal(s.entries.some(e=>'cash' in e||'email' in e||'uid' in e),false);
  const api=uid=>createClientApi({db:db(uid),getUser:async()=>({uid,getIdTokenResult:async()=>({claims})})});assert.equal((await api('boss')('/api/company-shareholders?companyId=one')).shareholders.entries.length,120);
  await assert.rejects(api('boss')('/api/company-shareholders?companyId=two'),/담당/);await assert.rejects(api('student')('/api/company-shareholders?companyId=one'),/담당/);
  for(const uid of ['other','student'])await assertFails(getDoc(doc(db(uid),'companyShareholders/one')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'companyShareholders/one')));await assertFails(getDocs(collection(db('boss'),'companyShareholders')));
  await assertFails(getDoc(doc(db('boss'),'sparkAccounts/u0')));await assertFails(getDoc(doc(db('boss'),'users/u0')));
  await assertFails(setDoc(doc(db('boss'),'companyShareholders/one'),{...s,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(admin,'companyShareholders/one'),{...s,cash:123,updatedAt:serverTimestamp()}));
  const board=(await getDoc(doc(db('student'),'leaderboards/cash'))).data();assert.equal(board.entries.length,100);for(const row of board.entries)assert.equal(row.cash+row.stockValue,row.totalValue);
 }finally{await env.cleanup();}
});

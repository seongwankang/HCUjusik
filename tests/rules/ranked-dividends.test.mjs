import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,limit,writeBatch,serverTimestamp} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {buildJob} from '../../scripts/build-jobs.mjs';
import {changeDividendRate,DIVIDEND_NEWS_CONTENT} from '../../client/dividend-rate.js';
import {initialOperations,koreaDay} from '../../client/economy.js';
const rules=readFileSync('firestore.rules','utf8'),claims={email:'test@hcu.hs.kr',email_verified:true};
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('rank snapshot freezes revenue/rate before payouts, company charge is separate, and retries never credit twice',async()=>{
 writeFileSync('.generated-rank-dividend-entry.mjs',"export {prepareDividendRound,publishDividendForecast} from './client/dividend-rounds.js';export {settleDay} from './client/economy.js';export {migrateRankedDividends} from './server/ranked-dividend-migration.js';");await buildJob('.generated-rank-dividend-entry.mjs','.generated-rank-dividend-job.mjs');
 const job=await import('../../.generated-rank-dividend-job.mjs?'+Date.now()),app=initializeApp({projectId:'demo-rank-dividend-payout'},'rank-dividend'),db=getFirestore(app);
 try{
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-rank-dividend-payout/databases/(default)/documents',{method:'DELETE'});
  for(const [id,factory,rate,sold] of [['top',4,1500,2],['bottom',1,1000,1]]){
   await db.doc('companies/'+id).set({name:id,status:'listed'});
   await db.doc('companyOperations/'+id).set({...initialOperations(),cash:10000000,dividendModel:'rank-v1',dividendBps:rate,factory,revenue:factory*440000,production:{factory:factory*440000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});
   await db.doc('sparkBooks/'+id).set({issuerCash:0,issuedShares:1000,treasuryShares:1000-sold});
  }
  await db.doc('sparkAccounts/holder').set({cash:1000000,version:0,positions:{top:2,bottom:1},reservedCash:0,reservedPositions:{},lastMarket:''});
  const round=await job.prepareDividendRound(db,koreaDay());assert.deepEqual(round.entries.map(r=>[r.id,r.rank,r.rankBase]),[['top',1,150],['bottom',2,145]]);
  await db.doc('companyOperations/top').update({dividendBps:3000,revenue:0,production:{factory:0,equipment:0,research:0}});
  await job.settleDay(db,'top');let receipt=(await db.doc('companyOperations/top/days/d'+koreaDay()).get()).data();
  assert.equal(receipt.perShare,2250);assert.equal(receipt.companyCharge,360000);assert.equal(receipt.dividend,4500);assert.equal((await db.doc('companyOperations/top').get()).data().cash,12040000);
  await assert.rejects(job.settleDay(db,'top'));
  await job.settleDay(db,'bottom');assert.equal((await db.doc('sparkAccounts/holder').get()).data().cash,1005950);
  assert.equal((await db.doc('companyOperations/bottom/days/d'+koreaDay()).get()).data().rank,2);
  const migrated=await job.migrateRankedDividends(db);assert.equal(migrated.model,'rank-v1');assert.equal((await db.doc('companyOperations/top').get()).data().cash,12040000);
 }finally{await db.terminate();await deleteApp(app);}
});
test('president rate update and linked auto-news are atomic; range, clock, roles and one-change rules hold',async()=>{
 for(const [minute,allowed] of [[479,false],[480,true],[1019,true],[1020,false]]){
  const env=await initializeTestEnvironment({projectId:'demo-rate-news-'+minute,firestore:{rules:rules.replaceAll('let minute=(int(request.time.toMillis() / 60000)+540)%1440;','let minute='+minute+';')}});
  try{
   await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const [id,role] of [['boss','president'],['boss2','president'],['student','student'],['admin','admin']]){await setDoc(doc(d,'users',id),{role,active:true});await setDoc(doc(d,'assignments',id),{companyIds:['one']});}await setDoc(doc(d,'companies/one'),{name:'회사'});await setDoc(doc(d,'companyOperations/one'),{...initialOperations(),dividendModel:'rank-v1',dividendBps:1000});});
   const db=env.authenticatedContext('boss',claims).firestore(),now=koreaDay()*86400000-32400000+minute*60000;
   if(!allowed){await assert.rejects(changeDividendRate(db,'one',1500,now));continue;}
   const second=env.authenticatedContext('boss2',claims).firestore(),results=await Promise.allSettled([changeDividendRate(db,'one',1500,now),changeDividendRate(second,'one',2000,now)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const news=await getDocs(query(collection(db,'news'),limit(30)));assert.equal(news.size,1);const o=(await getDoc(doc(db,'companyOperations/one'))).data();assert.equal(o.lastDividendNews,news.docs[0].id);assert.equal(news.docs[0].data().dividendChange.toBps,o.dividendBps);
   await assert.rejects(changeDividendRate(db,'one',2500,now));
   await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'companyOperations/one'),{...initialOperations(),dividendModel:'rank-v1',dividendBps:1000}));
   const student=env.authenticatedContext('student',claims).firestore();await assertFails(changeDividendRate(student,'one',1500,now));
   const batch=writeBatch(db),nid='invalid-rate';batch.update(doc(db,'companyOperations/one'),{dividendBps:3100,lastDividendDay:koreaDay(),lastDividendNews:nid});batch.set(doc(db,'news',nid),{title:'회사 배당률 변경',content:DIVIDEND_NEWS_CONTENT,category:'기업 뉴스',companyId:'one',companyName:'회사',dividendChange:{day:koreaDay(),fromBps:1000,toBps:3100},publishedAt:serverTimestamp()});await assertFails(batch.commit());assert.equal((await getDoc(doc(db,'news',nid))).exists(),false);
  }finally{await env.cleanup();}
 }
});

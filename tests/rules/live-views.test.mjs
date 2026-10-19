import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc} from 'firebase/firestore';
import {createViewReads} from '../../client/live-reads.js';
import {createClientApi} from '../../client/data.js';
import {initializeSpark,placeSpark,matchSpark} from '../../client/spark-exchange.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,db,api,reads,other;const changes=[];
const claims={email:'fixture@hcu.hs.kr',email_verified:true};
async function eventually(fn){for(let n=0;n<150;n++){try{if(await fn())return;}catch{}await new Promise(r=>setTimeout(r,20));}assert.fail('Expected live snapshot update');}
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-live-views',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{for(const uid of ['viewer','other'])await setDoc(doc(c.firestore(),'users',uid),{displayName:uid,role:'student',active:true});await setDoc(doc(c.firestore(),'companies/one'),{name:'회사',ticker:'ONE',status:'listed',referencePrice:10000,issuedShares:1000,description:'소개'});});
 db=env.authenticatedContext('viewer',claims).firestore();other=env.authenticatedContext('other',claims).firestore();await initializeSpark(db,'viewer','one');await initializeSpark(other,'other','one');
 reads=createViewReads(db,path=>changes.push(path));api=createClientApi({db,viewReads:reads,getUser:async()=>({uid:'viewer',getIdTokenResult:async()=>({claims})})});
});
after(async()=>{reads?.clear();await env?.cleanup();});
test('repeated views share snapshots; another account trade and company edits arrive without manual reload',async()=>{
 const company=await api('/api/companies'),view=await api('/api/exchange?companyId=one');assert.equal(company.companies[0].description,'소개');assert.equal(view.market.lastPrice,0);
 const info=await api('/api/company-investor?companyId=one');assert.equal(info.historyPending,true);assert.deepEqual(info.recentHistory,[]);
 const first=await reads.getDoc(doc(db,'companies/one'));assert.equal(first,await reads.getDoc(doc(db,'companies/one')));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companies/one'),{description:'변경된 소개'}));
 await eventually(async()=>(await api('/api/companies')).companies[0].description==='변경된 소개');
 await placeSpark(other,'other',{companyId:'one',orderId:'other-buy',side:'buy',price:10000,quantity:1});await matchSpark(other,'other','one');
 await eventually(async()=>(await api('/api/exchange?companyId=one')).market.lastPrice===10000);
 const fresh=await api('/api/exchange?companyId=one');assert.equal(fresh.market.treasuryShares,999);assert.equal(fresh.marketTrades.length,1);assert.ok(changes.length);
 // Our own SDK write first emits pending data, followed by a metadata-only acknowledgement.
 await placeSpark(db,'viewer',{companyId:'one',orderId:'own-buy-order',side:'buy',price:10000,quantity:2});await matchSpark(db,'viewer','one');
 await eventually(async()=>(await api('/api/trading-portfolio')).holdings[0]?.quantity===2);
 assert.equal((await api('/api/trading-portfolio')).holdings[0].averagePrice,10000);
});
test('own account updates change portfolio; cached profile cannot authorize writes after deactivation',async()=>{
 assert.equal((await api('/api/trading-portfolio')).cash,980000);
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'sparkAccounts/viewer'),{cash:900000,version:1}));
 await eventually(async()=>(await api('/api/trading-portfolio')).cash===900000);
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/viewer'),{active:false}));
 await assert.rejects(api('/api/limit-order',{method:'POST',body:JSON.stringify({companyId:'one',orderId:'blocked',side:'buy',price:10000,quantity:1})}),/비활성화/);
 await eventually(async()=>{try{await api('/api/me');return false;}catch(e){return /비활성화/.test(e.message);}});
});

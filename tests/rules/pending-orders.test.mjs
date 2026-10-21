import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,writeBatch,getDocs,collection,query,where,orderBy,documentId,limit,updateDoc} from 'firebase/firestore';
import {createClientApi} from '../../client/data.js';
import {openBuyOrders} from '../../client/pending-orders.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('portfolio includes all 65 open buys beyond a 30-order page, pending-only symbols and partial remaining quantities; no double valuation',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-portfolio-pending-buys',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 try{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore(),b=writeBatch(d);for(const uid of ['student','other'])b.set(doc(d,'users',uid),{displayName:uid,role:'student',active:true});b.set(doc(d,'sparkAccounts/student'),{cash:1000000,reservedCash:660000,positions:{one:2},reservedPositions:{},version:0,lastMarket:'one'});for(const id of ['one','two']){b.set(doc(d,'companies',id),{name:id,ticker:id,referencePrice:10000});b.set(doc(d,'sparkBooks',id),{lastPrice:id==='one'?12000:10000});}for(let i=0;i<65;i++)b.set(doc(d,'sparkAccounts/student/orders','buy'+String(i).padStart(3,'0')),{companyId:i===64?'one':'two',side:'buy',status:'open',price:10000,quantity:i===0?5:1,remaining:i===0?2:1,filled:i===0?3:0});b.set(doc(d,'sparkAccounts/student/orders/closed'),{companyId:'one',side:'buy',status:'filled',price:10000,remaining:0});b.set(doc(d,'sparkAccounts/student/orders/sell'),{companyId:'one',side:'sell',status:'open',price:10000,remaining:1});await b.commit();});
 const claims={email:'student@hcu.hs.kr',email_verified:true},db=env.authenticatedContext('student',claims).firestore(),api=createClientApi({db,getUser:async()=>({uid:'student',getIdTokenResult:async()=>({claims})})});
 assert.equal((await openBuyOrders(db,'student')).length,65);const p=await api('/api/trading-portfolio');assert.equal(p.holdings.length,1);assert.equal(p.pendingBuys.length,2);assert.equal(p.pendingBuys.find(r=>r.companyId==='two').quantity,65);assert.equal(p.pendingBuys.find(r=>r.companyId==='two').name,'two');assert.equal(p.stockValue,24000);assert.equal(p.totalValue,1024000);assert.equal(p.availableCash,340000);
 await assertFails(openBuyOrders(db,'other'));await assertFails(getDocs(query(collection(db,'sparkAccounts/student/orders'),where('status','==','open'),orderBy(documentId()),limit(31))));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'sparkAccounts/student/orders/buy000'),{status:'cancelled',remaining:0}));assert.equal((await api('/api/trading-portfolio')).pendingBuys.find(r=>r.companyId==='two').quantity,63);
 }finally{await env.cleanup();}
});

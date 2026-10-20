import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,collection,getDocs} from 'firebase/firestore';
import {testPortfolio,testOrder,emptyAccount} from '../../client/trading.js';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Emulator required');
let env,db;
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-trading-tests',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();await Promise.all(['a','b','inactive','unverified'].map(uid=>setDoc(doc(d,'users',uid),{displayName:uid,role:'student',active:uid!=='inactive'})));await setDoc(doc(d,'companies/test-a'),{name:'Test A',status:'listed',referencePrice:10000});await setDoc(doc(d,'companies/test-b'),{name:'Test B',status:'listed',referencePrice:20000});});
 db=env.authenticatedContext('a',{email:'a@hcu.hs.kr',email_verified:true}).firestore();
});
after(async()=>env?.cleanup());
const order=(id,extra={})=>({orderId:id,companyId:'test-a',side:'buy',quantity:1,price:10000,...extra});
test('test account and buy/sell are atomic, persistent and idempotent',async()=>{
 assert.equal((await testPortfolio(db,'a')).cash,2000000);
 await testOrder(db,'a',order('one',{quantity:3}));
 let a=await testPortfolio(db,'a');assert.equal(a.cash,1970000);assert.equal(a.positions['test-a'],3);assert.equal(a.orders.length,1);
 assert.equal((await testOrder(db,'a',order('one',{quantity:3}))).duplicate,true);
 await assert.rejects(testOrder(db,'a',order('one',{quantity:2})),/내용/);
 await testOrder(db,'a',order('two',{side:'sell',quantity:2}));
 a=await testPortfolio(db,'a');assert.equal(a.cash,1990000);assert.equal(a.positions['test-a'],1);assert.equal(a.version,2);
 await assert.rejects(testOrder(db,'a',order('too-many',{side:'sell',quantity:2})),/보유/);
 await assert.rejects(testOrder(db,'a',order('too-rich',{quantity:300})),/잔액/);
 await assert.rejects(testOrder(db,'a',order('stale',{price:1})),/가격/);
 await assertSucceeds(getDoc(doc(db,'tradeTests/a')));
 await assertFails(setDoc(doc(db,'tradeTests/a'),emptyAccount()));
});
test('parallel transactions serialize and duplicate requests fill once',async()=>{
 await Promise.all([testOrder(db,'a',order('parallel-1')),testOrder(db,'a',order('parallel-2'))]);
 let a=await testPortfolio(db,'a');assert.equal(a.cash,1970000);assert.equal(a.positions['test-a'],3);
 await Promise.all([testOrder(db,'a',order('duplicate')),testOrder(db,'a',order('duplicate'))]);
 a=await testPortfolio(db,'a');assert.equal(a.cash,1960000);assert.equal(a.positions['test-a'],4);assert.equal(a.version,5);
});
test('direct SDK tampering, foreign data, inactive and unverified are rejected',async()=>{
 await assertFails(updateDoc(doc(db,'tradeTests/a'),{cash:1000000}));
 await assertFails(deleteDoc(doc(db,'tradeTests/a')));
 await assertFails(updateDoc(doc(db,'tradeTests/a/orders/one'),{quantity:50}));
 await assertFails(getDoc(doc(db,'tradeTests/b')));
 await assertFails(getDocs(collection(db,'tradeTests')));
 await assertFails(getDocs(collection(db,'tradeTests/a/orders')));
 for(const uid of ['inactive','unverified']){const d=env.authenticatedContext(uid,{email:'test@hcu.hs.kr',email_verified:uid!=='unverified'}).firestore();await assertFails(setDoc(doc(d,'tradeTests',uid),emptyAccount()));}
 const anon=env.unauthenticatedContext().firestore();await assertFails(getDoc(doc(anon,'tradeTests/a')));
 await assertFails(setDoc(doc(db,'tradeTests/a/orders/orphan'),{version:6}));
});
test('two sessions cannot spend the same balance twice',async()=>{
 const claims={email:'b@hcu.hs.kr',email_verified:true};
 const left=env.authenticatedContext('b',claims).firestore(),right=env.authenticatedContext('b',claims).firestore();
 await testPortfolio(left,'b');
 const results=await Promise.allSettled([testOrder(left,'b',order('double-left',{quantity:120})),testOrder(right,'b',order('double-right',{quantity:120}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const a=await testPortfolio(left,'b');assert.equal(a.cash,800000);assert.equal(a.positions['test-a'],120);assert.equal(a.orders.length,1);
});
test('forged atomic batches cannot bypass price, balances, quantity, schema or timestamps',async()=>{
 const current=(await getDoc(doc(db,'tradeTests/a'))).data();
 const attempt=async(id,orderChanges={},accountChanges={})=>{
  const b=writeBatch(db),version=current.version+1;
  b.update(doc(db,'tradeTests/a'),{...current,cash:current.cash-10000,positions:{...current.positions,'test-a':current.positions['test-a']+1},version,lastOrderId:id,...accountChanges});
  b.set(doc(db,'tradeTests/a/orders',id),{companyId:'test-a',side:'buy',quantity:1,price:10000,total:10000,version,createdAt:serverTimestamp(),...orderChanges});
  await assertFails(b.commit());
 };
 await attempt('price',{price:1,total:1},{cash:current.cash-1});
 await attempt('negative',{quantity:-1});await attempt('fraction',{quantity:1.5});await attempt('overflow',{quantity:1e15});
 await attempt('free',{}, {cash:current.cash});
 await attempt('extra',{}, {positions:{'test-a':5,'test-b':100}});
 await attempt('pollution',{}, {admin:true});await attempt('omission',{}, {positions:{}});
 await attempt('time',{createdAt:new Date(0)});await attempt('official',{companyId:'official'});
 await attempt('oversell',{side:'sell',quantity:5,total:50000},{cash:current.cash+50000,positions:{'test-a':-1}});
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'companies/test-b'),{status:'paused'}));
 await attempt('paused',{companyId:'test-b',price:20000,total:20000},{cash:current.cash-20000,positions:{...current.positions,'test-b':1}});
 assert.deepEqual((await getDoc(doc(db,'tradeTests/a'))).data(),current);
});

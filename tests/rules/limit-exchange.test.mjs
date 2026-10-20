import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {getDoc,setDoc,doc} from 'firebase/firestore';
import {createExchangeStore} from '../../server/store.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Loopback emulator required');
let app,db,store,env;
const claims={email:'student@hcu.hs.kr',email_verified:true};
const order=(id,extra={})=>({orderId:id,companyId:'test-a',side:'buy',price:10000,quantity:60,...extra});
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-limit-exchange',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 app=initializeApp({projectId:'demo-limit-exchange'},'limit-test');db=getFirestore(app);store=createExchangeStore(db);
 await Promise.all(['a','b','c','inactive'].map(uid=>db.doc('users/'+uid).set({active:uid!=='inactive',role:'student',displayName:uid})));
 await db.doc('companies/test-a').set({status:'listed',referencePrice:10000,issuedShares:100});
});
after(async()=>{await env?.cleanup();await db?.terminate();if(app)await deleteApp(app);});
test('concurrent primary orders cannot oversell issuance; replay survives store recreation',async()=>{
 await Promise.all([store.mutate('a',claims,'order',order('primary-aaaa')),store.mutate('b',claims,'order',order('primary-bbbb'))]);
 const s=(await db.doc('exchangeState/limit-v1').get()).data();assert.equal(s.markets['test-a'].treasuryShares,0);
 assert.equal(s.accounts.a.positions['test-a']+s.accounts.b.positions['test-a'],100);
 const replay=await createExchangeStore(db).mutate('a',claims,'order',order('primary-aaaa'));assert.equal(replay.duplicate,true);
 const data=await store.read('a',claims,'test-a');assert.equal(data.orders.length,1);assert.ok(!JSON.stringify(data).includes('primary-bbbb'));
});
test('parallel orders against one balance cannot double spend and cancellation restores reservation',async()=>{
 const results=await Promise.allSettled([store.mutate('c',claims,'order',order('spend-aaaa',{price:9999,quantity:120})),store.mutate('c',claims,'order',order('spend-bbbb',{price:9999,quantity:120}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const r=results.find(r=>r.status==='fulfilled').value;
 let a=(await store.read('c',claims,'test-a')).account;assert.equal(a.reservedCash,1199880);
 await store.mutate('c',claims,'cancel',{orderId:r.order.orderId});a=(await store.read('c',claims,'test-a')).account;assert.equal(a.reservedCash,0);assert.equal(a.cash,2000000);
 await assert.rejects(store.mutate('b',claims,'cancel',{orderId:r.order.orderId}),/본인/);
});
test('deactivated participants and uncertified identities cannot submit; queued inactive orders release',async()=>{
 await assert.rejects(store.mutate('inactive',claims,'order',order('inactive-order')),/활성/);
 await assert.rejects(store.read('c',{...claims,email_verified:false},'test-a'),/인증/);
 const before=await store.read('b',claims,'test-a');
 await db.doc('users/b').update({active:false});
 await store.mutate('c',claims,'order',order('prune-order',{quantity:1,price:9998}));
 const s=(await db.doc('exchangeState/limit-v1').get()).data();assert.equal(s.accounts.b.reservedCash,0);
 assert.ok(before.account.cash>=0);
});
test('client users including admin cannot read private exchange state or write settlements',async()=>{
 for(const uid of ['a','operator']){
  const client=env.authenticatedContext(uid,claims).firestore();
  await assertFails(getDoc(doc(client,'exchangeState/limit-v1')));
  await assertFails(setDoc(doc(client,'exchangeState/limit-v1'),{cash:99999999}));
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {buildJob} from '../../scripts/build-jobs.mjs';
import {emptyIndexes,insertIndexes} from '../../client/order-index.js';
import {priceLimitDay} from '../../client/daily-price-limits.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('trusted preparation freezes closing EMA, refunds out-of-band orders once, prepares tomorrow without changing today and respects maintenance',async()=>{
 await writeFile('.generated-price-limit-job-entry.mjs',"export {publishDailyPriceLimits} from './server/daily-price-limits.js';");
 await buildJob('.generated-price-limit-job-entry.mjs','.generated-price-limit-job.mjs');
 const {publishDailyPriceLimits}=await import('../../.generated-price-limit-job.mjs?'+Date.now());
 const app=initializeApp({projectId:'demo-daily-limit-job'},'daily-limit-job'),db=getFirestore(app);
 const now=Date.parse('2026-10-22T10:00:00+09:00'),day=priceLimitDay(now);
 try{
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-daily-limit-job/databases/(default)/documents',{method:'DELETE'});
  await db.doc('companies/a').set({name:'A',status:'listed',referencePrice:10000,issuedShares:1000});
  const orders=[{uid:'buyer',id:'old-buy-order',side:'buy',price:30000,quantity:5,remaining:2,sequence:1},{uid:'seller',id:'old-sell-order',side:'sell',price:4000,quantity:3,remaining:3,sequence:2}];
  let book={...emptyIndexes(),initialPrice:10000,issuedShares:1000,treasuryShares:990,issuerCash:100000,lastPrice:10000,orders,version:2,lastAction:{kind:'place',actor:'seller'}};
  for(const o of orders){book={...book,...insertIndexes(book,o).patch};await db.doc('sparkAccounts/'+o.uid).set({cash:1000000,reservedCash:o.side==='buy'?60000:0,positions:{a:o.side==='sell'?10:3},reservedPositions:{a:o.side==='sell'?3:0},version:0,lastMarket:'a'});await db.doc('sparkAccounts/'+o.uid+'/orders/'+o.id).set({...o,companyId:'a',orderId:o.id,status:'open',filled:o.quantity-o.remaining,cancelled:0});}
  await db.doc('sparkBooks/a').set(book);
  const first=await publishDailyPriceLimits(db,{now});assert.deepEqual(first,{updated:1,cancelled:2});
  let current=(await db.doc('sparkBooks/a').get()).data();assert.deepEqual(current.priceLimits,{day,referencePrice:10000,lower:5000,upper:20000});assert.equal(current.orders.length,0);
  assert.equal((await db.doc('sparkAccounts/buyer').get()).data().reservedCash,0);assert.equal((await db.doc('sparkAccounts/seller').get()).data().reservedPositions.a,0);assert.equal((await db.doc('sparkAccounts/seller').get()).data().positions.a,10);
  assert.equal((await db.doc('sparkAccounts/buyer').get()).data().cash,1000000);assert.equal((await db.doc('sparkAccounts/buyer').get()).data().positions.a,3);assert.equal((await db.doc('sparkAccounts/buyer/orders/old-buy-order').get()).data().filled,3);assert.equal((await db.doc('sparkAccounts/buyer/orders/old-buy-order').get()).data().cancelled,2);
  assert.deepEqual(await publishDailyPriceLimits(db,{now}),{updated:0,cancelled:0});
  await db.doc('sparkBooks/a/trades/today').set({price:16000,quantity:10,marketVersion:5,createdAt:Timestamp.fromMillis(now)});await db.doc('sparkBooks/a').update({version:5});
  const night=Date.parse('2026-10-22T21:00:00+09:00');await publishDailyPriceLimits(db,{now:night});
  current=(await db.doc('sparkBooks/a').get()).data();assert.equal(current.priceLimits.referencePrice,10000);assert.equal(current.nextPriceLimits.referencePrice,11600);assert.equal(current.nextPriceLimits.day,day+1);
  // A delayed preparation after a new-day execution must still exclude it.
  await db.doc('sparkBooks/a/trades/next-day').set({price:20000,quantity:1,marketVersion:6,createdAt:Timestamp.fromMillis(now+86400000)});await db.doc('sparkBooks/a').update({version:6});
  await publishDailyPriceLimits(db,{now:now+86400000});current=(await db.doc('sparkBooks/a').get()).data();assert.equal(current.priceLimits.referencePrice,11600);assert.equal(current.nextPriceLimits,undefined);
  await db.doc('systemMaintenance/reset').set({resetId:'test'});assert.equal((await publishDailyPriceLimits(db,{now:now+86400000*2})).maintenance,true);assert.equal((await db.doc('sparkBooks/a').get()).data().priceLimits.day,day+1);
 }finally{await db.terminate();await deleteApp(app);}
});

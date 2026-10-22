import {test} from 'node:test';import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';
import {issueAdditionalShares,ADDITIONAL_OFFERING_ID} from '../../server/additional-offering.js';
import {emptyIndexes,insertIndexes} from '../../client/order-index.js';import {priceLimits,priceLimitDay} from '../../client/daily-price-limits.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('additional company shares preserve ownership, cash, price and orders; retry resumes without double issuance',async()=>{
 const projectId='demo-additional-offering',app=initializeApp({projectId},'additional-offering'),db=getFirestore(app),now=Date.now();
 try{
 await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});
 const orders=[{uid:'buyer',id:'existing-buy',side:'buy',price:10000,quantity:2,remaining:2,sequence:2}];
 let book={...emptyIndexes(),initialPrice:10000,issuedShares:1000,treasuryShares:123,issuerCash:8770000,lastPrice:14000,orders,version:5,priceLimits:priceLimits(10000,priceLimitDay(now))};book={...book,...insertIndexes(book,orders[0]).patch};
 for(const id of ['a','b']){await db.doc('companies/'+id).set({name:id,status:'listed',issuedShares:1000,referencePrice:10000});await db.doc('sparkBooks/'+id).set(book);await db.doc('companyOperations/'+id).set({cash:123456,receivedIssuerCash:1000000,locked:false});}
 await db.doc('sparkAccounts/investor').set({cash:654321,positions:{a:50,b:30},reservedCash:20000,reservedPositions:{a:2}});const account=(await db.doc('sparkAccounts/investor').get()).data();
 const result=await issueAdditionalShares(db,{now});assert.equal(result.issued,2);assert.equal(result.totalAdditionalShares,400);assert.equal(result.unavailableAtCurrentBand,0);
 for(const id of ['a','b']){const after=(await db.doc('sparkBooks/'+id).get()).data();assert.equal(after.issuedShares,1200);assert.equal(after.treasuryShares,323);assert.equal(after.issuedShares-after.treasuryShares,877);assert.equal(after.issuerCash,book.issuerCash);assert.equal(after.lastPrice,14000);assert.deepEqual(after.orders,orders);assert.deepEqual(after.initialIndex,book.initialIndex);assert.deepEqual(after.priceLimits,book.priceLimits);assert.equal((await db.doc('companyOperations/'+id).get()).data().cash,123456);assert.equal((await db.doc('companies/'+id).get()).data().issuedShares,1200);}
 assert.deepEqual((await db.doc('sparkAccounts/investor').get()).data(),account);
 // Simulate a later actual sale; replay must not restore sold treasury shares.
 await db.doc('sparkBooks/a').update({treasuryShares:320,issuerCash:8800000});const repeated=await issueAdditionalShares(db,{now});assert.equal(repeated.issued,0);assert.equal(repeated.alreadyIssued,2);assert.equal((await db.doc('sparkBooks/a').get()).data().treasuryShares,320);
 // Simulate interruption after a receipt: only the missing company's original issuance resumes.
 await db.doc('shareIssuances/'+ADDITIONAL_OFFERING_ID+'/companies/b').delete();await db.doc('sparkBooks/b').set(book);await db.doc('companies/b').update({issuedShares:1000});assert.equal((await issueAdditionalShares(db,{now})).issued,1);assert.equal((await db.doc('sparkBooks/a').get()).data().issuedShares,1200);
 }finally{await db.terminate();await deleteApp(app);}
});
test('preflight rejects an out-of-band issuer price before modifying any company',async()=>{
 const app=initializeApp({projectId:'demo-offering-limit-guard'},'offering-guard'),db=getFirestore(app),now=Date.now();try{
 await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-offering-limit-guard/databases/(default)/documents',{method:'DELETE'});
 for(const id of ['a','b']){await db.doc('companies/'+id).set({status:'listed',issuedShares:1000});await db.doc('sparkBooks/'+id).set({initialPrice:10000,issuedShares:1000,treasuryShares:0,version:0,priceLimits:priceLimits(id==='b'?30000:10000,priceLimitDay(now))});}
 await assert.rejects(issueAdditionalShares(db,{now}),/outside current daily price limits/);assert.equal((await db.doc('sparkBooks/a').get()).data().issuedShares,1000);assert.equal((await db.doc('shareIssuances/'+ADDITIONAL_OFFERING_ID).get()).exists,false);
 }finally{await db.terminate();await deleteApp(app);}
});

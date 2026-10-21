import {test} from 'node:test';import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';
import {reverseAccidentalTrade,AUDITED_FILLS} from '../../server/accidental-trade-correction.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('reverse exactly ten audited fills, preserve unrelated records, restore both sides and back up every mutation atomically',async()=>{
 const app=initializeApp({projectId:'demo-accidental-fill'},'accidental-fill'),db=getFirestore(app);
 try{
 await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-accidental-fill/databases/(default)/documents',{method:'DELETE'});
 await db.doc('companies/meme').set({ticker:'MEME'});await db.doc('users/admin0001').set({role:'admin'});
 await db.doc('companyOperations/meme').set({locked:false});await db.doc('sparkBooks/meme').set({lastPrice:1000000,version:863,orders:[]});
 for(const [uid,cash,quantity]of [['admin0001',3650000,50],['seller01',18350000,0]])await db.doc('sparkAccounts/'+uid).set({cash,positions:{meme:quantity},reservedPositions:{},reservedCash:0,version:20,lastMarket:'meme'});
 await db.doc('sparkBooks/meme/trades/previous').set({companyId:'meme',price:10000,quantity:6,marketVersion:3,createdAt:new Date('2026-10-21T02:00:00Z')});
 await db.doc('sparkAccounts/admin0001/orders/buy-order').set({companyId:'meme',side:'buy',price:1000000,quantity:53,filled:50,cancelled:3,remaining:0,status:'cancelled',sequence:848,marketVersion:861});
 for(let i=0;i<10;i++){const a=AUDITED_FILLS[i],record={companyId:'meme',price:a.price,quantity:a.quantity,marketVersion:a.version,createdAt:new Date('2026-10-21T10:03:53Z')};await db.doc('sparkBooks/meme/trades/fill'+i).set(record);for(const [uid,side]of [['admin0001','buy'],['seller01','sell']])await db.doc('sparkAccounts/'+uid+'/fills/fill'+i).set({...record,side});await db.doc('sparkAccounts/seller01/orders/sell'+i).set({companyId:'meme',side:'sell',price:a.price,quantity:a.quantity,filled:a.quantity,cancelled:0,remaining:0,status:'filled',sequence:810+i,marketVersion:a.version});}
 await db.doc('sparkAccounts/seller01').update({reservedCash:3000000});await assert.rejects(reverseAccidentalTrade(db),/spent or reserved/);assert.equal((await db.doc('sparkAccounts/admin0001').get()).data().cash,3650000);assert.equal((await db.collection('sparkBooks/meme/trades').get()).size,11);
 await db.doc('sparkAccounts/seller01').update({reservedCash:0});const r=await reverseAccidentalTrade(db);assert.equal(r.refund,16350000);assert.equal(r.fills,10);
 const buyer=(await db.doc('sparkAccounts/admin0001').get()).data(),seller=(await db.doc('sparkAccounts/seller01').get()).data();assert.equal(buyer.cash,20000000);assert.equal(buyer.positions.meme,10);assert.equal(seller.cash,2000000);assert.equal(seller.positions.meme,40);assert.equal(buyer.correctionRevision,1);
 assert.equal((await db.collection('sparkBooks/meme/trades').get()).size,1);assert.equal((await db.doc('sparkBooks/meme').get()).data().lastPrice,10000);assert.equal((await db.doc('sparkAccounts/admin0001/orders/buy-order').get()).data().status,'cancelled');assert.equal((await db.doc('sparkAccounts/admin0001/fills/fill0').get()).exists,false);
 const order=(await db.doc('sparkAccounts/admin0001/orders/buy-order').get()).data();assert.equal(order.filled,10);assert.equal(order.cancelled,43);
 assert.ok((await db.collection('tradeCorrections/admin-meme-20261021-190352/documents').get()).size>=20);assert.equal((await reverseAccidentalTrade(db)).status,'complete');assert.equal((await db.doc('sparkAccounts/admin0001').get()).data().cash,20000000);
 }finally{await db.terminate();await deleteApp(app);}
});

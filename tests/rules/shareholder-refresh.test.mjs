import {test} from 'node:test';import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';import {refreshShareholders} from '../../server/shareholder-refresh.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('sold additional shares belong to buyers; refresh is consistent, private, idempotent and never changes assets',async()=>{
 const projectId='demo-shareholder-refresh',app=initializeApp({projectId},projectId),db=getFirestore(app);
 try{await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});
 await db.doc('sparkBooks/c').set({version:2,issuedShares:1200,treasuryShares:150,issuerCash:10500000});
 await db.doc('companyShareholders/c').set({bookVersion:1,issuedShares:1200,holderShares:1000,treasuryShares:200,entries:[]});
 await db.doc('users/buyer').set({displayName:'구매자',email:'private@hcu.hs.kr'});await db.doc('sparkAccounts/buyer').set({cash:42,positions:{c:1050,other:7},reservedPositions:{c:10}});
 const before=(await db.doc('sparkAccounts/buyer').get()).data();const r=await refreshShareholders(db);assert.equal(r.updated,1);assert.equal(r.previouslyOverstatedShares,50);
 const snapshot=(await db.doc('companyShareholders/c').get()).data();assert.equal(snapshot.treasuryShares,150);assert.equal(snapshot.holderShares,1050);assert.equal(snapshot.entries[0].name,'구매자');assert.equal(snapshot.entries[0].quantity,1050);assert.equal(snapshot.bookVersion,2);assert.doesNotMatch(JSON.stringify(snapshot),/private@|cash|reservedPositions|other|"buyer"/);
 assert.deepEqual((await db.doc('sparkAccounts/buyer').get()).data(),before);assert.equal((await refreshShareholders(db)).updated,0);
 await db.doc('sparkBooks/c').update({version:3,treasuryShares:140});await db.doc('sparkAccounts/buyer').update({'positions.c':1060});assert.equal((await refreshShareholders(db)).updated,1);assert.equal((await db.doc('companyShareholders/c').get()).data().entries[0].quantity,1060);
 await db.doc('sparkBooks/c').update({version:4,treasuryShares:139});await assert.rejects(refreshShareholders(db),/conservation/);assert.equal((await db.doc('companyShareholders/c').get()).data().bookVersion,3);
 await db.doc('systemMaintenance/reset').set({active:true});assert.equal((await refreshShareholders(db)).maintenance,true);
 }finally{await db.terminate();await deleteApp(app);}
});

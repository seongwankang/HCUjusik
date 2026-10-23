import {test} from 'node:test';import assert from 'node:assert/strict';import {initializeApp,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';import {grantParticipantBonus,PARTICIPANT_BONUS_ID} from '../../server/participant-bonus.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
const portfolio=cash=>({cash,holdings:[],version:4,initialCapital:1000000});const account=cash=>({cash,reservedCash:cash>0?10000:0,positions:{company:4},reservedPositions:{company:1},version:7,lastMarket:'company'});
async function clear(projectId){await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});}
test('all student/president participants receive exactly 500k including inactive and negative balances; assets/reservations/signup defaults/company funds stay unchanged',async()=>{
 const projectId='demo-participant-bonus',app=initializeApp({projectId},projectId),db=getFirestore(app);try{await clear(projectId);
 const people=[['a','student',true,100000],['b','president',true,-900000],['c','student',false,0],['admin','admin',true,700000]];
 for(const [id,role,active,cash] of people){await db.doc('users/'+id).set({role,active,displayName:id});await db.doc('portfolios/'+id).set(portfolio(cash));await db.doc('sparkAccounts/'+id).set(account(cash));}
 await db.doc('companyOperations/company').set({cash:999999});await db.doc('sparkAccounts/a/orders/pending').set({status:'open',quantity:2});
 const r=await grantParticipantBonus(db);assert.equal(r.participants,3);assert.equal(r.credited,3);assert.equal(r.totalAmount,1500000);assert.equal(r.verified,3);
 for(const [id,role,,cash] of people){const a=(await db.doc('sparkAccounts/'+id).get()).data(),p=(await db.doc('portfolios/'+id).get()).data();assert.deepEqual(a,{...account(cash),cash:cash+(role==='admin'?0:500000),version:role==='admin'?7:8});assert.deepEqual(p,{...portfolio(cash),cash:cash+(role==='admin'?0:500000),version:role==='admin'?4:5});}
 assert.equal((await db.doc('companyOperations/company').get()).data().cash,999999);assert.equal((await db.doc('sparkAccounts/a/orders/pending').get()).data().status,'open');assert.equal((await grantParticipantBonus(db)).credited,0);
 await db.doc('users/late').set({role:'student',active:true});await db.doc('portfolios/late').set(portfolio(1000000));await db.doc('sparkAccounts/late').set(account(1000000));assert.equal((await grantParticipantBonus(db)).participants,3);assert.equal((await db.doc('sparkAccounts/late').get()).data().cash,1000000);
 }finally{await db.terminate();await deleteApp(app);}
});
test('interrupted and concurrent retries pay only the frozen unpaid roster, initialize untraded accounts and stop during reset',async()=>{
 const projectId='demo-participant-bonus-resume',app=initializeApp({projectId},projectId),db=getFirestore(app);try{await clear(projectId);
 for(const id of ['a','b']){await db.doc('users/'+id).set({role:'student',active:true});await db.doc('portfolios/'+id).set(portfolio(1000000));}await db.doc('sparkAccounts/a').set(account(1000000));await db.doc('sparkAccounts/b').set({...account(0),cash:'invalid'});
 await assert.rejects(grantParticipantBonus(db),/Invalid grant account/);assert.equal((await db.doc('sparkAccounts/a').get()).data().cash,1500000);assert.equal((await db.doc('participantGrants/'+PARTICIPANT_BONUS_ID+'/users/a').get()).exists,true);
 await db.doc('sparkAccounts/b').delete();const runs=await Promise.all([grantParticipantBonus(db),grantParticipantBonus(db)]);assert.equal(runs.reduce((n,r)=>n+r.credited,0),1);assert.equal((await db.doc('sparkAccounts/a').get()).data().cash,1500000);assert.deepEqual((await db.doc('sparkAccounts/b').get()).data(),{cash:1500000,reservedCash:0,positions:{},reservedPositions:{},version:0,lastMarket:''});assert.equal((await db.collection('participantGrants/'+PARTICIPANT_BONUS_ID+'/users').get()).size,2);
 await db.doc('systemMaintenance/reset').set({active:true});await assert.rejects(grantParticipantBonus(db),/Maintenance/);
 }finally{await db.terminate();await deleteApp(app);}
});

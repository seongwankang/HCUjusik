import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';import {doc,setDoc,updateDoc,getDoc} from 'firebase/firestore';
import {initializeSpark,placeSpark,matchSpark} from '../../client/spark-exchange.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('corrected accounts and books continue trading while clients cannot forge a correction revision',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-correction-rules',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 try{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'users/student'),{role:'student',active:true});await setDoc(doc(c.firestore(),'companies/one'),{name:'one',status:'listed',referencePrice:10000,issuedShares:100});});
 const db=env.authenticatedContext('student',{email:'test@hcu.hs.kr',email_verified:true}).firestore();await initializeSpark(db,'student','one');await env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'sparkAccounts/student'),{correctionRevision:1});await updateDoc(doc(c.firestore(),'sparkBooks/one'),{correctionRevision:1});});
 await assertFails(updateDoc(doc(db,'sparkAccounts/student'),{correctionRevision:2}));await assertFails(updateDoc(doc(db,'sparkBooks/one'),{correctionRevision:2}));
 await placeSpark(db,'student',{companyId:'one',orderId:'after-correction',side:'buy',price:10000,quantity:1});await matchSpark(db,'student','one');const a=(await getDoc(doc(db,'sparkAccounts/student'))).data();assert.equal(a.positions.one,1);assert.equal(a.cash,1990000);assert.equal(a.correctionRevision,1);
 }finally{await env.cleanup();}
});

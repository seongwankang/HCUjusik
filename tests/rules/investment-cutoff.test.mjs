import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
import {initialOperations,invest,beginDay,koreaDay} from '../../client/economy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('morning rule clock: repeated investments join same-day pending pool and settle together at 07:55',async()=>{
 const realNow=Date.now,day=koreaDay(realNow()),cutoff=day*86400000-3900000;
 // Emulator request.time cannot be overridden. Force only its cutoff branch;
 // the real calendar day, transaction timestamps and all economic checks remain.
 const source=readFileSync('firestore.rules','utf8'),rules=source.replace('request.time.toMillis() < dayNumber()*86400000-3900000','true');assert.notEqual(rules,source);
 const env=await initializeTestEnvironment({projectId:'demo-investment-cutoff',firestore:{rules}});
 try{
 await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'users/president'),{active:true,role:'president',displayName:'synthetic'});await setDoc(doc(db,'users/admin'),{active:true,role:'admin',displayName:'synthetic operator'});await setDoc(doc(db,'assignments/president'),{companyIds:['one']});await setDoc(doc(db,'companies/one'),{status:'listed'});await setDoc(doc(db,'companyOperations/one'),initialOperations());await setDoc(doc(db,'sparkBooks/one'),{issuerCash:10000000,issuedShares:1000,treasuryShares:1000});});
 const claims={email:'synthetic@hcu.hs.kr',email_verified:true},p=env.authenticatedContext('president',claims).firestore(),admin=env.authenticatedContext('admin',claims).firestore();
 Date.now=()=>cutoff-60000;
 for(const asset of ['factory','equipment','employee','research'])await invest(p,'one',asset);
 let o=(await getDoc(doc(p,'companyOperations/one'))).data();assert.equal(o.pendingDay,day);assert.equal(o.pendingRevenue,640000);assert.equal(o.pendingStaffRevenue,20000);assert.equal(o.pendingResearchBps,500);
 // A client cannot postpone or fabricate the authoritative activation date.
 const id='forged-cutoff-date',b=writeBatch(p);b.update(doc(p,'companyOperations/one'),{cash:o.cash-2000000,factory:o.factory+1,pendingRevenue:o.pendingRevenue+440000,pendingDay:day+1,pendingProduction:{...o.pendingProduction,factory:o.pendingProduction.factory+440000},lastInvestment:id});b.set(doc(p,'companyOperations/one/investments',id),{asset:'factory',cost:2000000,quantity:1,activeFromDay:day+1,createdAt:serverTimestamp()});await assertFails(b.commit());
 await assert.rejects(beginDay(admin,'one'),/오전 7시 55분/);
 Date.now=()=>cutoff;await beginDay(admin,'one');o=(await getDoc(doc(admin,'companyOperations/one'))).data();assert.equal(o.pendingRevenue,0);assert.equal(o.pendingStaffRevenue,0);assert.equal(o.pendingResearchBps,0);assert.equal(o.revenue,640000);assert.equal(o.staffRevenue,20000);assert.equal(o.activeResearchBps,500);assert.equal((await getDoc(doc(admin,'companyOperations/one/days','d'+day))).data().revenue,1386000);
 }finally{Date.now=realNow;await env.cleanup();}
});

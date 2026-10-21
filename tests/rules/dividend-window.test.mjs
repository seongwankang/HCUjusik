import {changeDividendRate} from '../../client/dividend-rate.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteField} from 'firebase/firestore';
import {initialOperations} from '../../client/economy.js';
import {koreaDay} from '../../client/settlement-time.js';
import {createClientApi} from '../../client/data.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
const source=readFileSync('firestore.rules','utf8'),claims={email:'test@hcu.hs.kr',email_verified:true};
async function fixture(time){
 const clock=Date.parse(time),minute=Math.floor((clock+32400000)/60000)%1440,day=koreaDay(Date.now()),now=day*86400000-32400000+minute*60000;
 // Only replace the server clock in a local emulator copy; deploy the unmodified source.
 const rules=source.replaceAll('let minute=(int(request.time.toMillis() / 60000)+540)%1440;','let minute='+minute+';');
 const env=await initializeTestEnvironment({projectId:'demo-dividend-window-'+time.replace(/\D/g,'').slice(-10),firestore:{rules}});
 await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const [uid,role] of [['boss','president'],['boss2','president'],['other','president'],['student','student'],['admin','admin']]){await setDoc(doc(d,'users',uid),{displayName:uid,role,active:true});await setDoc(doc(d,'assignments',uid),{companyIds:uid==='other'?['two']:['one']});}for(const cid of ['one','two']){await setDoc(doc(d,'companies',cid),{name:cid});await setDoc(doc(d,'companyOperations',cid),initialOperations());}});
 const db=uid=>env.authenticatedContext(uid,claims).firestore(),ref=uid=>doc(db(uid),'companyOperations/one');return {env,day,db,ref,now};
}
test('server enforces exact KST boundaries, even for administrator',async()=>{
 for(const [time,allowed] of [['07:59:59.999',false],['08:00:00.000',true],['16:59:59.999',true],['17:00:00.000',false]]){
  const f=await fixture('2026-10-21T'+time+'+09:00');try{for(const uid of ['boss','admin']){await f.env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'companyOperations/one'),initialOperations()));const change=changeDividendRate(f.db(uid),'one',1234,f.day*86400000-32400000+12*3600000);if(allowed)await change;else await assertFails(change);}}finally{await f.env.cleanup();}
 }
});
test('one change per company/day; no metadata forgery, role bypass, combined cash write or concurrent second save',async()=>{
 const f=await fixture('2026-10-21T09:00:00+09:00');try{
  for(const uid of ['other','student'])await assertFails(updateDoc(f.ref(uid),{dividendBps:1000,lastDividendDay:f.day}));
  for(const patch of [{dividendBps:1000},{dividendBps:1000,lastDividendDay:f.day-1},{dividendBps:1000,lastDividendDay:f.day+1},{dividendBps:1000,lastDividendDay:f.day,cash:99},{dividendBps:10001,lastDividendDay:f.day},{dividendBps:99,lastDividendDay:f.day}])await assertFails(updateDoc(f.ref('boss'),patch));
  const results=await Promise.allSettled([changeDividendRate(f.db('boss'),'one',1000,f.now),changeDividendRate(f.db('boss2'),'one',2000,f.now)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  for(const uid of ['boss','admin']){await assertFails(updateDoc(f.ref(uid),{dividendBps:3000,lastDividendDay:f.day}));await assertFails(updateDoc(f.ref(uid),{lastDividendDay:deleteField()}));await assertFails(updateDoc(f.ref(uid),{lastDividendDay:f.day-1}));}
  // Non-rate management operations preserve the marker.
  await updateDoc(f.ref('admin'),{cash:100});assert.equal((await getDoc(f.ref('boss'))).data().lastDividendDay,f.day);
  await f.env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/one'),{lastDividendDay:f.day-1}));await changeDividendRate(f.db('boss'),'one',3000,f.now);
  await f.env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'companyOperations/one'),{lastDividendDay:f.day-1,locked:true}));await assertFails(updateDoc(f.ref('boss'),{dividendBps:99,lastDividendDay:f.day}));
 }finally{await f.env.cleanup();}
});
test('client transaction rejects unchanged or out-of-range rates without consuming the allowance',async()=>{
 const f=await fixture('2026-10-21T12:00:00+09:00');
 try{
  const rate=n=>changeDividendRate(f.db('boss'),'one',n,f.now);
  await assert.rejects(rate(100),/10~30/);assert.equal((await getDoc(f.ref('boss'))).data().lastDividendDay,undefined);
  await assert.rejects(rate(999));await assert.rejects(rate(3001));await rate(1500);
  await assert.rejects(rate(2000),/이미 변경/);
 }finally{await f.env.cleanup();}
});

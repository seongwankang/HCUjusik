import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc} from 'firebase/firestore';
import {priceLimitDay,priceLimits} from '../../client/daily-price-limits.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('Rules enforce the band even for a deliberately bypassed client; bounds cannot be edited and stale/out-of-band fills fail',async()=>{
 const rules=readFileSync('firestore.rules','utf8').replace(/function marketOpen\(\) \{[\s\S]*?\n    \}/,'function marketOpen() { return true; }');
 const env=await initializeTestEnvironment({projectId:'demo-daily-limit-rules',firestore:{rules}});
 try{
  await env.clearFirestore();
  await build({stdin:{contents:"export {initializeSpark,placeSpark,matchSpark,cancelSpark} from './client/spark-exchange.js';",resolveDir:process.cwd()},outfile:'.generated-bypass-price-limits.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'bypassed-client',setup(b){
   b.onLoad({filter:/client[\\/]daily-price-limits\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/export function assertDailyPrice[\s\S]*$/,'export function assertDailyPrice(){}').replace(/export function currentPriceLimits[\s\S]*?export const withinPriceLimits/,'export function currentPriceLimits(book){return book?.priceLimits||null;}\nexport const withinPriceLimits').replace(/export const withinPriceLimits=[^\n]+/,'export const withinPriceLimits=()=>true;'),loader:'js'}));
   b.onLoad({filter:/client[\\/]market-session\.js$/},()=>({contents:"export const marketSession=()=>({open:true,label:'test'});export const assertMarketOpen=()=>{};export const koreaDayStart=()=>0;",loader:'js'}));
  }}]});
  const client=await import('../../.generated-bypass-price-limits.mjs?'+Date.now());
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users/student'),{role:'student',active:true});await setDoc(doc(db,'users/other'),{role:'student',active:true});await setDoc(doc(db,'users/admin'),{role:'admin',active:true});await setDoc(doc(db,'companies/a'),{status:'listed',referencePrice:10000,issuedShares:1});});
  const db=env.authenticatedContext('student',{email:'s@hcu.hs.kr',email_verified:true}).firestore();
  await client.initializeSpark(db,'student','a');
  const order=(id,price)=>({orderId:id,companyId:'a',side:'buy',quantity:1,price});
  for(const p of [4900,20100])await assertFails(client.placeSpark(db,'student',order('outside-'+p,p)));
  await client.placeSpark(db,'student',order('lower-inclusive',5000));await client.cancelSpark(db,'student',{companyId:'a',orderId:'lower-inclusive'});
  await client.placeSpark(db,'student',order('upper-inclusive',20000));await client.matchSpark(db,'student','a');
  assert.equal((await getDoc(doc(db,'sparkAccounts/student'))).data().positions.a,1);
  const other=env.authenticatedContext('other',{email:'o@hcu.hs.kr',email_verified:true}).firestore();await client.initializeSpark(other,'other','a');
  await client.placeSpark(db,'student',{...order('secondary-sell',15000),side:'sell'});
  await client.placeSpark(other,'other',order('secondary-buy',15000));await client.matchSpark(other,'other','a');
  assert.equal((await getDoc(doc(other,'sparkAccounts/other'))).data().positions.a,1);
  const admin=env.authenticatedContext('admin').firestore();for(const actor of [db,admin])await assertFails(updateDoc(doc(actor,'sparkBooks/a'),{priceLimits:priceLimits(20000,priceLimitDay())}));
  await client.placeSpark(db,'student',order('waiting-for-day',10000));
  await client.placeSpark(other,'other',{...order('waiting-seller',10000),side:'sell'});
  await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'sparkBooks/a'),{priceLimits:priceLimits(10000,priceLimitDay()-1)}));
  await assertFails(client.placeSpark(db,'student',order('stale-day-order',10000)));
  await assertFails(client.matchSpark(db,'student','a'));
  await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'sparkBooks/a'),{priceLimits:priceLimits(2500,priceLimitDay())}));
  await assertFails(client.matchSpark(db,'student','a'));
  await client.cancelSpark(db,'student',{companyId:'a',orderId:'waiting-for-day'});
  assert.equal((await getDoc(doc(db,'sparkAccounts/student'))).data().reservedCash,0);
 }finally{await env.cleanup();}
});

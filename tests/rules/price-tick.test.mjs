import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc} from 'firebase/firestore';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('server rejects old ten-won client orders but accepts hundred-won orders',async()=>{
 // Isolate price validation from the temporary production market pause.
 const source=readFileSync('firestore.rules','utf8'),rules=source.replace(/function marketOpen\(\) \{[\s\S]*?\n    \}/,'function marketOpen() { return true; }');assert.notEqual(source,rules);
 const env=await initializeTestEnvironment({projectId:'demo-hundred-tick',firestore:{rules}});
 try{
  await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users/student'),{role:'student',active:true,displayName:'test'});await setDoc(doc(db,'companies/tick'),{status:'listed',referencePrice:10000,issuedShares:100});});
  await build({stdin:{contents:"export {initializeSpark,placeSpark,cancelSpark} from './client/spark-exchange.js';",resolveDir:process.cwd()},outfile:'.generated-old-tick-client.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'legacy-client-fixture',setup(b){
   b.onLoad({filter:/client[\\/]price-tick\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace('PRICE_TICK=100','PRICE_TICK=10'),loader:'js'}));
   b.onLoad({filter:/client[\\/]market-session\.js$/},()=>({contents:"export const marketSession=()=>({open:true,label:'test'});export const assertMarketOpen=()=>{};export const koreaDayStart=()=>0;",loader:'js'}));
  }}]});
  const legacy=await import('../../.generated-old-tick-client.mjs?'+Date.now()),db=env.authenticatedContext('student',{email:'test@hcu.hs.kr',email_verified:true}).firestore();
  await legacy.initializeSpark(db,'student','tick');
  const order={companyId:'tick',side:'buy',quantity:1};
  for(const price of [10,10010,10050])await assertFails(legacy.placeSpark(db,'student',{...order,orderId:'invalid-tick-'+price,price}));
  await legacy.placeSpark(db,'student',{...order,orderId:'valid-hundred-tick',price:10000});
  assert.equal((await getDoc(doc(db,'sparkAccounts/student'))).data().reservedCash,10000);
  await legacy.cancelSpark(db,'student',{companyId:'tick',orderId:'valid-hundred-tick'});
  assert.equal((await getDoc(doc(db,'sparkAccounts/student'))).data().reservedCash,0);
 }finally{await env.cleanup();}
});

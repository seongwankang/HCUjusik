import {build} from 'esbuild';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initialOperations,availableFunds} from '../../client/economy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('startup grant is atomic, additive and exactly once, preserves IPO cash and all company/student assets; new companies get it too',async()=>{
 await writeFile('.generated-startup-capital-entry.mjs',"export {fundCompanyStartup} from './server/company-startup-capital.js';export {closeMarket} from './server/manual-market-close.js';export {settleDay} from './client/economy.js';");
 // Force only the settlement window in this integration fixture, preserving gRPC's real clock.
 await build({entryPoints:['.generated-startup-capital-entry.mjs'],outfile:'.generated-startup-capital-job.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'admin-fixture',setup(b){b.onResolve({filter:/^firebase[/]firestore$/},()=>({path:resolve('server/firestore-admin-adapter.js')}));b.onLoad({filter:/client[\\/]economy[.]js$/},args=>({contents:readFileSync(args.path,'utf8').replace('if(Date.now()<settlementTime(koreaDay()))','if(false)'),loader:'js'}));}}]});
 const {fundCompanyStartup,closeMarket,settleDay}=await import('../../.generated-startup-capital-job.mjs?'+Date.now());
 const app=initializeApp({projectId:'demo-company-startup'},'company-startup'),db=getFirestore(app);
 try{
  await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/demo-company-startup/databases/(default)/documents',{method:'DELETE'});
  await db.doc('companies/a').set({status:'listed',name:'A',president:'keep'});
  const o={...initialOperations(),cash:-500000,receivedIssuerCash:2000000,factory:1,revenue:440000};
  const book={issuerCash:10000000,issuedShares:1000,treasuryShares:0,orders:[{id:'keep'}],priceLimits:{day:1,referencePrice:10000,lower:5000,upper:20000},nextPriceLimits:{day:2}};
  await db.doc('companyOperations/a').set(o);await db.doc('sparkBooks/a').set(book);await db.doc('sparkAccounts/student').set({cash:123,positions:{a:1000}});
  const result=await Promise.all([fundCompanyStartup(db),fundCompanyStartup(db)]);
  assert.equal(result.reduce((n,r)=>n+r.credited,0),1);
  const after=(await db.doc('companyOperations/a').get()).data();assert.deepEqual(after,{...o,cash:9500000});
  assert.equal(availableFunds(after,book),17500000);assert.deepEqual((await db.doc('sparkBooks/a').get()).data(),book);
  assert.deepEqual((await db.doc('sparkAccounts/student').get()).data(),{cash:123,positions:{a:1000}});
  await db.doc('companies/b').set({status:'listed'});assert.equal((await fundCompanyStartup(db)).credited,1);assert.equal((await db.doc('companyOperations/b').get()).data().cash,10000000);
  assert.equal((await fundCompanyStartup(db)).credited,0);
  await settleDay(db,'a');
  assert.equal((await db.doc('companyOperations/a').get()).data().cash,18094000);
  assert.equal((await db.doc('sparkAccounts/student').get()).data().cash,6123);
  await closeMarket(db);const closed=(await db.doc('sparkBooks/a').get()).data();assert.equal(closed.priceLimits.day,-1);assert.equal(closed.nextPriceLimits,undefined);assert.deepEqual(closed.orders,book.orders);assert.equal(closed.issuerCash,book.issuerCash);
  assert.equal((await closeMarket(db)).closed,0);assert.equal((await db.doc('companyOperations/a').get()).data().cash,18094000);
  await db.doc('systemMaintenance/reset').set({test:true});assert.equal((await fundCompanyStartup(db)).maintenance,true);
 }finally{await db.terminate();await deleteApp(app);}
});

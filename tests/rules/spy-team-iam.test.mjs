import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {buildJob} from '../../scripts/build-jobs.mjs';
import {initialOperations,koreaDay} from '../../client/economy.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('IAM adapter caps legacy roster to two 2.5 percent agents atomically and keeps them active beyond three rounds',async()=>{
 const projectId='demo-spy-team-iam',app=initializeApp({projectId},'spy-team-iam'),db=getFirestore(app);
 try{
 await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/emulator/v1/projects/'+projectId+'/databases/(default)/documents',{method:'DELETE'});
 await writeFile('.generated-spy-team-iam-entry.mjs',"export {settleSpies} from './client/spies.js';");await buildJob('.generated-spy-team-iam-entry.mjs','.generated-spy-team-iam.mjs');const {settleSpies}=await import('../../.generated-spy-team-iam.mjs?'+Date.now());
 const day=koreaDay();for(const id of ['a','b']){await db.doc('companies/'+id).set({status:'listed'});await db.doc('companyOperations/'+id).set({...initialOperations(),cash:id==='a'?-1000000:1000000});await db.doc('sparkBooks/'+id).set({issuerCash:0});}
 const agents=Object.fromEntries([0,1].map(i=>[String(i),{companyId:'a',targetId:'b',hireId:'agent-'+i,bps:50,remaining:1,settlements:0,activeFromDay:day,lastRoundDay:0}]));await db.doc('companySpies/a').set({...agents['1'],slot:'1',agents});await db.doc('spyRegistry/main').set({version:1});
 for(let i=0;i<5;i++){const d=day+i;for(const id of ['a','b']){await db.doc('companyOperations/'+id).update({lastSettledDay:d});await db.doc('companyOperations/'+id+'/days/d'+d).set({day:d,revenue:1000000});}assert.equal((await settleSpies(db,d*86400000+1)).status,'settled');assert.equal((await settleSpies(db,d*86400000+1)).status,'complete');}
 assert.equal((await db.doc('companyOperations/a').get()).data().cash,-750000);assert.equal((await db.doc('companyOperations/b').get()).data().cash,750000);assert.equal((await db.doc('companySpies/a').get()).data().agents['0'].remaining,1);
 }finally{await db.terminate();await deleteApp(app);}
});

import {FieldValue} from 'firebase-admin/firestore';
import {RESET_COLLECTIONS} from './market-reset.js';
import {emptyIndexes} from '../client/order-index.js';
import {newOperations} from '../client/economy.js';

export const PRESERVED_RESET_ID='preserve-presidents-2026-10-22';
const preserved=new Set(['companies','assignments','companyLeadership']);
export const CLEARED_COLLECTIONS=[...RESET_COLLECTIONS.filter(name=>!preserved.has(name)),'exchangeState'];
const backupNames=[...new Set([...RESET_COLLECTIONS,'exchangeState','users'])];
const backupKey=path=>Buffer.from(path).toString('base64url');

// Run with Admin SDK credentials. Never put backup data in files or Actions logs.
// The maintenance lock stays in place on failure: rerunning this same ID resumes.
export async function resetPreservingPresidents(db,{publish,now=Date.now(),skipBackup=false}={}){
 if(typeof publish!=='function')throw Error('A ranking publisher is required');
 const receipt=db.doc('resetBackups/'+PRESERVED_RESET_ID),lock=db.doc('systemMaintenance/reset');
 const acquire=await db.runTransaction(async t=>{
  const [r,l]=await Promise.all([t.get(receipt),t.get(lock)]);
  if(l.exists&&l.data().resetId!==PRESERVED_RESET_ID)throw Error('Another maintenance task owns the lock');
  if(r.data()?.status==='complete'){if(l.exists)t.delete(lock);return false;}
  t.set(lock,{resetId:PRESERVED_RESET_ID});return true;
 });
 if(!acquire)return {status:'complete'};
 if(!(await receipt.get()).data()?.backupComplete){
  if(skipBackup){
   // The owner explicitly waived a backup. Only monotonic cache counters remain.
   const snapshots=await Promise.all(['sparkBooks','sparkAccounts'].map(name=>db.collection(name).get()));
   const versions=Object.fromEntries(snapshots.flatMap(s=>s.docs.map(d=>[d.ref.path,{version:d.data().version||0,correctionRevision:d.data().correctionRevision||0}])));
   await receipt.set({status:'reset-ready',backupComplete:true,backupSkipped:true,versions,createdAt:FieldValue.serverTimestamp()},{merge:true});
  }else{
  let count=0,cursor=0;
  const queue=[];
  for(const name of backupNames)queue.push(...await db.collection(name).listDocuments());
  // A shared queue bounds both document and nested-history requests to 8 workers.
  // All workers must finish successfully before the deletion phase can start.
  async function backup(){
   while(cursor<queue.length){
    const ref=queue[cursor++];
    const snapshot=await ref.get();
    if(snapshot.exists){await receipt.collection('documents').doc(backupKey(ref.path)).set({path:ref.path,data:snapshot.data()});count++;}
    for(const child of await ref.listCollections())queue.push(...await child.listDocuments());
   }
  }
  const workers=await Promise.allSettled(Array.from({length:8},()=>backup()));
  const failed=workers.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  await receipt.set({status:'backed-up',backupComplete:true,documents:count,createdAt:FieldValue.serverTimestamp()});
  }
 }
 const checkpoint=(await receipt.get()).data();
 const original=async path=>checkpoint.versions?.[path]||(await receipt.collection('documents').doc(backupKey(path)).get()).data()?.data;
 // Company profiles, roles and president assignments are never removed.
 for(const name of CLEARED_COLLECTIONS)await db.recursiveDelete(db.collection(name));
 const companies=await db.collection('companies').get(),users=await db.collection('users').get();
 for(const company of companies.docs){
  const prior=await original('sparkBooks/'+company.id),batch=db.batch();
  batch.update(company.ref,{referencePrice:10000,issuedShares:1000,companyCash:0,dailyRevenue:0});
  batch.set(db.doc('sparkBooks/'+company.id),{...emptyIndexes(),initialPrice:10000,issuedShares:1000,treasuryShares:1000,issuerCash:0,lastPrice:0,orders:[],version:(prior?.version||0)+1,correctionRevision:(prior?.correctionRevision||0)+1,lastAction:{kind:'init',actor:'reset'},updatedAt:FieldValue.serverTimestamp()});
  batch.set(db.doc('companyOperations/'+company.id),{...newOperations(now),production:{factory:0,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0},employees:0,staffRevenue:0,pendingStaffRevenue:0,activeResearchBps:0,pendingResearchBps:0,settlementCount:0});
  await batch.commit();
 }
 for(const user of users.docs){
  const prior=await original('sparkAccounts/'+user.id),batch=db.batch();
  batch.set(db.doc('portfolios/'+user.id),{cash:1000000,holdings:[],version:0,initialCapital:1000000});
  batch.set(db.doc('sparkAccounts/'+user.id),{cash:1000000,reservedCash:0,positions:{},reservedPositions:{},version:(prior?.version||0)+1,correctionRevision:(prior?.correctionRevision||0)+1,lastMarket:''});
  await batch.commit();
 }
 await publish(db);
 // Verify actual persisted balances before reopening the market.
 const accounts=await db.collection('sparkAccounts').get();
 if(accounts.size!==users.size||accounts.docs.some(s=>{const a=s.data();return a.cash!==1000000||a.reservedCash!==0||Object.keys(a.positions).length||Object.keys(a.reservedPositions).length;}))throw Error('Reset verification failed; maintenance remains enabled');
 await receipt.update({status:'complete',users:users.size,companies:companies.size,completedAt:FieldValue.serverTimestamp()});
 await db.runTransaction(async t=>{const s=await t.get(lock);if(s.data()?.resetId===PRESERVED_RESET_ID)t.delete(lock);});
 return {status:'reset',users:users.size,companies:companies.size};
}

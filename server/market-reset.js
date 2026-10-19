import {FieldValue} from 'firebase-admin/firestore';
export const RESET_ID='fresh-start-2026-10-21';
export const RESET_COLLECTIONS=['companies','companyOperations','companySpies','companyChoices','companyEffects','companyLeadership','events','eventQueue','eventAutomation','eventNewsDrafts','eventOutcomes','news','sparkBooks','sparkAccounts','tradeTests','portfolios','assignments','investorSnapshots','leaderboards','spyRegistry','spyRounds','spyAutomation'];
// Backups remain private under the default-deny rules. No student data enters logs.
export async function resetMarket(db){
 const receipt=db.doc('resetBackups/'+RESET_ID),lock=db.doc('systemMaintenance/reset');
 if((await receipt.get()).data()?.status==='complete'){
  if((await lock.get()).data()?.resetId===RESET_ID)await lock.delete();
  return {status:'complete'};
 }
 await lock.set({resetId:RESET_ID});
 const prior=(await receipt.get()).data();
 if(!prior?.backupComplete){
  let count=0;
  async function backup(collection){for(const ref of await collection.listDocuments()){
   const snap=await ref.get();if(snap.exists){await receipt.collection('documents').doc(Buffer.from(ref.path).toString('base64url')).set({path:ref.path,data:snap.data()});count++;}
   for(const child of await ref.listCollections())await backup(child);
  }}
  for(const name of RESET_COLLECTIONS)await backup(db.collection(name));
  await receipt.set({status:'backed-up',backupComplete:true,documents:count,createdAt:FieldValue.serverTimestamp()});
 }
 // This phase is retryable: all accounts are restored to the same starting state.
 for(const name of RESET_COLLECTIONS)await db.recursiveDelete(db.collection(name));
 const users=await db.collection('users').get();
 for(const user of users.docs){const id=user.id,b=db.batch();
  b.set(db.doc('portfolios/'+id),{cash:1000000,holdings:[],version:0});
  b.set(db.doc('sparkAccounts/'+id),{cash:1000000,reservedCash:0,positions:{},reservedPositions:{},version:0,lastMarket:''});
  b.set(db.doc('assignments/'+id),{companyIds:[]});await b.commit();
 }
 await receipt.update({status:'complete',users:users.size,completedAt:FieldValue.serverTimestamp()});
 await lock.delete();return {status:'reset',users:users.size};
}

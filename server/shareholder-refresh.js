import {FieldPath,FieldValue} from 'firebase-admin/firestore';
import {shareholderSnapshots} from '../client/shareholders.js';
const investorKey=async id=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('hcujusik-investor:'+id));return Buffer.from(bytes).toString('hex');};
// Read only companies whose book changed. Holdings and book are read in one
// transaction so a concurrent fill cannot publish mixed ownership totals.
export async function refreshShareholders(db,{force=false}={}){
 if((await db.doc('systemMaintenance/reset').get()).exists)return {updated:0,unchanged:0,maintenance:true};
 const [books,snapshots]=await Promise.all([db.collection('sparkBooks').select('version','issuedShares','treasuryShares').get(),db.collection('companyShareholders').get()]);
 const previous=new Map(snapshots.docs.map(s=>[s.id,s.data()])),result={updated:0,unchanged:0,previouslyOverstatedShares:0};
 for(const row of books.docs){const old=previous.get(row.id),b=row.data();
  if(!force&&old?.bookVersion===b.version&&old.issuedShares===b.issuedShares&&old.treasuryShares===b.treasuryShares){result.unchanged++;continue;}
  const change=await db.runTransaction(async t=>{
   const bookRef=db.doc('sparkBooks/'+row.id),ref=db.doc('companyShareholders/'+row.id);
   const [bookDoc,prior,maintenance]=await Promise.all([t.get(bookRef),t.get(ref),t.get(db.doc('systemMaintenance/reset'))]);
   if(maintenance.exists||!bookDoc.exists)return null;
   const book=bookDoc.data(),priorData=prior.data();
   if(!force&&priorData?.bookVersion===book.version&&priorData.issuedShares===book.issuedShares&&priorData.treasuryShares===book.treasuryShares)return null;
   const holders=await t.get(db.collection('sparkAccounts').where(new FieldPath('positions',row.id),'>',0).select(new FieldPath('positions',row.id)));
   const names=new Map((priorData?.entries||[]).map(e=>[e.investorKey,e.name])),users=[];
   for(const a of holders.docs){let name=names.get(await investorKey(a.id));if(!name)name=(await t.get(db.doc('users/'+a.id))).data()?.displayName||'참가자';users.push({id:a.id,displayName:name});}
   const [snapshot]=await shareholderSnapshots(users,holders.docs.map(a=>({id:a.id,...a.data()})),[{id:row.id}],[{id:row.id,...book}]);
   if(snapshot.holderShares+snapshot.treasuryShares!==snapshot.issuedShares)throw Error('Shareholder ledger conservation failed');
   t.set(ref,{...snapshot,updatedAt:FieldValue.serverTimestamp()});
   return {overstated:Math.max(0,(priorData?.treasuryShares||0)-snapshot.treasuryShares)};
  });
  if(change){result.updated++;result.previouslyOverstatedShares+=change.overstated;}else result.unchanged++;
 }
 return result;
}

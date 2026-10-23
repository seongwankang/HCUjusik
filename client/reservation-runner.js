import {doc,getDoc,getDocs,collection,query,where,orderBy,limit,startAfter,Timestamp,runTransaction} from 'firebase/firestore';
import {publishEvent,applyRandomEvent} from './events.js';
// Used by the trusted job and an authenticated administrator. The reservation
// stays private until due; deterministic IDs/receipts make concurrent retries safe.
export async function runDueRandomReservations(db,now=Date.now()){
 let processed=0,failed=0,cursor=null;const blocked=new Set(),errors=[];
 for(;;){const page=await getDocs(query(collection(db,'eventReservations'),where('scheduledAt','<=',Timestamp.fromMillis(now)),orderBy('scheduledAt'),limit(100),...(cursor?[startAfter(cursor)]:[])));
  for(const row of page.docs){let payload;try{
   const claimed=await runTransaction(db,async t=>{const s=await t.get(row.ref);if(!s.exists()||s.data().scheduledAt.toMillis()>now)return null;const d=s.data();if(!['pending','processing'].includes(d.status))throw Error('Invalid reservation state');t.update(row.ref,{status:'processing'});return d.payload;});if(!claimed)continue;payload=claimed;
   const ref=doc(db,'events',row.id);if(!(await getDoc(ref)).exists()){try{await publishEvent(db,{...payload,id:row.id,deadline:new Date(Date.now()+86400000).toISOString()},{reservedExecution:true});}catch(error){if(!(await getDoc(ref)).exists())throw error;}}
   const result=await applyRandomEvent(db,row.id);if(result.failed.length||result.newsPending){failed++;for(const f of result.failed)blocked.add(f.companyId);errors.push({id:row.id,message:result.newsError||result.failed[0]?.message||'Effect application pending'});continue;}
   await runTransaction(db,async t=>{if(!(await t.get(row.ref)).exists())return;t.delete(row.ref);t.delete(doc(db,'eventQueue',row.id));});processed++;
  }catch(error){failed++;errors.push({id:row.id,message:error.message});for(const id of payload?.effects?.flatMap(e=>e.companyIds)||payload?.companyIds||[])blocked.add(id);}}
  if(page.size<100)break;cursor=page.docs.at(-1);
 }
 return {processed,failed,blocked,errors};
}

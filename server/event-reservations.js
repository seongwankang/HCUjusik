import {publishEvent,applyRandomEvent} from '../client/events.js';
// Private reservations become public events only after their due time.
export async function runScheduledRandomEvents(db,now=Date.now()){
 let processed=0,failed=0;const blocked=new Set();let cursor=null;
 for(;;){let q=db.collection('eventReservations').where('scheduledAt','<=',new Date(now)).orderBy('scheduledAt').limit(100);if(cursor)q=q.startAfter(cursor);const page=await q.get();
 for(const row of page.docs){let payload;try{
  const claimed=await db.runTransaction(async t=>{const s=await t.get(row.ref);if(!s.exists||s.data().scheduledAt.toMillis()>now)return null;const d=s.data();if(!['pending','processing'].includes(d.status))throw Error('Invalid reservation state');t.update(row.ref,{status:'processing'});return d.payload;});if(!claimed)continue;payload=claimed;
  const ref=db.doc('events/'+row.id);if(!(await ref.get()).exists){try{await publishEvent(db,{...payload,id:row.id,deadline:new Date(Date.now()+86400000).toISOString()},{reservedExecution:true});}catch(error){if(!(await ref.get()).exists)throw error;}}
  const result=await applyRandomEvent(db,row.id);if(result.failed.length||result.newsPending){failed++;for(const f of result.failed)blocked.add(f.companyId);continue;}
  const done=db.batch();done.delete(row.ref);done.delete(db.doc('eventQueue/'+row.id));await done.commit();processed++;
 }catch{failed++;for(const id of payload?.effects?.flatMap(e=>e.companyIds)||payload?.companyIds||[])blocked.add(id);}}
 if(page.size<100)break;cursor=page.docs.at(-1);}
 return {processed,failed,blocked};
}

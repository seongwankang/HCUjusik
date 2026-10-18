import {allRows} from '../client/rankings.js';
import {closeChoiceEvent,applyRandomEvent} from '../client/events.js';
// Queue lookup uses only endsAt (automatic single-field index).
export async function runDueChoiceEvents(db,now=Date.now()){
 const migration=db.doc('eventAutomation/choice-deadlines-v2');if(!(await migration.get()).exists){
  for(const e of await allRows(db,'events'))if(e.type==='choice')await db.doc('eventQueue/'+e.id).set({endsAt:e.endsAt});
  // Clear legacy browser-only pending flags; choices remain immutable and queued.
  for(const o of await allRows(db,'companyOperations'))if(o.pendingEvent)await db.runTransaction(async t=>{const ref=db.doc('companyOperations/'+o.id),s=await t.get(ref),event=await t.get(db.doc('events/'+o.pendingEvent));if(event.data()?.type==='choice'&&s.data()?.pendingEvent===o.pendingEvent&&!s.data().locked)t.update(ref,{pendingEvent:''});});
  await migration.set({complete:true});
 }
 let processed=0,failed=0;const blocked=new Set();
 // Each completed queue document is removed only after every chosen company succeeds.
 let cursor=null;for(;;){let q=db.collection('eventQueue').where('endsAt','<=',new Date(now)).orderBy('endsAt').limit(100);if(cursor)q=q.startAfter(cursor);const page=await q.get();for(const entry of page.docs){try{const event=(await db.doc('events/'+entry.id).get()).data();const r=event?.type==='random'?await applyRandomEvent(db,entry.id):await closeChoiceEvent(db,entry.id);if(r.failed.length||r.newsPending){failed++;r.failed.forEach(f=>blocked.add(typeof f==='string'?f:f.companyId));}else{await entry.ref.delete();processed++;}}catch{failed++;}}if(page.size<100)break;cursor=page.docs.at(-1);}
 return {processed,failed,blocked};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
// Import normally: SDK calls are injected, so no real account or database is used.
const {publishRecoveryEvent,RECOVERY_EVENT_ID}=await import('../server/recovery-event.js');
function fixture(n=8,prior=false){
 let event=prior?{targets:['old-a','old-b']}:null,body;
 const companies=Array.from({length:n},(_,i)=>({id:'c'+i,data:()=>({name:'예시 기업 '+i,status:'listed'})}));
 const db={collection:()=>({get:async()=>({docs:companies})}),doc:path=>({get:async()=>path.startsWith('events/')?{exists:!!event,data:()=>event}:{data:()=>({eventSummary:{groups:[{companies:event.targets.map(companyId=>({companyId,status:'applied'}))}]}})}})};
 return {db,options:{random:(min,max)=>max-1,publish:async(db,b)=>{body=b;event={targets:b.companyIds};},apply:async()=>({applied:event.targets.length,failed:[]})},body:()=>body};
}
test('publishes three distinct random companies, one settlement +10%, and authored news without affecting all',async()=>{
 const f=fixture();const r=await publishRecoveryEvent(f.db,f.options),b=f.body();assert.equal(r.targets,3);assert.equal(new Set(b.companyIds).size,3);assert.equal(b.companyIds.includes('c7'),true);
 assert.deepEqual(b.effect,{kind:'revenue',percent:10,settlements:1});assert.match(b.news.content,/나머지 기업에는/);assert.equal(b.id,RECOVERY_EVENT_ID);
});
test('retries retain existing targets and never republish or select new companies',async()=>{
 const f=fixture(8,true);f.options.publish=()=>assert.fail('duplicate publication');f.options.random=()=>assert.fail('reroll');assert.equal((await publishRecoveryEvent(f.db,f.options)).targets,2);
});
test('never silently targets every company even with a small list',async()=>{
 const f=fixture(2);assert.equal((await publishRecoveryEvent(f.db,f.options)).targets,1);
 const one=fixture(1);await assert.rejects(publishRecoveryEvent(one.db,one.options),/never apply globally/);
});

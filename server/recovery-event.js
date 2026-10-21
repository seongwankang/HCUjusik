import {randomInt} from 'node:crypto';
import {publishEvent,applyRandomEvent} from '../client/events.js';
import {eventNewsId} from '../client/event-news.js';
export const RECOVERY_EVENT_ID='recovery-random-2026-10-21';
export async function publishRecoveryEvent(db,{publish=publishEvent,apply=applyRandomEvent,random=randomInt,now=Date.now()}={}){
 const existing=await db.doc('events/'+RECOVERY_EVENT_ID).get();
 if(!existing.exists){
  const companies=(await db.collection('companies').get()).docs.filter(s=>s.data().status==='listed');
  if(companies.length<2)throw Error('At least two listed companies are required; never apply globally');
  const count=Math.min(3,companies.length-1);
  for(let i=0;i<count;i++){const j=random(i,companies.length);[companies[i],companies[j]]=[companies[j],companies[i]];}
  const selected=companies.slice(0,count),names=selected.map(s=>s.data().name).join(', ');
  await publish(db,{id:RECOVERY_EVENT_ID,type:'random',companyIds:selected.map(s=>s.id),
   title:'소비 심리 회복',content:'소비 심리가 회복되며 일부 기업에 신규 주문이 몰렸습니다. 대상 기업의 일매출이 다음 정산 1회 동안 10% 증가합니다.',
   effect:{kind:'revenue',percent:10,settlements:1},deadline:new Date(now+86400000).toISOString(),
   news:{title:'[속보] 소비 심리 회복… 일부 기업 신규 주문 증가',content:`소비 심리가 살아나면서 ${names}에 신규 주문이 증가했습니다.\n\n해당 기업들은 다음 정산 1회 동안 일매출이 10% 증가합니다. 나머지 기업에는 이번 이벤트의 효과가 적용되지 않습니다.`}});
 }
 const result=await apply(db,RECOVERY_EVENT_ID);
 if(result.failed.length||result.newsPending)throw Error('Event application or news publishing incomplete; retry the same event');
 const event=(await db.doc('events/'+RECOVERY_EVENT_ID).get()).data();
 const news=(await db.doc('news/'+await eventNewsId(RECOVERY_EVENT_ID)).get()).data();
 if(!news||event.targets.some(id=>!news.eventSummary?.groups?.[0]?.companies?.some(c=>c.companyId===id&&c.status==='applied')))throw Error('Published news does not confirm all targets');
 return {eventId:RECOVERY_EVENT_ID,targets:event.targets.length,applied:result.applied,newsPublished:true};
}

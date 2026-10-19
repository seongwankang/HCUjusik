import {FieldValue} from 'firebase-admin/firestore';
import {spyAgents,oldestActiveSpy} from '../client/spy-model.js';
// Retain every historical agent and hiring receipt. Surplus agents become inactive;
// the user explicitly chose no refund. One transaction also advances the roster fence.
export async function migrateSingleSpies(db){
 const marker=db.doc('spyAutomation/single-agent-v1');
 return db.runTransaction(async t=>{
  if((await t.get(marker)).exists)return {status:'complete'};
  const [roster,registry]=await Promise.all([t.get(db.collection('companySpies')),t.get(db.doc('spyRegistry/main'))]);
  if(roster.size>200)throw Error('스파이 정책 전환 대상이 200개 기업을 초과했습니다.');
  let companies=0,retired=0,last;
  for(const row of roster.docs){const data=row.data(),selected=oldestActiveSpy(data);if(!selected)continue;
   const [slot,agent]=selected,agents=spyAgents(data),removed=[];
   for(const [other,a] of Object.entries(agents))if(other!==slot&&a.remaining>0){removed.push(a.hireId);agents[other]={...a,remaining:0};}
   if(!removed.length&&agent.bps===500&&data.hireId===agent.hireId)continue;
   agents[slot]={...agent,bps:500};t.update(row.ref,{...agents[slot],slot,agents});
   t.create(row.ref.collection('policyChanges').doc('single-agent-v1'),{keptHireId:agent.hireId,retiredHireIds:removed,refund:0,createdAt:FieldValue.serverTimestamp()});
   retired+=removed.length;companies++;last={companyId:row.id,hireId:agent.hireId};
  }
  if(last)t.set(db.doc('spyRegistry/main'),{version:(registry.data()?.version||0)+1,...last});
  t.set(db.doc('spyPolicy/main'),{cost:1000000,bps:500,settlements:0});
  t.create(marker,{companies,retired,refund:0,createdAt:FieldValue.serverTimestamp()});return {status:'migrated',companies,retired};
 });
}

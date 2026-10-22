import {FieldValue} from 'firebase-admin/firestore';
import {spyAgents,activeSpyEntries,MAX_SPIES,DEFAULT_SPY_POLICY} from '../client/spy-model.js';
// Never reactivate retired agents or change historical hiring receipts.
export async function migrateSpyPolicy(db){
 const marker=db.doc('spyAutomation/two-agent-rate400-v3');
 return db.runTransaction(async t=>{
  if((await t.get(marker)).exists)return {status:'complete',bps:DEFAULT_SPY_POLICY.bps};
  const [roster,registry]=await Promise.all([t.get(db.collection('companySpies')),t.get(db.doc('spyRegistry/main'))]);
  if(roster.size>200)throw Error('스파이 정책 전환 대상이 200개 기업을 초과했습니다.');
  let companies=0,retired=0,last;
  for(const row of roster.docs){const data=row.data(),active=activeSpyEntries(data),kept=active.slice(0,MAX_SPIES);if(!kept.length)continue;
   const agents=spyAgents(data),removed=active.slice(MAX_SPIES).map(([,a])=>a.hireId);
   for(const [slot,a] of active)agents[slot]=kept.some(([k])=>k===slot)?{...a,bps:DEFAULT_SPY_POLICY.bps}:{...a,remaining:0};
   const [slot,agent]=kept[0];
   t.update(row.ref,{...agents[slot],slot,agents});
   t.create(row.ref.collection('policyChanges').doc('two-agent-rate400-v3'),{keptHireIds:kept.map(([,a])=>a.hireId),retiredHireIds:removed,refund:0,createdAt:FieldValue.serverTimestamp()});
   retired+=removed.length;companies++;last={companyId:row.id,hireId:agent.hireId};
  }
  if(last)t.set(db.doc('spyRegistry/main'),{version:(registry.data()?.version||0)+1,...last});
  t.set(db.doc('spyPolicy/main'),DEFAULT_SPY_POLICY);
  t.create(marker,{companies,retired,bps:DEFAULT_SPY_POLICY.bps,refund:0,createdAt:FieldValue.serverTimestamp()});return {status:'migrated',companies,retired,bps:DEFAULT_SPY_POLICY.bps};
 });
}

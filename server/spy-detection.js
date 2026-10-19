import {randomInt} from 'node:crypto';
import {migrateSpyPolicy} from './spy-policy-migration.js';
import {FieldValue} from 'firebase-admin/firestore';
import {koreaDay} from '../client/economy.js';
import {settlementTime} from '../client/settlement-time.js';
import {adjustedRevenue} from '../client/event-model.js';
import {spyAgents} from '../client/spy-model.js';
import {detectionCandidates,detectionCompensation,detectionArticle} from './spy-detection-model.js';
const funds=(o,b)=>o.cash+b.issuerCash-o.receivedIssuerCash;
const checkCash=value=>{if(!Number.isSafeInteger(value)||Math.abs(value)>1e12)throw Error('발각 보상금 지급 후 회사 자금 한도를 초과합니다.');return value;};
// IAM job only. No browser endpoint or client-selected random draw is exposed.
export async function detectDailySpy(db,{now=Date.now(),pick=randomInt,blocked=new Set()}={}){
 const day=koreaDay(now);if(now<settlementTime(day))return {status:'not-due'};
 await migrateSpyPolicy(db);
 const ref=db.doc('spyRounds/preflight-d'+day);
 return db.runTransaction(async t=>{
  const previous=await t.get(ref);if(previous.exists)return {...previous.data(),repeated:true};
  if(blocked.size)return {status:'waiting',reason:'pending-choice-events'};
  const [roster,operations,registry]=await Promise.all([t.get(db.collection('companySpies')),t.get(db.collection('companyOperations')),t.get(db.doc('spyRegistry/main'))]);
  const ops=Object.fromEntries(operations.docs.map(d=>[d.id,d.data()]));
  // Deployment/manual recovery must never add a penalty after today's payouts began.
  if(operations.docs.some(d=>d.data().lastSettledDay>=day||d.data().locked&&d.data().currentDay==='d'+day)){
   const result={day,status:'skipped',reason:'settlement-already-started'};t.create(ref,{...result,createdAt:FieldValue.serverTimestamp()});return result;
  }
  if(operations.docs.some(d=>d.data().locked))return {status:'waiting',reason:'previous-payout'};
  const candidates=detectionCandidates(roster.docs.map(d=>({id:d.id,...d.data()})),day);
  if(!candidates.length){const result={day,status:'empty'};t.create(ref,{...result,createdAt:FieldValue.serverTimestamp()});return result;}
  const index=pick(candidates.length);if(!Number.isInteger(index)||index<0||index>=candidates.length)throw Error('산업스파이 추첨 결과를 확인하세요.');
  const chosen=candidates[index],{companyId,targetId,hireId,slot}=chosen;
  const [owner, target, ownerBook,targetBook,effects]=await Promise.all([t.get(db.doc('companies/'+companyId)),t.get(db.doc('companies/'+targetId)),t.get(db.doc('sparkBooks/'+companyId)),t.get(db.doc('sparkBooks/'+targetId)),t.get(db.collection('companyEffects/'+targetId+'/items'))]);
  if(!ops[companyId]||!ops[targetId]||!owner.exists||!target.exists||!ownerBook.exists||!targetBook.exists)throw Error('발각 스파이의 고용·대상 기업 계좌를 확인하세요.');
  const targetRevenue=adjustedRevenue(ops[targetId],day,effects.docs.map(d=>({id:d.id,...d.data()})),now).revenue;
  const {intended,compensation}=detectionCompensation(targetRevenue),companyName=owner.data().name||companyId,targetName=target.data().name||targetId;
  const ownerCash=checkCash(funds(ops[companyId],ownerBook.data())-compensation),targetCash=checkCash(funds(ops[targetId],targetBook.data())+compensation);
  const source=roster.docs.find(d=>d.id===companyId).data(),agents=spyAgents(source);agents[slot]={...agents[slot],remaining:0};
  const newsId='spy-detection-d'+day,result={day,status:'detected',...chosen,companyName,targetName,targetRevenue,intended,compensation,newsId};
  t.update(db.doc('companySpies/'+companyId),{agents,...(source.hireId===hireId?{remaining:0}:{})});
  t.update(db.doc('companyOperations/'+companyId),{cash:ownerCash,receivedIssuerCash:ownerBook.data().issuerCash});
  t.update(db.doc('companyOperations/'+targetId),{cash:targetCash,receivedIssuerCash:targetBook.data().issuerCash});
  t.set(db.doc('spyRegistry/main'),{version:(registry.data()?.version||0)+1,companyId,hireId});
  t.create(db.doc('news/'+newsId),{...detectionArticle(result),publishedAt:FieldValue.serverTimestamp()});
  t.create(ref,{...result,createdAt:FieldValue.serverTimestamp()});return result;
 });
}

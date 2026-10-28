import {FieldValue,Timestamp} from 'firebase-admin/firestore';
import {koreaDay,settleDay} from '../client/economy.js';
import {settlementTime} from '../client/settlement-time.js';
import {adjustedRevenue,effectiveDividendBps} from '../client/event-model.js';
import {rankedRevenue,DIVIDEND_MODEL} from '../client/ranked-dividends.js';
import {runDueChoiceEvents} from './choice-events.js';
import {detectDailySpy} from './spy-detection.js';
import {settleSpies} from '../client/spies.js';
import {publishCashRankings} from '../client/rankings.js';
import {refreshShareholders} from './shareholder-refresh.js';
export const FINAL_SETTLEMENT_DAY=20755; // 2026-10-29, Asia/Seoul.
export async function finalizeCompetition(db,{now=Date.now(),settle=settleDay,publish=publishCashRankings,detect=detectDailySpy,spies=settleSpies,refresh=refreshShareholders,events=runDueChoiceEvents}={}){
 const ref=db.doc('marketFinalization/main');
 const state=await db.runTransaction(async t=>{
  const [existing,maintenance]=await Promise.all([t.get(ref),t.get(db.doc('systemMaintenance/reset'))]);if(maintenance.exists)throw Error('Maintenance in progress');
  if(existing.exists){if(existing.data().day!==FINAL_SETTLEMENT_DAY)throw Error('Final settlement day mismatch');return existing.data();}
  if(koreaDay(now)!==FINAL_SETTLEMENT_DAY)throw Error('Final settlement may only start on the authorized date');
  const [companies,operations]=await Promise.all([t.get(db.collection('companies')),t.get(db.collection('companyOperations'))]),ops=new Map(operations.docs.map(s=>[s.id,s.data()]));
  const companyIds=companies.docs.filter(s=>['listed','paused'].includes(s.data().status)).map(s=>s.id).sort();
  if(!companyIds.length||companyIds.some(id=>!ops.has(id)||ops.get(id).productionModel!=='units-v2'||ops.get(id).locked))throw Error('Resolve missing or locked company accounts before finalization');
  const value={day:FINAL_SETTLEMENT_DAY,cutoffAt:Timestamp.fromMillis(now),closed:true,status:'settling',companyIds,startedAt:FieldValue.serverTimestamp()};t.create(ref,value);return value;
 });
 if(state.status==='complete')return {...state.summary,repeated:true};
 const day=state.day,at=state.cutoffAt.toMillis();
 // Invalidate both bands as well as the immutable closing marker. Older open
 // browsers cannot place/fill; original bounds remain available for display.
 for(const cid of state.companyIds)await db.runTransaction(async t=>{const book=db.doc('sparkBooks/'+cid),receipt=ref.collection('books').doc(cid),[b,r]=await Promise.all([t.get(book),t.get(receipt)]);if(!b.exists)throw Error('Missing company book');if(!r.exists)t.create(receipt,{priceLimits:b.data().priceLimits||null,nextPriceLimits:b.data().nextPriceLimits||null,createdAt:FieldValue.serverTimestamp()});t.update(book,{priceLimits:{...(b.data().priceLimits||{referencePrice:b.data().initialPrice,lower:100,upper:b.data().initialPrice*2}),day:-1},nextPriceLimits:FieldValue.delete()});});
 const due=await events(db,at);if(due.failed||due.blocked.size)throw Error('Pending events must complete before the final dividend ranking');
 const detection=await detect(db,{now:at,allowEarly:true});if(detection.status==='waiting')throw Error('Spy detection is waiting for previous settlement recovery');
 await db.runTransaction(async t=>{
  const round=db.doc('dividendRounds/d'+day),previous=await t.get(round);if(previous.exists)return;
  const rows=await Promise.all(state.companyIds.map(async id=>{const [o,e]=await Promise.all([t.get(db.doc('companyOperations/'+id)),t.get(db.collection('companyEffects/'+id+'/items'))]);if(!o.exists||o.data().locked)throw Error('Company unavailable for final ranking');const ops=o.data();return {id,revenue:adjustedRevenue(ops,day,e.docs.map(r=>({id:r.id,...r.data()})),at).revenue,rateBps:effectiveDividendBps({...ops,dividendModel:DIVIDEND_MODEL},at)};}));
  t.create(round,{day,settlementAt:at,model:DIVIDEND_MODEL,entries:rankedRevenue(rows),createdAt:FieldValue.serverTimestamp()});
 });
 let settled=0,alreadySettled=0;
 for(const cid of state.companyIds){const o=(await db.doc('companyOperations/'+cid).get()).data();if(!o.locked&&o.lastSettledDay>=day){alreadySettled++;continue;}await settle(db,cid,()=>{},{finalSettlementAt:at});settled++;}
 // The spy transfer routine depends only on the day after its due-time gate;
 // company revenues above have already been frozen at the actual closing time.
 const spyResult=await spies(db,Math.max(at,settlementTime(day)));if(spyResult.status==='waiting')throw Error('Final spy transfers still waiting');
 let totalDividends=0,totalPayouts=0;for(const cid of state.companyIds){const [o,d]=await Promise.all([db.doc('companyOperations/'+cid).get(),db.doc('companyOperations/'+cid+'/days/d'+day).get()]);if(o.data()?.locked||o.data()?.lastSettledDay!==day||!d.exists||o.data().paidShares!==d.data().sold||o.data().paidAmount!==d.data().dividend)throw Error('Final payout verification failed');totalDividends+=d.data().dividend;totalPayouts+=d.data().sold;}
 await publish(db);await refresh(db,{force:true});
 const summary={day,companies:state.companyIds.length,settled,alreadySettled,totalDividends,totalPaidShares:totalPayouts,rankingsUpdated:true,closed:true};
 await ref.update({status:'complete',summary,completedAt:FieldValue.serverTimestamp()});return summary;
}

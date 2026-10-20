import {marketPaused} from '../client/market-session.js';
import {rankingRefreshDue} from '../client/ranking-schedule.js';
import {settleSpies} from '../client/spies.js';
import {detectDailySpy} from './spy-detection.js';
import {migrateSpyPolicy} from './spy-policy-migration.js';
import {runDueChoiceEvents} from './choice-events.js';
import {publishLeadership} from '../client/leadership.js';
import {settleDay,koreaDay} from '../client/economy.js';
import {publishCashRankings,allRows} from '../client/rankings.js';
import {settlementTime} from '../client/settlement-time.js';
export const settlementDue=now=>now>=settlementTime(koreaDay(now)); // 07:55 KST = previous day 22:55 UTC.
export async function runScheduledEconomy(db,{now=Date.now(),settle=settleDay,publish=publishCashRankings,detect=detectDailySpy,mode='full',isPaused=marketPaused}={}){
 if((await db.doc('systemMaintenance/reset').get()).exists)return {settled:0,resumed:0,skipped:0,failed:[],choiceEvents:{processed:0,failed:0},rankingsUpdated:false,maintenance:true};
 if(mode==='rankings-only'||mode==='full'&&isPaused(now)){
  const previous=(await db.doc('leaderboards/cash').get()).data(),updated=mode==='rankings-only'||rankingRefreshDue(previous,now);
  const board=updated?await publish(db):previous;
  return {settled:0,resumed:0,skipped:0,failed:[],choiceEvents:{processed:0,failed:0},rankingsUpdated:updated,participants:board?.participants||0,maintenance:isPaused(now)};
 }
 if(mode==='spies-policy-only'){const migration=await migrateSpyPolicy(db);return {settled:0,resumed:0,skipped:0,failed:[],choiceEvents:{processed:0,failed:0},rankingsUpdated:false,spyPolicy:migration};}
 if(mode!=='full')throw Error('Unknown economy job mode');
 await migrateSpyPolicy(db);
 const choiceEvents=await runDueChoiceEvents(db,now);
 const day=koreaDay(now),companies=await allRows(db,'companies'),result={settled:0,resumed:0,skipped:0,failed:[...choiceEvents.blocked],choiceEvents:{processed:choiceEvents.processed,failed:choiceEvents.failed}};
 try{
  result.spyDetection=await detect(db,{now,blocked:choiceEvents.blocked});
  if(result.spyDetection.status==='waiting'&&result.spyDetection.reason==='previous-payout'){
   // Finish an interrupted older payout before drawing for the new day.
   for(const c of companies){const o=(await db.doc('companyOperations/'+c.id).get()).data();if(o?.locked){try{await settle(db,c.id);result.resumed++;}catch{result.failed.push(c.id);}}}
   result.spyDetection=await detect(db,{now,blocked:choiceEvents.blocked});
  }
  if(result.spyDetection.status==='waiting'){result.failed.push('spy-detection');return result;}
 }catch(error){result.spyDetection={status:'failed',message:error.message};result.failed.push('spy-detection');return result;}
 for(const c of companies.filter(c=>['listed','paused'].includes(c.status))){
  try{
   // Resuming yesterday's interrupted payout must not mint today's revenue twice.
   for(let pass=0;pass<2;pass++){
    const s=await db.doc('companyOperations/'+c.id).get(),o=s.data();
    if(choiceEvents.blocked.has(c.id)&&!o?.locked)break;
    if(!s.exists||!o.locked&&(!settlementDue(now)||o.lastSettledDay>=day)){result.skipped++;break;}
    const b=await db.doc('sparkBooks/'+c.id).get();if(!b.exists){result.skipped++;break;}
    const resumed=o.locked;try{await settle(db,c.id);}catch(error){const latest=(await db.doc('companyOperations/'+c.id).get()).data();if(latest?.locked||latest?.lastSettledDay<day)throw error;}
    if(resumed)result.resumed++;else result.settled++;
    if(!resumed)break;
   }
  }catch{result.failed.push(c.id);}
 }
 try{result.spies=await settleSpies(db,now);}catch(error){result.spies={status:'failed',message:error.message};result.failed.push('industrial-spies');}
 const leadership=(await db.doc('companyLeadership/main').get()).data();
 const board=(await db.doc('leaderboards/cash').get()).data();
 // Avoid rereading every participant on each settlement retry (Spark quota).
 result.rankingsUpdated=!!(result.settled||result.resumed||!leadership||rankingRefreshDue(board,now));
 if(result.rankingsUpdated){await publish(db);await publishLeadership(db);}return result;
}

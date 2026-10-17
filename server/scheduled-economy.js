import {settleDay,koreaDay} from '../client/economy.js';
import {publishCashRankings,allRows} from '../client/rankings.js';
export const settlementDue=now=>now>=koreaDay(now)*86400000; // 09:00 KST = 00:00 UTC.
export async function runScheduledEconomy(db,{now=Date.now(),settle=settleDay,publish=publishCashRankings}={}){
 const day=koreaDay(now),companies=await allRows(db,'companies'),result={settled:0,resumed:0,skipped:0,failed:[]};
 for(const c of companies.filter(c=>['listed','paused'].includes(c.status))){
  try{
   // Resuming yesterday's interrupted payout must not mint today's revenue twice.
   for(let pass=0;pass<2;pass++){
    const s=await db.doc('companyOperations/'+c.id).get(),o=s.data();
    if(!s.exists||!o.locked&&(!settlementDue(now)||o.lastSettledDay>=day)){result.skipped++;break;}
    const b=await db.doc('sparkBooks/'+c.id).get();if(!b.exists){result.skipped++;break;}
    const resumed=o.locked;try{await settle(db,c.id);}catch(error){const latest=(await db.doc('companyOperations/'+c.id).get()).data();if(latest?.locked||latest?.lastSettledDay<day)throw error;}
    if(resumed)result.resumed++;else result.settled++;
    if(!resumed)break;
   }
  }catch{result.failed.push(c.id);}
 }
 const board=(await db.doc('leaderboards/cash').get()).data(),last=board?.updatedAt?.toMillis?.()||0;
 // Avoid rereading every participant on each settlement retry (Spark quota).
 result.rankingsUpdated=!!(result.settled||result.resumed||!last||now-last>=3600000);
 if(result.rankingsUpdated)await publish(db);return result;
}

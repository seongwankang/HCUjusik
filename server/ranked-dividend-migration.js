import {DIVIDEND_MODEL,normalizeDividendBps} from '../client/ranked-dividends.js';
import {newOperations,koreaDay} from '../client/economy.js';
import {nextSettlement} from '../client/settlement-time.js';
import {publishDividendForecast} from '../client/dividend-rounds.js';
export async function migrateRankedDividends(db,{now=Date.now()}={}){
 const companies=await db.collection('companies').get();
 const result=await db.runTransaction(async t=>{
  if((await t.get(db.doc('systemMaintenance/reset'))).exists)throw Error('Maintenance in progress');
  const snapshots=await Promise.all(companies.docs.map(c=>t.get(db.doc('companyOperations/'+c.id))));
  if(snapshots.some(s=>s.data()?.locked))throw Error('Finish interrupted payouts before policy migration');
  let updated=0;
  for(const s of snapshots){const o=s.data();if(!o){t.set(s.ref,newOperations(now));updated++;continue;}
   const dividendBps=normalizeDividendBps(o.dividendBps);if(o.dividendModel!==DIVIDEND_MODEL||o.dividendBps!==dividendBps){t.update(s.ref,{dividendModel:DIVIDEND_MODEL,dividendBps});updated++;}}
  t.set(db.doc('economyConfig/main'),{dividendModel:DIVIDEND_MODEL},{merge:true});
  return {companies:companies.size,updated};
 });
 const next=nextSettlement({},now);await publishDividendForecast(db,next.day);
 const snapshots=await Promise.all(companies.docs.map(c=>db.doc('companyOperations/'+c.id).get())),rates=snapshots.map(s=>s.data()?.dividendBps);
 if(snapshots.some(s=>s.data()?.dividendModel!==DIVIDEND_MODEL)||rates.some(r=>!Number.isSafeInteger(r)||r<1000||r>3000))throw Error('Dividend policy verification failed');
 return {...result,model:DIVIDEND_MODEL,forecastDay:next.day,verifiedCompanies:rates.length,minimumRateBps:rates.length?Math.min(...rates):null,maximumRateBps:rates.length?Math.max(...rates):null};
}

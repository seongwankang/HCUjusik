import {collection,query,orderBy,documentId,limit,startAfter,getDocs,getDoc,doc,runTransaction,serverTimestamp} from 'firebase/firestore';
import {immutableRows} from './immutable-reads.js';
import {adjustedRevenue,effectiveDividendBps,needsProduction} from './event-model.js';
import {rankedRevenue,DIVIDEND_MODEL} from './ranked-dividends.js';
import {settlementTime} from './settlement-time.js';
async function inputs(db){
 let cursor=null,companies=[];
 for(;;){const page=await getDocs(query(collection(db,'companies'),orderBy(documentId()),limit(100),...(cursor?[startAfter(cursor)]:[])));companies.push(...page.docs.filter(s=>['listed','paused'].includes(s.data().status)));if(page.size<100)break;cursor=page.docs.at(-1);}
 return Promise.all(companies.map(async c=>{const ref=doc(db,'companyOperations',c.id),s=await getDoc(ref),o=s.data();const effects=o?await immutableRows(db,'companyEffects/'+c.id+'/items',{field:'appliedAt',pageSize:100,revision:o.lastEvent||'',persistent:true}):[];return {id:c.id,ref,o,effects};}));
}
function rankedInputs(rows,day,at){return rankedRevenue(rows.map(({id,o,effects})=>{
 if(o&&needsProduction(o))throw Error('기존 설비 분류 완료 후 배당 순위를 확정하세요.');
 return {id,revenue:o?adjustedRevenue(o,day,effects,at).revenue:0,rateBps:effectiveDividendBps({...o,dividendModel:DIVIDEND_MODEL},at)};
}));}
export async function prepareDividendRound(db,day){
 const ref=doc(db,'dividendRounds','d'+day),old=await getDoc(ref);if(old.exists())return old.data();
 if(Date.now()<settlementTime(day))throw Error('배당 순위는 오전 7시 55분 정산 시 확정합니다.');
 for(let retry=0;retry<4;retry++){
  const source=await inputs(db);
  try{return await runTransaction(db,async t=>{
   const existing=await t.get(ref);if(existing.exists())return existing.data();
   const snapshots=await Promise.all(source.map(r=>t.get(r.ref)));
   const rows=source.map((r,i)=>{const o=snapshots[i].data();if((o?.lastEvent||'')!==(r.o?.lastEvent||''))throw Error('DIVIDEND_EVENT_RETRY');if(o?.locked)throw Error('진행 중인 이전 정산을 먼저 완료하세요.');return {...r,o};});
   const result={day,settlementAt:settlementTime(day),model:DIVIDEND_MODEL,entries:rankedInputs(rows,day,settlementTime(day)),createdAt:serverTimestamp()};
   t.set(ref,result);return result;
  });}catch(e){if(e.message!=='DIVIDEND_EVENT_RETRY'||retry===3)throw e;}
 }
}
export async function frozenDividendContext(db,cid,day){const round=await prepareDividendRound(db,day),entry=round.entries.find(r=>r.id===cid);if(!entry)throw Error('정산 순위에 포함되지 않은 기업입니다.');return entry;}
export async function publishDividendForecast(db,day){
 const rows=await inputs(db),result={day,settlementAt:settlementTime(day),model:DIVIDEND_MODEL,entries:rankedInputs(rows,day,settlementTime(day)),updatedAt:serverTimestamp()};
 await runTransaction(db,async t=>t.set(doc(db,'dividendForecasts','main'),result));return result;
}
export async function forecastDividendContext(db,cid,revenue,day,reads){
 const read=reads?.getDoc||getDoc,s=await read(doc(db,'dividendForecasts','main')),forecast=s.data();
 if(!forecast||forecast.day!==day||!Number.isSafeInteger(revenue))return null;
 return rankedRevenue(forecast.entries.map(r=>({...r,revenue:r.id===cid?revenue:r.revenue}))).find(r=>r.id===cid)||null;
}

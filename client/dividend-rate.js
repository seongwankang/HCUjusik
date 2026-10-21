import {doc,runTransaction,serverTimestamp} from 'firebase/firestore';
import {dividendChangeStatus} from './dividend-policy.js';
export const DIVIDEND_NEWS_CONTENT='배당률을 변경했습니다. 변경된 배당률은 다음 정산부터 적용됩니다.';
export async function changeDividendRate(db,cid,bps,now=Date.now()){
 if(!Number.isSafeInteger(bps)||bps<1000||bps>3000)throw Error('배당률은 10~30%로 입력하세요.');
 const newsId=crypto.randomUUID();
 return runTransaction(db,async t=>{
  const ref=doc(db,'companyOperations',cid),companyRef=doc(db,'companies',cid);
  const [s,c]=await Promise.all([t.get(ref),t.get(companyRef)]),o=s.data(),company=c.data();
  if(!o||!company)throw Error('회사 경영 정보를 먼저 불러와 주세요.');
  const status=dividendChangeStatus(o,now);if(!status.allowed)throw Error(status.reason);
  if(o.dividendBps===bps)throw Error('현재와 다른 배당률을 입력하세요.');
  t.update(ref,{dividendBps:bps,lastDividendDay:status.day,lastDividendNews:newsId});
  t.set(doc(db,'news',newsId),{title:company.name+' 배당률 변경',content:DIVIDEND_NEWS_CONTENT,category:'기업 뉴스',companyId:cid,companyName:company.name,dividendChange:{day:status.day,fromBps:o.dividendBps,toBps:bps},publishedAt:serverTimestamp()});
  return {ok:true,newsId};
 });
}

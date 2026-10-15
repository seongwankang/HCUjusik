import {productionPool,adjustedRevenue,requireProduction} from './event-model.js';
import {effectRecords,applyEvent} from './events.js';
import {doc,getDoc,getDocs,collection,query,where,orderBy,limit,startAfter,FieldPath,runTransaction,serverTimestamp} from 'firebase/firestore';
export const ASSETS={factory:'공장',equipment:'생산 설비',research:'연구 시설'};
export const DEFAULT_CONFIG={factoryCost:100000,factoryRevenue:5000,equipmentCost:50000,equipmentRevenue:2000,researchCost:200000,researchRevenue:12000};
const MAX=1000000000000;
const fail=s=>{throw new Error(s);};
export const koreaDay=(time=Date.now())=>Math.floor((time+32400000)/86400000);
export function validateConfig(c){for(const k of Object.keys(DEFAULT_CONFIG))if(!Number.isSafeInteger(c[k])||c[k]<1||c[k]>100000000)fail('설비 가격과 일매출은 1~1억 원의 정수로 입력하세요.');return Object.fromEntries(Object.keys(DEFAULT_CONFIG).map(k=>[k,c[k]]));}
export function initialOperations(){return {cash:0,receivedIssuerCash:0,revenue:0,pendingRevenue:0,pendingDay:0,factory:0,equipment:0,research:0,dividendBps:0,lastSettledDay:0,locked:false,currentDay:'',paidShares:0,paidAmount:0};}
export function availableFunds(ops,book){return ops.cash+(book?.issuerCash||0)-ops.receivedIssuerCash;}
export function dayPlan(ops,book,day,records=[],now=Date.now()){
 if(ops.locked)fail('진행 중인 정산을 먼저 완료하세요.');if(day<=ops.lastSettledDay)fail('오늘 정산은 이미 완료했습니다.');
 const {base,revenue}=adjustedRevenue(ops,day,records,now),sold=book.issuedShares-book.treasuryShares;
 const perShare=sold?Math.floor(Number(BigInt(revenue)*BigInt(ops.dividendBps)/10000n)/sold):0,dividend=perShare*sold;
 const cash=availableFunds(ops,book)+revenue-dividend;if(!Number.isSafeInteger(cash)||cash>MAX)fail('회사 자금 한도를 초과합니다.');
 return {base,revenue,sold,perShare,dividend,retained:revenue-dividend,cash};
}
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
export async function operationsView(db,cid){
 if(!validId(cid))fail('기업을 선택하세요.');const [o,b,config,days]=await Promise.all([getDoc(doc(db,'companyOperations',cid)),getDoc(doc(db,'sparkBooks',cid)),getDoc(doc(db,'economyConfig','main')),getDocs(query(collection(db,'companyOperations',cid,'days'),orderBy('day','desc'),limit(30)))]);
 const ops=o.exists()?o.data():initialOperations(),book=b.exists()?b.data():null;
 return {initialized:o.exists(),ops,book,available:availableFunds(ops,book),config:config.exists()?config.data():null,days:days.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate().toISOString()})).sort((a,b)=>b.day-a.day)};
}
export async function initializeOperations(db,cid){if(!validId(cid))fail('기업을 선택하세요.');await runTransaction(db,async t=>{const ref=doc(db,'companyOperations',cid);if(!(await t.get(ref)).exists())t.set(ref,initialOperations());});}
export async function invest(db,cid,asset){
 if(!validId(cid)||!Object.hasOwn(ASSETS,asset))fail('기업과 설비를 확인하세요.');
 return runTransaction(db,async t=>{const ref=doc(db,'companyOperations',cid),[os,bs,cs,company]=await Promise.all([t.get(ref),t.get(doc(db,'sparkBooks',cid)),t.get(doc(db,'economyConfig','main')),t.get(doc(db,'companies',cid))]);
 if(!os.exists()||!bs.exists())fail('주식 판매와 회사 계좌 준비 후 투자하세요.');if(!company.exists()||company.data().status!=='listed')fail('상장 기업만 투자할 수 있습니다.');
 const o=os.data();requireProduction(o);const book=bs.data(),config=cs.exists()?validateConfig(cs.data()):fail('관리자가 설비 가격·매출을 먼저 설정해야 합니다.');
 if(o.locked)fail('배당 정산 중에는 투자할 수 없습니다.');const day=koreaDay();if(o.pendingRevenue&&o.pendingDay<=day)fail('이전 설비 매출을 반영하려면 오늘 정산을 먼저 실행하세요.');
 const cash=availableFunds(o,book)-config[asset+'Cost'];if(cash<0)fail('회사 자금이 부족합니다.');if(o[asset]>=1000)fail('설비 보유 한도에 도달했습니다.');
 t.update(ref,{cash,receivedIssuerCash:book.issuerCash,[asset]:o[asset]+1,pendingRevenue:o.pendingRevenue+config[asset+'Revenue'],pendingDay:day+1,production:productionPool(o),pendingProduction:{...productionPool(o,true),[asset]:productionPool(o,true)[asset]+config[asset+'Revenue']}});
 });
}
export async function beginDay(db,cid,retry=0){
 if(!validId(cid))fail('기업을 선택하세요.');let before=await getDoc(doc(db,'companyOperations',cid));if(before.data()?.pendingEvent){const eid=before.data().pendingEvent,selected=await getDoc(doc(db,'companyChoices',cid,'items',eid));await applyEvent(db,cid,eid,selected.data().option);before=await getDoc(doc(db,'companyOperations',cid));}const records=await effectRecords(db,cid);return runTransaction(db,async t=>{const ref=doc(db,'companyOperations',cid),[os,bs]=await Promise.all([t.get(ref),t.get(doc(db,'sparkBooks',cid))]);
 if(!os.exists()||!bs.exists())fail('회사 계좌와 주식 판매 내역을 확인하세요.');const o=os.data();if(o.locked)return o.currentDay;if(o.pendingEvent||o.lastEvent!==before.data()?.lastEvent)throw new Error('EVENT_RETRY');
 const day=koreaDay(),key='d'+day,p=dayPlan(o,bs.data(),day,records),dayRef=doc(db,'companyOperations',cid,'days',key);if((await t.get(dayRef)).exists())fail('이미 정산한 날짜입니다.');
 t.set(dayRef,{day,revenue:p.revenue,sold:p.sold,perShare:p.perShare,dividend:p.dividend,retained:p.retained,rateBps:o.dividendBps,createdAt:serverTimestamp()});
 t.update(ref,{cash:p.cash,receivedIssuerCash:bs.data().issuerCash,revenue:p.base,...(o.production?{production:Object.fromEntries(Object.keys(ASSETS).map(k=>[k,productionPool(o)[k]+(o.pendingDay<=day?productionPool(o,true)[k]:0)])),pendingProduction:o.pendingDay<=day?{factory:0,equipment:0,research:0}:productionPool(o,true)}:{}),pendingRevenue:o.pendingDay<=day?0:o.pendingRevenue,pendingDay:o.pendingDay<=day?0:o.pendingDay,locked:true,currentDay:key,paidShares:0,paidAmount:0});return key;
 }).catch(e=>{if(e.message==='EVENT_RETRY'&&retry<5)return beginDay(db,cid,retry+1);throw e;});
}
export async function payHolder(db,cid,key,uid){
 return runTransaction(db,async t=>{const opRef=doc(db,'companyOperations',cid),accountRef=doc(db,'sparkAccounts',uid),receipt=doc(db,'companyOperations',cid,'days',key,'payouts',uid);
 const [os,ds,as,rs]=await Promise.all([t.get(opRef),t.get(doc(db,'companyOperations',cid,'days',key)),t.get(accountRef),t.get(receipt)]);
 if(rs.exists())return false;const o=os.data(),d=ds.data(),a=as.data();if(!o?.locked||o.currentDay!==key)fail('정산 상태가 변경되었습니다.');const shares=a?.positions?.[cid]||0;if(!shares)return false;
 const amount=d.perShare*shares;if(!Number.isSafeInteger(a.cash+amount)||a.cash+amount>MAX)fail('학생 현금 한도를 초과했습니다. 관리자 확인이 필요합니다.');
 t.update(accountRef,{cash:a.cash+amount,version:a.version+1,lastMarket:cid});t.set(doc(db,'sparkAccounts',uid,'dividends',cid+'_'+key),{companyId:cid,dayId:key,day:d.day,shares,amount,createdAt:serverTimestamp()});t.set(receipt,{shares,amount,createdAt:serverTimestamp()});t.update(opRef,{paidShares:o.paidShares+shares,paidAmount:o.paidAmount+amount});return true;
 });
}
export async function finishDay(db,cid,key){await runTransaction(db,async t=>{const ref=doc(db,'companyOperations',cid),[os,ds]=await Promise.all([t.get(ref),t.get(doc(db,'companyOperations',cid,'days',key))]);const o=os.data(),d=ds.data();if(!o?.locked||o.currentDay!==key)fail('진행 중인 정산이 없습니다.');if(o.paidShares!==d.sold||o.paidAmount!==d.dividend)fail('배당 대상 수량이 맞지 않습니다. 정산을 다시 실행해 누락된 지급을 완료하세요.');t.update(ref,{locked:false,lastSettledDay:d.day,currentDay:''});});}
export async function settleDay(db,cid,onProgress=()=>{}){
 const key=await beginDay(db,cid);let cursor=null,count=0;
 for(;;){const q=query(collection(db,'sparkAccounts'),where(new FieldPath('positions',cid),'>',0),limit(100),...(cursor?[startAfter(cursor)]:[]));const page=await getDocs(q);for(const s of page.docs){await payHolder(db,cid,key,s.id);onProgress(++count);}if(page.size<100)break;cursor=page.docs.at(-1);}
 await finishDay(db,cid,key);return {ok:true,recipients:count};
}

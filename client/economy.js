import {UNITS_MODEL,emptyUnits,pendingUnits,matureUnits,unitPurchase,totalUnits} from './production-units.js';
import {frozenDividendContext} from './dividend-rounds.js';
import {DIVIDEND_MODEL} from './ranked-dividends.js';
import {dividendAllocation} from './dividends.js';
import {DEFAULT_CONFIG,validateConfig,effectiveConfig,researchBps,hasPending,staffCapacity,RESEARCH_LIMIT} from './business-policy.js';
import {investmentDay,settlementTime} from './settlement-time.js';
export {DEFAULT_CONFIG,validateConfig} from './business-policy.js';
import {productionPool,adjustedRevenue,requireProduction,investmentCost,effectiveDividendBps} from './event-model.js';
import {effectRecords,applyEvent,applyDueCompanyChoices} from './events.js';
import {doc,getDoc,getDocs,collection,query,where,orderBy,limit,startAfter,FieldPath,runTransaction,serverTimestamp} from 'firebase/firestore';
export const ASSETS={factory:'공장',equipment:'생산 설비',research:'R&D센터',employee:'직원'};
const MAX=1000000000000;
const fail=s=>{throw new Error(s);};
export const koreaDay=(time=Date.now())=>Math.floor((time+32400000)/86400000);
export function initialOperations(){return {cash:0,receivedIssuerCash:0,revenue:0,pendingRevenue:0,pendingDay:0,factory:0,equipment:0,research:0,dividendBps:100,lastSettledDay:0,locked:false,currentDay:'',paidShares:0,paidAmount:0};}
export function availableFunds(ops,book){return ops.cash+(book?.issuerCash||0)-ops.receivedIssuerCash;}
export function dayPlan(ops,book,day,records=[],now=Date.now(),context){
 if(ops.locked)fail('진행 중인 정산을 먼저 완료하세요.');if(day<=ops.lastSettledDay)fail('오늘 정산은 이미 완료했습니다.');
 if(ops.dividendModel===DIVIDEND_MODEL&&!context)fail('배당 순위가 확정되지 않았습니다.');
 const calculated=adjustedRevenue(ops,day,records,now),{base}=calculated,revenue=context?.revenue??calculated.revenue,rateBps=context?.rateBps??effectiveDividendBps(ops,now),allocation=dividendAllocation(revenue,rateBps,book,context),{dividend}=allocation,companyCharge=allocation.companyCharge??dividend;
 const cash=availableFunds(ops,book)+revenue-companyCharge;if(!Number.isSafeInteger(cash)||Math.abs(cash)>MAX)fail('회사 자금 한도를 초과합니다.');
 return {base,revenue,...allocation,retained:revenue-companyCharge,companyCharge,cash,rateBps:allocation.rateBps??rateBps};
}
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
export async function operationsView(db,cid,reads){
 const readDoc=reads?.getDoc||getDoc,readDocs=reads?.getDocs||getDocs;
 if(!validId(cid))fail('기업을 선택하세요.');const [o,b,config,days]=await Promise.all([readDoc(doc(db,'companyOperations',cid)),readDoc(doc(db,'sparkBooks',cid)),readDoc(doc(db,'economyConfig','main')),readDocs(query(collection(db,'companyOperations',cid,'days'),orderBy('day','desc'),limit(30)),'companyOperations/'+cid+'/days')]);
 const ops=o.exists()?o.data():initialOperations(),book=b.exists()?b.data():null;
 const today=koreaDay(),todayStart=today*86400000-32400000;
 const todayRows=async kind=>{let cursor=null;const rows=[],path='companyOperations/'+cid+'/'+kind;for(;;){const page=await readDocs(query(collection(db,'companyOperations',cid,kind),where('createdAt','>=',new Date(todayStart)),orderBy('createdAt','desc'),limit(30),...(cursor?[startAfter(cursor)]:[])),path);rows.push(...page.docs);if(page.size<30)break;cursor=page.docs.at(-1);}return rows;};
 const [purchases,refunds]=await Promise.all([todayRows('investments'),ops.productionModel===UNITS_MODEL?todayRows('refunds'):[]]),refundedIds=new Set(refunds.map(d=>d.id));
 const investments=purchases.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate().toISOString(),refunded:refundedIds.has(d.id)}));
 return {investments,initialized:o.exists(),ops,book,available:availableFunds(ops,book),config:effectiveConfig(config.exists()?config.data():null),usingDefaultPolicy:config.data()?.version!==4,days:days.docs.map(d=>({id:d.id,...d.data(),createdAt:d.data().createdAt?.toDate().toISOString()})).sort((a,b)=>b.day-a.day)};
}
export function newOperations(now=Date.now()){const day=koreaDay(now);return {...initialOperations(),productionModel:UNITS_MODEL,pendingUnits:emptyUnits(),dividendBps:1000,dividendModel:DIVIDEND_MODEL,lastSettledDay:now>=settlementTime(day)?day:0};}
export async function initializeOperations(db,cid){if(!validId(cid))fail('기업을 선택하세요.');await runTransaction(db,async t=>{const ref=doc(db,'companyOperations',cid);if(!(await t.get(ref)).exists())t.set(ref,newOperations());});}
export async function invest(db,cid,asset,quantity=1){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000||asset!=='employee'&&quantity!==1)fail('채용 인원을 1~1,000명의 정수로 입력하세요.');
 if(!validId(cid)||!Object.hasOwn(ASSETS,asset))fail('기업과 설비를 확인하세요.');
 const investmentId=crypto.randomUUID();
 return runTransaction(db,async t=>{const ref=doc(db,'companyOperations',cid),[os,bs,cs,company]=await Promise.all([t.get(ref),t.get(doc(db,'sparkBooks',cid)),t.get(doc(db,'economyConfig','main')),t.get(doc(db,'companies',cid))]);
 if(!os.exists()||!bs.exists())fail('주식 판매와 회사 계좌 준비 후 투자하세요.');if(!company.exists()||company.data().status!=='listed')fail('상장 기업만 투자할 수 있습니다.');
 const o=os.data();requireProduction(o);const book=bs.data(),config=effectiveConfig(cs.data());
 if(o.locked)fail('배당 정산 중에는 투자할 수 없습니다.');const day=investmentDay(o);if(hasPending(o)&&o.pendingDay<day)fail('오늘 7시 55분 정산이 아직 처리 중입니다. 정산 완료 후 추가 투자할 수 있습니다.');
 if(o.productionModel===UNITS_MODEL){
  if(o.pendingEvent)fail('선택한 이벤트 결과를 먼저 적용하세요.');
  const cost=investmentCost(o,config,asset)*quantity,cash=availableFunds(o,book)-cost;if(cash<0)fail('회사 자금이 부족합니다.');
  const change=unitPurchase(o,asset,day,quantity);
  t.set(doc(db,'companyOperations',cid,'investments',investmentId),{asset,quantity,cost,activeFromDay:day,createdAt:serverTimestamp()});
  t.update(ref,{...change,cash,receivedIssuerCash:book.issuerCash,lastInvestment:investmentId});return {quantity,cost};
 }
 if(quantity!==1)fail('기업 경제 전환 후 일괄 채용할 수 있습니다.');
 const cost=investmentCost(o,config,asset),cash=availableFunds(o,book)-cost;if(o.pendingEvent)fail('선택한 이벤트 결과를 먼저 적용하세요.');if(asset==='research'&&(o.research>=RESEARCH_LIMIT||researchBps(o)+(o.pendingResearchBps||0)>=3000))fail('R&D센터는 최대 6개입니다.');if(asset==='employee'&&(o.employees||0)>=staffCapacity(o))fail('직원 수용 인원이 부족합니다. 공장·생산 설비를 추가해 정원을 늘리세요.');if(asset!=='employee'&&o[asset]>=1000)fail('설비 보유 한도에 도달했습니다.');if(cash<0)fail('회사 자금이 부족합니다.');
 const yieldAmount=['factory','equipment'].includes(asset)?config[asset+'Revenue']:0;
 const pending=productionPool(o,true);if(yieldAmount)pending[asset]+=yieldAmount;
 t.set(doc(db,'companyOperations',cid,'investments',investmentId),{asset,quantity:1,cost,activeFromDay:day,createdAt:serverTimestamp()});
 t.update(ref,{cash,lastInvestment:investmentId,receivedIssuerCash:book.issuerCash,...(asset!=='employee'?{[asset]:o[asset]+1}:{}),
  pendingRevenue:o.pendingRevenue+yieldAmount,pendingDay:day,production:productionPool(o),pendingProduction:pending,
  employees:(o.employees||0)+(asset==='employee'?1:0),staffRevenue:o.staffRevenue||0,
  pendingStaffRevenue:(o.pendingStaffRevenue||0)+(asset==='employee'?config.employeeRevenue:0),
  activeResearchBps:researchBps(o),pendingResearchBps:(o.pendingResearchBps||0)+(asset==='research'?config.researchBoostBps:0)});

 });
}
export async function beginDay(db,cid,retry=0,options={}){
 if(options.finalSettlementAt!==undefined){const final=(await getDoc(doc(db,'marketFinalization/main'))).data();if(final?.status!=='settling'||final.day!==koreaDay()||final.cutoffAt?.toMillis()!==options.finalSettlementAt)fail('최종 정산 승인 상태를 확인하세요.');}
 if(options.finalSettlementAt===undefined&&Date.now()<settlementTime(koreaDay())){const running=(await getDoc(doc(db,'companyOperations',cid))).data();if(!running?.locked)fail('오늘 정산은 오전 7시 55분부터 실행할 수 있습니다.');}
 if(!validId(cid))fail('기업을 선택하세요.');const existing=(await getDoc(doc(db,'companyOperations',cid))).data();if(existing?.locked)return existing.currentDay;await applyDueCompanyChoices(db,cid);let before=await getDoc(doc(db,'companyOperations',cid));if(before.data()?.pendingEvent){const eid=before.data().pendingEvent,selected=await getDoc(doc(db,'companyChoices',cid,'items',eid));const event=await getDoc(doc(db,'events',eid));if(event.data()?.type==='choice'&&event.data().endsAt.toMillis()>Date.now()){await runTransaction(db,async t=>{const r=doc(db,'companyOperations',cid),s=await t.get(r);if(!s.data().locked&&s.data().pendingEvent===eid)t.update(r,{pendingEvent:''});});}else await applyEvent(db,cid,eid,selected.data().option);before=await getDoc(doc(db,'companyOperations',cid));}const records=await effectRecords(db,cid),context=before.data()?.dividendModel===DIVIDEND_MODEL?await frozenDividendContext(db,cid,koreaDay()):null;return runTransaction(db,async t=>{const ref=doc(db,'companyOperations',cid),[os,bs]=await Promise.all([t.get(ref),t.get(doc(db,'sparkBooks',cid))]);
 if(!os.exists()||!bs.exists())fail('회사 계좌와 주식 판매 내역을 확인하세요.');const o=os.data();if(o.locked)return o.currentDay;if(o.pendingEvent||o.lastEvent!==before.data()?.lastEvent)throw new Error('EVENT_RETRY');
 const day=koreaDay(),key='d'+day,p=dayPlan(o,bs.data(),day,records,options.finalSettlementAt??(context?settlementTime(day):Date.now()),context),dayRef=doc(db,'companyOperations',cid,'days',key);if((await t.get(dayRef)).exists())fail('이미 정산한 날짜입니다.');
 t.set(dayRef,{...(context?{model:DIVIDEND_MODEL,rank:p.rank,rankBase:p.rankBase,companyCharge:p.companyCharge}:{}),day,revenue:p.revenue,issuedShares:p.issuedShares,treasuryShares:p.treasuryShares,treasuryDividend:p.treasuryDividend,sold:p.sold,perShare:p.perShare,dividend:p.dividend,retained:p.retained,rateBps:p.rateBps,createdAt:serverTimestamp()});
 t.update(ref,{...(o.productionModel===UNITS_MODEL?{pendingUnits:matureUnits(o,day)}:{}),settlementCount:(o.settlementCount||0)+1,cash:p.cash,receivedIssuerCash:bs.data().issuerCash,revenue:o.productionModel===UNITS_MODEL?0:p.base,...(o.production?{production:Object.fromEntries(['factory','equipment','research'].map(k=>[k,productionPool(o)[k]+(o.pendingDay<=day?productionPool(o,true)[k]:0)])),pendingProduction:o.pendingDay<=day?{factory:0,equipment:0,research:0}:productionPool(o,true)}:{}),staffRevenue:(o.staffRevenue||0)+(o.pendingDay<=day?(o.pendingStaffRevenue||0):0),pendingStaffRevenue:o.pendingDay<=day?0:(o.pendingStaffRevenue||0),activeResearchBps:researchBps(o)+(o.pendingDay<=day?(o.pendingResearchBps||0):0),pendingResearchBps:o.pendingDay<=day?0:(o.pendingResearchBps||0),pendingRevenue:o.pendingDay<=day?0:o.pendingRevenue,pendingDay:o.pendingDay<=day?0:o.pendingDay,locked:true,currentDay:key,paidShares:0,paidAmount:0});return key;
 }).catch(e=>{if(e.message==='EVENT_RETRY'&&retry<5)return beginDay(db,cid,retry+1,options);throw e;});
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
export async function settleDay(db,cid,onProgress=()=>{},options={}){
 const key=await beginDay(db,cid,0,options);let cursor=null,count=0;
 for(;;){const q=query(collection(db,'sparkAccounts'),where(new FieldPath('positions',cid),'>',0),limit(100),...(cursor?[startAfter(cursor)]:[]));const page=await getDocs(q);for(const s of page.docs){await payHolder(db,cid,key,s.id);onProgress(++count);}if(page.size<100)break;cursor=page.docs.at(-1);}
 await finishDay(db,cid,key);return {ok:true,recipients:count};
}

export async function refundInvestment(db,cid,id){
 if(!validId(cid)||!validId(id))fail('투자 내역을 확인하세요.');
 try{return await runTransaction(db,async t=>{
  const ref=doc(db,'companyOperations',cid),receipt=doc(db,'companyOperations',cid,'investments',id),refund=doc(db,'companyOperations',cid,'refunds',id);
  const [os,bs,rs,already]=await Promise.all([t.get(ref),t.get(doc(db,'sparkBooks',cid)),t.get(receipt),t.get(refund)]);
  if(already.exists())return {ok:true,alreadyRefunded:true};const o=os.data(),r=rs.data();
  if(!o||o.productionModel!==UNITS_MODEL||!r||!Object.hasOwn(ASSETS,r.asset))fail('투자 내역을 확인하세요.');
  if(o.locked||o.pendingEvent)fail('진행 중인 정산·이벤트 처리를 완료하세요.');
  if(koreaDay(r.createdAt.toMillis())!==koreaDay())fail('투자한 당일에만 취소할 수 있습니다.');
  if((o.inventoryLossAt?.[r.asset]?.toMillis()||0)>r.createdAt.toMillis())fail('투자 후 파괴·인력 이탈이 발생한 항목은 취소할 수 없습니다.');
  if(totalUnits(o,r.asset)<r.quantity)fail('이미 소멸한 설비·인력은 취소할 수 없습니다.');
  const pending=pendingUnits(o),field=r.asset==='employee'?'employees':r.asset;
  const pendingRemoval=r.activeFromDay>o.lastSettledDay?r.quantity:0;
  if(pending[r.asset]<pendingRemoval)fail('파괴·인력 이탈로 소멸한 투자는 취소할 수 없습니다.');
  const cash=availableFunds(o,bs.data())+r.cost;if(!Number.isSafeInteger(cash)||Math.abs(cash)>MAX)fail('회사 자금 한도를 초과합니다.');
  t.set(refund,{investmentId:id,asset:r.asset,quantity:r.quantity,amount:r.cost,createdAt:serverTimestamp()});
  t.update(ref,{cash,receivedIssuerCash:bs.data().issuerCash,[field]:o[field]-r.quantity,pendingUnits:{...pending,[r.asset]:pending[r.asset]-pendingRemoval},lastRefund:id});
  return {ok:true,amount:r.cost};
 });}catch(error){
  // A concurrent winner may make Rules reject the losing write before the SDK
  // retries it. A committed immutable receipt proves this request completed.
  if(error.code==='permission-denied'||error.code==='aborted'){
   const done=await getDoc(doc(db,'companyOperations',cid,'refunds',id));if(done.exists())return {ok:true,alreadyRefunded:true};
  }throw error;
 }
}

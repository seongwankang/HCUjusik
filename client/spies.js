import {doc,getDoc,getDocs,collection,query,orderBy,limit,runTransaction,serverTimestamp} from 'firebase/firestore';
import {investmentDay,koreaDay} from './settlement-time.js';
import {DEFAULT_SPY_POLICY,spyPolicy,spyTransfers} from './spy-model.js';
import {allRows} from './rankings.js';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
export async function spyView(db,cid){
 const [p,s,h]=await Promise.all([getDoc(doc(db,'spyPolicy/main')),getDoc(doc(db,'companySpies',cid)),getDocs(query(collection(db,'companySpies',cid,'history'),orderBy('day','desc'),limit(30)))]);
 return {policy:spyPolicy(p.data()),contract:s.data()||null,history:h.docs.map(d=>({id:d.id,...d.data()}))};
}
export async function hireSpy(db,cid,targetId){
 if(!id(cid)||!id(targetId)||cid===targetId)throw Error('다른 상장 기업을 선택하세요.');const hireId=crypto.randomUUID();
 return runTransaction(db,async t=>{
  const op=doc(db,'companyOperations',cid),slot=doc(db,'companySpies',cid),registry=doc(db,'spyRegistry/main');
  const [o,b,c,target,targetOps,targetBook,old,p,r]=await Promise.all([t.get(op),t.get(doc(db,'sparkBooks',cid)),t.get(doc(db,'companies',cid)),t.get(doc(db,'companies',targetId)),t.get(doc(db,'companyOperations',targetId)),t.get(doc(db,'sparkBooks',targetId)),t.get(slot),t.get(doc(db,'spyPolicy/main')),t.get(registry)]);
  const ops=o.data(),policy=spyPolicy(p.data());
  if(!ops||!b.exists()||c.data()?.status!=='listed'||target.data()?.status!=='listed'||!targetOps.exists()||!targetBook.exists())throw Error('회사 계좌가 준비된 상장 기업만 고용·대상 지정이 가능합니다.');
  if(ops.locked||ops.pendingEvent)throw Error('정산·이벤트 처리가 끝난 뒤 고용하세요.');
  if(old.data()?.remaining>0)throw Error('이미 활동 중인 산업스파이가 있습니다.');
  const cash=ops.cash+b.data().issuerCash-ops.receivedIssuerCash-policy.cost;
  if(cash<0)throw Error('회사 자금이 부족합니다.');
  const contract={companyId:cid,targetId,hireId,...policy,remaining:policy.settlements,activeFromDay:investmentDay(ops),lastRoundDay:0,createdAt:serverTimestamp()};
  t.set(slot,contract);t.set(doc(db,'companySpies',cid,'hires',hireId),contract);
  t.update(op,{cash,receivedIssuerCash:b.data().issuerCash,lastSpyHire:hireId});
  t.set(registry,{version:(r.data()?.version||0)+1,companyId:cid,hireId});
  return {ok:true};
 });
}
// One atomic, final phase after all involved companies finish their ordinary payout.
// The registry prevents a roster read racing an eligible hire; retries cannot double debit.
export async function settleSpies(db,now=Date.now(),retry=0){
 const day=koreaDay(now);if(now<day*86400000)return {status:'not-due'};
 const round=doc(db,'spyRounds','d'+day);if((await getDoc(round)).exists())return {status:'complete'};
 const version=(await getDoc(doc(db,'spyRegistry/main'))).data()?.version||0;
 const contracts=(await allRows(db,'companySpies')).filter(s=>s.remaining>0&&s.activeFromDay<=day&&s.lastRoundDay<day);
 if(!contracts.length)return {status:'empty'};
 const ids=[...new Set(contracts.flatMap(s=>[s.companyId,s.targetId]))].sort();
 if(ids.length>100)throw Error('산업스파이 정산 대상이 100개 기업을 초과했습니다.');
 try{return await runTransaction(db,async t=>{
  const [done,registry]=await Promise.all([t.get(round),t.get(doc(db,'spyRegistry/main'))]);if(done.exists())return {status:'complete'};
  if((registry.data()?.version||0)!==version)throw Error('SPY_ROSTER_RETRY');
  const current=await Promise.all(contracts.map(s=>t.get(doc(db,'companySpies',s.companyId))));
  if(current.some((s,i)=>s.data()?.hireId!==contracts[i].hireId||s.data()?.remaining!==contracts[i].remaining))throw Error('SPY_ROSTER_RETRY');
  const rows=await Promise.all(ids.map(async cid=>{const [o,b,c,d]=await Promise.all([t.get(doc(db,'companyOperations',cid)),t.get(doc(db,'sparkBooks',cid)),t.get(doc(db,'companies',cid)),t.get(doc(db,'companyOperations',cid,'days','d'+day))]);return {id:cid,ops:o.data(),book:b.data(),company:c.data(),day:d.data()};}));
  const eligible=r=>r.ops&&r.book&&['listed','paused'].includes(r.company?.status);
  if(rows.some(r=>eligible(r)&&(!r.day||r.ops.locked||r.ops.lastSettledDay<day)))return {status:'waiting'};
  const snapshots=Object.fromEntries(rows.filter(eligible).map(r=>[r.id,{revenue:r.day.revenue,cash:r.ops.cash+r.book.issuerCash-r.ops.receivedIssuerCash}]));
  const plan=spyTransfers(contracts,snapshots);
  for(const e of plan.entries){const r=rows.find(r=>r.id===e.companyId),cash=snapshots[e.companyId].cash+e.net;if(!Number.isSafeInteger(cash)||cash<0||cash>1e12)throw Error('산업스파이 정산 자금 한도를 확인하세요.');
   t.update(doc(db,'companyOperations',e.companyId),{cash,receivedIssuerCash:r.book.issuerCash});
   t.set(doc(db,'companySpies',e.companyId,'history','d'+day),{day,...e,createdAt:serverTimestamp()});
  }
  for(const s of contracts)t.update(doc(db,'companySpies',s.companyId),{remaining:s.remaining-1,lastRoundDay:day});
  t.set(round,{day,...plan,createdAt:serverTimestamp()});return {status:'settled',...plan};
 });}catch(e){if(e.message==='SPY_ROSTER_RETRY'&&retry<4)return settleSpies(db,now,retry+1);throw e;}
}
export {DEFAULT_SPY_POLICY};

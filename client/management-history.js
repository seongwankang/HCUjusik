import {effectText,ONE_TIME_EFFECTS,TIMED_EFFECTS,currentEffect,remainingSettlements} from './event-model.js';
import {settlementTime} from './settlement-time.js';
export const compareHistory=(a,b)=>b.appliedAt-a.appliedAt||String(a.id).localeCompare(String(b.id))||String(a.source).localeCompare(String(b.source));
export function managementHistory({ops={},effects=[],events=[],investments=[]},now=Date.now()){
 const o=ops||{};
 const timestamp=v=>typeof v==='number'?v:v?.toMillis?.()??Date.parse(v);
 const recentEvents=effects.filter(r=>[...ONE_TIME_EFFECTS,...TIMED_EFFECTS,'none'].includes(r.effect?.kind)&&Number.isFinite(timestamp(r.appliedAt))&&timestamp(r.appliedAt)<=now).sort((a,b)=>timestamp(b.appliedAt)-timestamp(a.appliedAt)||String(a.id).localeCompare(String(b.id))).map(r=>({
  source:'event',id:r.id,title:events.find(e=>e.id===r.id)?.title||'기업 이벤트',kind:r.effect.kind,appliedAt:timestamp(r.appliedAt),
  ...(r.effect.kind==='cash'?{amount:Number.isSafeInteger(r.result?.amount)?r.result.amount:r.effect.amount}:{}),
  status:ONE_TIME_EFFECTS.includes(r.effect.kind)?'applied':r.effect.kind==='none'?'unchanged':currentEffect(o,r,now)?'active':'ended',
  ...(Number.isInteger(r.effect.settlements)&&r.effect.settlements>0?{remainingSettlements:remainingSettlements(o,r)}:{}),description:effectText(r.effect,r.effect.kind==='cash'&&Number.isSafeInteger(r.result?.amount)?{amount:r.result.amount}:['workforce','grant','destroy'].includes(r.effect.kind)&&Number.isSafeInteger(r.result?.count)?{count:r.result.count}:undefined),
 }));
 const investmentNames={factory:'공장',equipment:'생산 설비',research:'R&D센터',employee:'직원'};
 const investmentHistory=investments.filter(r=>Object.hasOwn(investmentNames,r.asset)&&Number.isSafeInteger(r.quantity)&&r.quantity>0&&r.quantity<=1000&&Number.isSafeInteger(r.cost)&&r.cost>0&&r.cost<=1e12&&Number.isSafeInteger(r.activeFromDay)&&r.activeFromDay>=0&&r.activeFromDay<=1000000&&Number.isFinite(timestamp(r.createdAt))&&timestamp(r.createdAt)<=now).map(r=>({
  source:'investment',activationAt:settlementTime(r.activeFromDay),id:r.id,kind:r.asset==='employee'?'hiring':'investment',appliedAt:timestamp(r.createdAt),status:r.refunded?'refunded':settlementTime(r.activeFromDay)>now?'pending':'applied',
  title:investmentNames[r.asset]+' '+r.quantity+(r.asset==='employee'?'명 채용':'개 건설'),
  description:(r.refunded?'당일 취소·전액 환불 ':'투자금 ')+r.cost.toLocaleString('ko-KR')+'원 · '+new Date(r.activeFromDay*86400000).toISOString().slice(0,10)+' 오전 7시 55분 정산부터 수익 반영',
 }));
 const recentHistory=[...recentEvents,...investmentHistory].sort(compareHistory);
 return {recentEvents,recentHistory};
}
export function historyPage(rows,cursor,limit=20){
 if(cursor&&(typeof cursor.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(cursor.id)||!['event','investment'].includes(cursor.source)||!Number.isSafeInteger(cursor.appliedAt)||cursor.appliedAt<0))throw Error('경영이력 조회 위치를 확인하세요.');
 const older=cursor?rows.filter(row=>compareHistory(row,cursor)>0):rows,items=older.slice(0,limit),last=items.at(-1);
 return {rows:items,next:older.length>limit?{id:last.id,source:last.source,appliedAt:last.appliedAt}:null};
}

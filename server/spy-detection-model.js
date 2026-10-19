import {oldestActiveSpy} from '../client/spy-model.js';
const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
export function detectionCandidates(roster,day){
 return roster.flatMap(({id,...s})=>(oldestActiveSpy(s)?[oldestActiveSpy(s)]:[]).filter(([slot,a])=>valid(id)&&valid(a.targetId)&&a.targetId!==id&&valid(a.hireId)&&a.remaining>0&&a.activeFromDay<=day&&a.lastRoundDay<day).map(([slot,a])=>({companyId:id,targetId:a.targetId,hireId:a.hireId,slot})));
}
export function detectionCompensation(revenue){
 if(!Number.isSafeInteger(revenue)||revenue<0||revenue>1e12)throw Error('발각 보상금의 기준 일매출을 확인하세요.');
 const intended=Number(BigInt(revenue)*500n/10000n),compensation=Number((BigInt(intended)*3n+1n)/2n);
 return {intended,compensation};
}
export function detectionArticle({day,companyId,targetId,companyName,targetName,targetRevenue,intended,compensation}){
 const date=new Date(day*86400000).toISOString().slice(0,10),won=n=>n.toLocaleString('ko-KR')+'원';
 return {title:('[산업스파이 발각] '+companyName+' 소속 스파이 적발').slice(0,120),category:'기업 뉴스',companyId,companyName,
  content:`${date} 정산 전, ${targetName}에 잠입한 ${companyName} 소속 산업스파이 1명이 발각되었습니다.\n\n발각된 스파이는 즉시 활동이 종료되어 오늘부터 수익을 가져오지 못합니다. 다시 파견하려면 고용비를 내고 새로 고용해야 합니다.\n\n${targetName}의 이번 정산 예정 일매출: ${won(targetRevenue)}\n해당 스파이가 가져오려던 금액(일매출의 5%): ${won(intended)}\n보상금(예정 금액의 150%): ${won(compensation)}\n\n${companyName}의 회사 계좌에서 ${targetName}의 회사 계좌로 보상금을 지급했습니다.`};
}

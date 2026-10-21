export const DIVIDEND_MODEL='rank-v1';
export const normalizeDividendBps=n=>Math.max(1000,Math.min(3000,Number.isSafeInteger(n)?n:1000));
export function rankedRevenue(rows){
 const sorted=[...rows].sort((a,b)=>b.revenue-a.revenue||a.id.localeCompare(b.id));let previous,rank=0;
 return sorted.map((r,i)=>{if(!Number.isSafeInteger(r.revenue)||r.revenue<0)throw Error('기업 예상 매출을 확인하세요.');if(r.revenue!==previous)rank=i+1;previous=r.revenue;return {...r,rank,rankBase:Math.max(45,155-rank*5),model:DIVIDEND_MODEL};});
}
export function rankAllocation(revenue,rateBps,book,context){
 if(!context||context.model!==DIVIDEND_MODEL||!Number.isSafeInteger(context.rank)||context.rank<1)throw Error('배당 순위 스냅샷이 필요합니다.');
 const {issuedShares,treasuryShares}=book||{issuedShares:0,treasuryShares:0};
 if(!Number.isSafeInteger(issuedShares)||issuedShares<1||!Number.isSafeInteger(treasuryShares)||treasuryShares<0||treasuryShares>issuedShares)throw Error('발행·미판매 주식 수를 확인하세요.');
 const rate=normalizeDividendBps(rateBps),rankBase=Math.max(45,155-context.rank*5),sold=issuedShares-treasuryShares;
 const perShare=Number(BigInt(rankBase)*BigInt(rate)/100n),companyCharge=Number(BigInt(revenue)*BigInt(rate)/10000n);
 return {issuedShares,treasuryShares,sold,perShare,dividend:perShare*sold,treasuryDividend:0,companyCharge,rank:context.rank,rankBase,model:DIVIDEND_MODEL,rateBps:rate};
}

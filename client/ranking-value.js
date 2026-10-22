// Ranking score only. Cash, quantities and the full stock valuation are intact.
export function rankingValue(cash,stockValue){
 if(!Number.isSafeInteger(cash)||Math.abs(cash)>1e12||!Number.isSafeInteger(stockValue)||stockValue<0)throw Error('순위 계산 금액을 확인하세요.');
 const value=Number(BigInt(cash)+BigInt(stockValue)*4n/5n);
 if(!Number.isSafeInteger(value))throw Error('순위 계산 금액 한도를 초과했습니다.');
 return value;
}

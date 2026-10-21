export function dividendFormula(rank,base,bps){
 return Number.isSafeInteger(rank)&&Number.isSafeInteger(base)?`예상 ${rank}위 · ${base} × ${bps/100}`:'매출 순위 집계 중';
}

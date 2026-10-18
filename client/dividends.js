export function dividendAllocation(revenue,rateBps,book){
 if(!book)return {issuedShares:0,treasuryShares:0,sold:0,perShare:0,dividend:0,treasuryDividend:0};
 const {issuedShares,treasuryShares}=book;
 if(!Number.isSafeInteger(issuedShares)||issuedShares<1||!Number.isSafeInteger(treasuryShares)||treasuryShares<0||treasuryShares>issuedShares)throw Error('발행·미판매 주식 수를 확인하세요.');
 const sold=issuedShares-treasuryShares;
 const perShare=Number(BigInt(revenue)*BigInt(rateBps)/10000n/BigInt(issuedShares));
 // Unsold shares belong to the company. Keep their dividend inside retained
 // revenue rather than debiting it and crediting the same money a second time.
 return {issuedShares,treasuryShares,sold,perShare,dividend:perShare*sold,treasuryDividend:perShare*treasuryShares};
}

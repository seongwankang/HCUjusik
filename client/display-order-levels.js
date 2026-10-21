import {withinPriceLimits} from './daily-price-limits.js';
// Displaying an offering never authorizes a fill; matching uses currentPriceLimits.
export function displayOrderLevels(book,side,visibleLimits){
 const levels=new Map();
 for(const o of book.orders.filter(o=>o.side===side))levels.set(o.price,(levels.get(o.price)||0)+o.remaining);
 if(side==='sell'&&book.treasuryShares>0&&withinPriceLimits(book.initialPrice,visibleLimits))levels.set(book.initialPrice,(levels.get(book.initialPrice)||0)+book.treasuryShares);
 return [...levels].sort((a,b)=>side==='buy'?b[0]-a[0]:a[0]-b[0]).map(([price,quantity])=>({price,quantity}));
}

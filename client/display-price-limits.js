import {currentPriceLimits,priceLimits,priceLimitDay} from './daily-price-limits.js';
import {marketPaused} from './market-session.js';
// Frozen bands are informational only. Never return them as order authority.
export function displayPriceLimits(book,now=Date.now()){
 const current=currentPriceLimits(book,now);if(current)return current;
 const frozen=book?.priceLimits;
 if(!marketPaused(now)||frozen?.day!==-1)return null;
 try{
  const expected=priceLimits(frozen.referencePrice,priceLimitDay(now));
  return frozen.lower===expected.lower&&frozen.upper===expected.upper?{...expected,closed:true}:null;
 }catch{return null;}
}

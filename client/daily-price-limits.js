import {PRICE_TICK,MAX_ORDER_PRICE,validOrderPrice} from './price-tick.js';
export const priceLimitDay=(now=Date.now())=>Math.floor((now+32400000)/86400000);
export function priceLimits(referencePrice,day){
 if(!validOrderPrice(referencePrice)||!Number.isSafeInteger(day))throw Error('기준가를 확인하세요.');
 return {day,referencePrice,lower:Math.max(PRICE_TICK,Math.ceil(referencePrice/2/PRICE_TICK)*PRICE_TICK),upper:Math.min(MAX_ORDER_PRICE,referencePrice*2)};
}
export function currentPriceLimits(book,now=Date.now()){
 const day=priceLimitDay(now),p=book?.priceLimits?.day===day?book.priceLimits:book?.nextPriceLimits;if(!p)return null;
 try{const expected=priceLimits(p.referencePrice,priceLimitDay(now));return ['day','referencePrice','lower','upper'].every(k=>p[k]===expected[k])?p:null;}catch{return null;}
}
export const withinPriceLimits=(price,p)=>validOrderPrice(price)&&!!p&&price>=p.lower&&price<=p.upper;
export function assertDailyPrice(price,book,now=Date.now()){
 const p=currentPriceLimits(book,now);if(!p)throw Error('오늘 가격 제한을 준비 중입니다. 잠시 후 새로고침하세요.');
 if(!withinPriceLimits(price,p))throw Error(`오늘 주문 가능 가격은 ${p.lower.toLocaleString('ko-KR')}원~${p.upper.toLocaleString('ko-KR')}원입니다.`);
 return p;
}

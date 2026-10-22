import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priceLimitDay,priceLimits,currentPriceLimits,assertDailyPrice} from '../client/daily-price-limits.js';
import {limitSession,closingQuote} from '../server/daily-price-limits.js';
const now=Date.parse('2026-10-22T10:00:00+09:00'),day=priceLimitDay(now);
test('initial band is 5,000–20,000, inclusive; hundred-won rounding never exceeds the mathematical band',()=>{
 const b={priceLimits:priceLimits(10000,day)};
 assert.deepEqual(b.priceLimits,{day,referencePrice:10000,lower:5000,upper:20000});
 for(const p of [5000,10000,20000])assert.doesNotThrow(()=>assertDailyPrice(p,b,now));
 for(const p of [4900,20100,5050,NaN])assert.throws(()=>assertDailyPrice(p,b,now));
 assert.equal(priceLimits(10100,day).lower,5100);assert.equal(priceLimits(100,day).lower,100);
 assert.equal(priceLimits(640000,day).upper,1280000);
 assert.equal(currentPriceLimits(b,now+86400000),null);assert.throws(()=>assertDailyPrice(10000,{},now));
 assert.equal(currentPriceLimits({priceLimits:{...b.priceLimits,upper:99999}},now),null);
});
test('21:00 rolls forward; delayed morning preparation still uses yesterday at 21:00',()=>{
 assert.equal(limitSession(Date.parse('2026-10-22T20:59:59+09:00')).day,day);
 assert.deepEqual(limitSession(Date.parse('2026-10-22T21:00:00+09:00')),{day:day+1,cutoff:Date.parse('2026-10-22T21:00:00+09:00')});
 assert.equal(limitSession(now).cutoff,Date.parse('2026-10-21T21:00:00+09:00'));
});
test('close replays the displayed EMA, excludes today even when preparation is late, and carries an untraded close',async()=>{
 const cutoff=Date.parse('2026-10-21T21:00:00+09:00');
 const trades=[{price:16000,quantity:1,marketVersion:1,createdAt:{toMillis:()=>cutoff-1}},{price:20000,quantity:1,marketVersion:2,createdAt:{toMillis:()=>cutoff+36000000}}];
 let since;
 const db={collection:()=>({where:(f,op,v)=>{since=v;return {orderBy:()=>({limit:()=>({get:async()=>{const docs=trades.filter(t=>t.marketVersion>since).map(t=>({data:()=>t}));return {docs,size:docs.length};}})})};}})};
 const book={initialPrice:10000,version:2};
 const first=await closingQuote(db,'a',book,cutoff);assert.equal(first.price,10200);assert.equal(first.version,1);assert.equal(first.count,1);
 trades.splice(1);const carried=await closingQuote(db,'a',book,cutoff+86400000,first);assert.equal(carried.price,10200);assert.equal(carried.count,1);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayPriceLimits} from '../client/display-price-limits.js';
import {priceLimits,priceLimitDay,currentPriceLimits,assertDailyPrice} from '../client/daily-price-limits.js';
const now=Date.parse('2026-10-22T10:00:00+09:00');
test('closed market displays frozen upper/lower prices without making them valid for orders',()=>{
 const book={priceLimits:{day:-1,referencePrice:10000,lower:5000,upper:20000}},before=JSON.stringify(book);
 assert.deepEqual(displayPriceLimits(book,now),{...priceLimits(10000,priceLimitDay(now)),closed:true});
 assert.equal(currentPriceLimits(book,now),null);assert.throws(()=>assertDailyPrice(10000,book,now));assert.equal(JSON.stringify(book),before);
 assert.equal(displayPriceLimits({...book,priceLimits:{...book.priceLimits,upper:99999}},now),null);
 assert.equal(displayPriceLimits({},now),null);
});
test('normal display uses the trusted current-day band, and stale bands cannot masquerade as frozen ones',()=>{
 const book={priceLimits:priceLimits(10100,priceLimitDay(now))};
 assert.deepEqual(displayPriceLimits(book,now),book.priceLimits);
 assert.equal(displayPriceLimits(book,now+86400000),null);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayOrderLevels} from '../client/display-order-levels.js';
import {displayPriceLimits} from '../client/display-price-limits.js';
import {currentPriceLimits,assertDailyPrice} from '../client/daily-price-limits.js';
import {crossing} from '../client/spark-exchange.js';
test('all 1000 initial shares remain visible at 10000 during closure, while placement and matching stay blocked',()=>{
 const book={initialPrice:10000,issuedShares:1000,treasuryShares:1000,priceLimits:{day:-1,referencePrice:10000,lower:5000,upper:20000},orders:[{id:'buyer',uid:'u',side:'buy',price:10000,remaining:5,sequence:1}]},before=JSON.stringify(book),now=Date.parse('2026-10-22T12:00:00+09:00');
 assert.deepEqual(displayOrderLevels(book,'sell',displayPriceLimits(book,now)),[{price:10000,quantity:1000}]);
 assert.equal(currentPriceLimits(book,now),null);assert.throws(()=>assertDailyPrice(10000,book,now));assert.equal(crossing(book),null);
 assert.equal(JSON.stringify(book),before);
});
test('only remaining issuer shares are shown, combined with same-priced secondary sells; no out-of-band offering',()=>{
 const limits={lower:5000,upper:20000},book={initialPrice:10000,treasuryShares:700,orders:[{side:'sell',price:10000,remaining:3},{side:'sell',price:15000,remaining:2}]};
 assert.deepEqual(displayOrderLevels(book,'sell',limits),[{price:10000,quantity:703},{price:15000,quantity:2}]);
 assert.deepEqual(displayOrderLevels({...book,treasuryShares:0,orders:[]},'sell',limits),[]);
 assert.deepEqual(displayOrderLevels({...book,orders:[],initialPrice:100000},'sell',limits),[]);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priceHistory} from '../public/price-history.js';

test('price history is honest when empty or there is only one fill',()=>{
 assert.match(priceHistory([]),/첫 체결/);
 const one=priceHistory([{price:11000}]);
 assert.match(one,/최근 1건/);assert.match(one,/종목 전체/);
 assert.doesNotMatch(one,/NaN|Infinity/);assert.equal((one.match(/<circle /g)||[]).length,1);
});
test('history is bounded and invalid values cannot become SVG markup',()=>{
 const fills=Array.from({length:145},(_,i)=>({price:10000+i}));
 const chart=priceHistory([{price:'<script>alert(1)</script>'},{price:NaN},{price:-1},...fills]);
 assert.equal((chart.match(/<circle /g)||[]).length,100);
 assert.match(chart,/최저 10,000원, 최고 10,099원/);
 assert.doesNotMatch(chart,/<script>|NaN|Infinity/);
});

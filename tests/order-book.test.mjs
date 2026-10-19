import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validOrderPrice,orderPrice} from '../client/price-tick.js';
import {orderBookRows,renderOrderBook} from '../public/order-book.js';
test('new order prices accept only bounded hundred-won ticks',()=>{
 for(const price of [100,10000,1000000])assert.equal(validOrderPrice(price),true);
 for(const price of [0,1,10,99,10010,10050,10001,10005,10.5,1000010,NaN,'10000'])assert.equal(validOrderPrice(price),false);
 assert.equal(orderPrice(10001),10000);assert.equal(orderPrice(1),100);assert.equal(orderPrice(1000001),1000000);
});
test('price ladder aligns both sides by price, sums quantities and keeps legacy levels exact',()=>{
 const rows=orderBookRows({asks:[{price:10100,quantity:3},{price:10100,quantity:5},{price:10001,quantity:2}],bids:[{price:10100,quantity:4},{price:9900,quantity:8}]},10000);
 assert.deepEqual(rows.find(r=>r.price===10100),{price:10100,asks:8,bids:4,tradable:true});
 assert.equal(rows.find(r=>r.price===10001).tradable,false);assert.equal(rows.find(r=>r.price===10000).asks,0);
 assert.deepEqual(rows.map(r=>r.price),rows.map(r=>r.price).sort((a,b)=>b-a));
});
test('quantity buttons choose the counter side and center price preserves the order side',()=>{
 const html=renderOrderBook({asks:[{price:10000,quantity:50}],bids:[{price:9900,quantity:30}]},10000,9900);
 assert.match(html,/data-limit-price="10000" data-limit-side="buy"/);assert.match(html,/data-limit-price="9900" data-limit-side="sell"/);
 assert.match(html,/data-price="9900" data-selected="true"/);assert.match(html,/판매 대기 수량/);assert.match(html,/구매 대기 수량/);
 const legacy=renderOrderBook({asks:[{price:10001,quantity:5}],bids:[]},10001,10000);assert.match(legacy,/이전 주문 단위/);assert.match(legacy,/aria-label="주문 가격 10,001원 선택"/);
});

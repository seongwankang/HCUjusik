import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingBuyRows} from '../client/pending-orders.js';
import {pendingBuyMarkup} from '../public/pending-orders.js';
import {tradingPortfolio} from '../client/portfolio.js';
test('pending buys group only remaining open quantities by symbol and price, without counting sales/closed orders',()=>{
 const order=(extra={})=>({companyId:'one',side:'buy',status:'open',price:10000,quantity:10,remaining:3,...extra});
 const rows=pendingBuyRows([order(),order({remaining:2}),order({price:9900,remaining:1}),order({side:'sell'}),order({status:'filled'}),order({status:'cancelled'}),order({remaining:0})],{one:{name:'기업',ticker:'ONE'}});
 assert.deepEqual(rows.map(r=>[r.price,r.quantity,r.reservedAmount]),[[10000,5,50000],[9900,1,9900]]);
 const p=tradingPortfolio({cash:100000,reservedCash:59900,positions:{},reservedPositions:{},version:0},{},{});assert.equal(p.stockValue,0);assert.equal(p.totalValue,100000);assert.equal(p.availableCash,40100);
 assert.match(pendingBuyMarkup(rows),/매수 대기/);assert.match(pendingBuyMarkup(rows),/50,000원/);assert.equal(pendingBuyMarkup([]),'');
});
test('pending-only symbols render safely and invalid money/quantities fail',()=>{
 const row={companyId:'new',side:'buy',status:'open',price:100,remaining:1};
 const rows=pendingBuyRows([row],{new:{name:'<기업>',ticker:'NEW'}});assert.match(pendingBuyMarkup(rows),/&lt;기업&gt;/);assert.doesNotMatch(pendingBuyMarkup(rows),/<기업>/);
 assert.throws(()=>pendingBuyRows([{...row,remaining:1.5}],{}),/주문/);
});

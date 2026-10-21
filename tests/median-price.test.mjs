import {test} from 'node:test';import assert from 'node:assert/strict';
import {medianTradePrice,createMedianReader} from '../client/median-price.js';
import {companyQuote} from '../client/quotes.js';import {priceRankings} from '../client/rankings.js';
test('median uses at most the latest 100 fills, ignores quantities and rounds midpoint to a 100-won tick',()=>{
 assert.equal(medianTradePrice([]),null);assert.equal(medianTradePrice([{price:10000}]),10000);
 assert.equal(medianTradePrice([{price:10000,quantity:1000},{price:10100,quantity:1}]),10100);
 assert.equal(medianTradePrice([{price:10000},{price:10000},{price:999900}]),10000);
 assert.equal(medianTradePrice([...Array.from({length:100},()=>({price:12000})),{price:900000}]),12000);
 assert.throws(()=>medianTradePrice([{price:NaN}]));
});
test('persistent bounded window appends only new fills, skips exact single order changes, and detects fills hidden by later orders',async()=>{
 let calls=[],fresh=[{price:10000,marketVersion:1},{price:20000,marketVersion:2},{price:10000,marketVersion:3}];const saved=new Map(),storage={get:async k=>saved.get(k),set:async(k,v)=>saved.set(k,v)};
 const fetch=async(id,since)=>{calls.push(since);return fresh.filter(x=>since===undefined||x.marketVersion>since);};
 let read=createMedianReader(fetch,storage);assert.equal(await read('one',{version:3}),10000);assert.equal(await read('one',{version:3}),10000);assert.equal(calls.length,1);
 await read('one',{version:4,lastAction:{kind:'place'}});assert.equal(calls.length,1);
 fresh=[{price:20000,marketVersion:5}];assert.equal(await read('one',{version:6,lastAction:{kind:'cancel'}}),15000);assert.deepEqual(calls,[undefined,4]);
 read=createMedianReader(fetch,storage);assert.equal(await read('one',{version:6}),15000);assert.equal(calls.length,2);
 fresh=Array.from({length:110},(_,i)=>({price:30000,marketVersion:7+i})).reverse().slice(0,100);assert.equal(await read('one',{version:116}),30000);assert.equal(saved.get('one').rows.length,100);
 fresh=[];assert.equal(await read('one',{version:0}),null);
});
test('listing and company price rankings use the same median without overwriting the last execution',()=>{
 const c={id:'one',name:'One',ticker:'ONE',status:'listed',referencePrice:10000},book={id:'one',lastPrice:90000,displayPrice:12000,displayInitial:false};
 assert.equal(companyQuote(c,book).currentPrice,12000);assert.equal(priceRankings([c],[book])[0].price,12000);assert.equal(book.lastPrice,90000);
 assert.equal(companyQuote(c,{displayPrice:10000,displayInitial:true}).quoteKind,'initial');
});

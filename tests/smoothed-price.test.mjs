import {test} from 'node:test';import assert from 'node:assert/strict';
import {nextSmoothedPrice,createSmoothedReader} from '../client/smoothed-price.js';
test('each fill mixes 90% prior price and 10% execution; rounding never feeds the accumulator',async()=>{
 assert.equal(nextSmoothedPrice(10000,16000),10600);assert.equal(nextSmoothedPrice(10600,16000),11140);
 const rows=Array.from({length:20},(_,i)=>({marketVersion:i+1,price:16000,quantity:i===0?1000:1}));
 const read=createSmoothedReader(async(id,since,to)=>rows.filter(r=>r.marketVersion>since&&r.marketVersion<=to));
 for(const count of [1,5,10,20]){const r=await read('one',{version:count},10000);assert.equal(r.price,Math.round((16000-6000*.9**count)/100)*100);}
 assert.throws(()=>nextSmoothedPrice(10000,NaN));
});
test('more than 100 fills replay chronologically; fresh browser and incremental cached readers agree',async()=>{
 const rows=Array.from({length:250},(_,i)=>({marketVersion:i*2+1,price:10000+i*100})),saved=new Map(),calls=[];
 const fetch=async(id,since,to)=>{calls.push([since,to]);return rows.filter(r=>r.marketVersion>since&&r.marketVersion<=to).slice(0,100);};
 const storage={get:async k=>saved.get(k),set:async(k,v)=>saved.set(k,v)};
 let read=createSmoothedReader(fetch,storage);await read('one',{version:199},10000);const result=await read('one',{version:499},10000);
 assert.equal(saved.get('one').count,250);assert.equal(saved.get('one').value,rows.reduce((p,r)=>nextSmoothedPrice(p,r.price),10000));
 const count=calls.length;read=createSmoothedReader(fetch,storage);assert.deepEqual(await read('one',{version:499},10000),result);assert.equal(calls.length,count);
 assert.deepEqual(await createSmoothedReader(fetch)('one',{version:499},10000),result);
});
test('order-only updates do not change price; version gaps find hidden fills; reset and empty history are safe',async()=>{
 let calls=0,rows=[];const read=createSmoothedReader(async(id,since,to)=>{calls++;return rows.filter(r=>r.marketVersion>since&&r.marketVersion<=to);});
 assert.deepEqual(await read('one',{version:0},10000),{price:10000,initial:true});const before=calls;
 await read('one',{version:1,lastAction:{kind:'place'}},10000);assert.equal(calls,before);
 rows=[{marketVersion:2,price:16000},{marketVersion:4,price:18000}];assert.deepEqual(await read('one',{version:3,lastAction:{kind:'cancel'}},10000),{price:10600,initial:false});
 assert.deepEqual(await read('one',{version:4},10000),{price:11300,initial:false});rows=[];
 assert.deepEqual(await read('one',{version:0},10000),{price:10000,initial:true});
});
test('an audited correction discards a cached accidental price and replays valid history',async()=>{
 let rows=[{marketVersion:1,price:1000000}];const read=createSmoothedReader(async(id,since,to)=>rows.filter(r=>r.marketVersion>since&&r.marketVersion<=to));
 assert.equal((await read('one',{version:1},10000)).price,109000);rows=[];
 assert.deepEqual(await read('one',{version:2,correctionRevision:1},10000),{price:10000,initial:true});
});

test('manual quote anchor overrides cached history, then subsequent fills resume smoothing',async()=>{
 const rows=[{marketVersion:1,price:10000},{marketVersion:4,price:40000}];const saved=new Map(),storage={get:async k=>saved.get(k),set:async(k,v)=>saved.set(k,v)};const fetch=async(id,since,to)=>rows.filter(r=>r.marketVersion>since&&r.marketVersion<=to);
 const read=createSmoothedReader(fetch,storage);await read('one',{version:2},10000);
 const displayPriceAnchor={price:30000,version:3};assert.deepEqual(await read('one',{version:3,displayPriceAnchor},10000),{price:30000,initial:false});
 assert.equal((await read('one',{version:4,displayPriceAnchor},10000)).price,31000);assert.equal((await createSmoothedReader(fetch,storage)('one',{version:4,displayPriceAnchor},10000)).price,31000);
});

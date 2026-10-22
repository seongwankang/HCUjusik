import {test} from 'node:test';import assert from 'node:assert/strict';
import {nextSmoothedPrice,createSmoothedReader} from '../client/smoothed-price.js';
test('each fill mixes 97% prior price and 3% execution per share; rounding never feeds the accumulator',async()=>{
 assert.equal(nextSmoothedPrice(10000,16000),10180);assert.equal(nextSmoothedPrice(10180,16000),10354.6);
 const rows=Array.from({length:20},(_,i)=>({marketVersion:i+1,price:16000,quantity:1}));
 const read=createSmoothedReader(async(id,since,to)=>rows.filter(r=>r.marketVersion>since&&r.marketVersion<=to));
 for(const count of [1,5,10,20]){const r=await read('one',{version:count},10000);assert.equal(r.price,Math.round((16000-6000*.97**count)/100)*100);}
 assert.throws(()=>nextSmoothedPrice(10000,NaN));
});
test('more than 100 fills replay chronologically; fresh browser and incremental cached readers agree',async()=>{
 const rows=Array.from({length:250},(_,i)=>({marketVersion:i*2+1,price:10000+i*100,quantity:1})),saved=new Map(),calls=[];
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
 rows=[{marketVersion:2,price:16000,quantity:1},{marketVersion:4,price:18000,quantity:1}];assert.deepEqual(await read('one',{version:3,lastAction:{kind:'cancel'}},10000),{price:10200,initial:false});
 assert.deepEqual(await read('one',{version:4},10000),{price:10400,initial:false});rows=[];
 assert.deepEqual(await read('one',{version:0},10000),{price:10000,initial:true});
});
test('an audited correction discards a cached accidental price and replays valid history',async()=>{
 let rows=[{marketVersion:1,price:1000000,quantity:1}];const read=createSmoothedReader(async(id,since,to)=>rows.filter(r=>r.marketVersion>since&&r.marketVersion<=to));
 assert.equal((await read('one',{version:1},10000)).price,39700);rows=[];
 assert.deepEqual(await read('one',{version:2,correctionRevision:1},10000),{price:10000,initial:true});
});

test('manual quote anchor overrides cached history, then subsequent fills resume smoothing',async()=>{
 const rows=[{marketVersion:1,price:10000,quantity:1},{marketVersion:4,price:40000,quantity:1}];const saved=new Map(),storage={get:async k=>saved.get(k),set:async(k,v)=>saved.set(k,v)};const fetch=async(id,since,to)=>rows.filter(r=>r.marketVersion>since&&r.marketVersion<=to);
 const read=createSmoothedReader(fetch,storage);await read('one',{version:2},10000);
 const displayPriceAnchor={price:30000,version:3};assert.deepEqual(await read('one',{version:3,displayPriceAnchor},10000),{price:30000,initial:false});
 assert.equal((await read('one',{version:4,displayPriceAnchor},10000)).price,30300);assert.equal((await createSmoothedReader(fetch,storage)('one',{version:4,displayPriceAnchor},10000)).price,30300);
});

test('bulk shares equal the same number of single-share updates',async()=>{for(const quantity of [1,2,10,100,1000]){let split=10000;for(let i=0;i<quantity;i++)split=nextSmoothedPrice(split,16000);assert.equal(nextSmoothedPrice(10000,16000,quantity),split);const saved=new Map();const read=createSmoothedReader(async()=>[{marketVersion:1,price:16000,quantity}],{get:async k=>saved.get(k),set:async(k,v)=>saved.set(k,v)});assert.equal((await read('a',{version:1},10000)).price,Math.round(split/100)*100);assert.equal(saved.get('a').count,quantity);}for(const q of [0,-1,1.5,NaN,1000001])assert.throws(()=>nextSmoothedPrice(10000,16000,q));});

test('a cached 92:8 value is replayed under the 97:3 model even at the same book version',async()=>{
 const saved=new Map([['a',{model:'ema92-share-v2',referencePrice:10000,anchorKey:'',value:10480,count:1,version:1,correctionRevision:0}]]);let calls=0;
 const read=createSmoothedReader(async()=>{calls++;return [{marketVersion:1,price:16000,quantity:1}];},{get:async k=>saved.get(k),set:async(k,v)=>saved.set(k,v)});
 assert.deepEqual(await read('a',{version:1},10000),{price:10200,initial:false});assert.equal(calls,1);assert.equal(saved.get('a').value,10180);assert.equal(saved.get('a').model,'ema97-share-v3');
});

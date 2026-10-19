import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLiveReader} from '../client/live-reader.js';
function fixture(maxEntries){const feeds=new Map(),changes=[];let starts=0,stops=0;
 const reader=createLiveReader({maxEntries,onChange:key=>changes.push(key),subscribe:(key,next,error)=>{starts++;feeds.set(key,{next,error});return ()=>stops++;}});
 return {reader,feeds,changes,starts:()=>starts,stops:()=>stops};
}
test('simultaneous screens and repeated navigation share one read; only changed records notify',async()=>{
 const f=fixture(),a=f.reader.read('company','company'),b=f.reader.read('company','company');assert.equal(f.starts(),1);
 f.feeds.get('company').next({name:'A'});assert.deepEqual(await a,await b);assert.deepEqual(f.changes,[]);
 for(let n=0;n<20;n++)assert.equal((await f.reader.read('company','company')).name,'A');assert.equal(f.starts(),1);
 f.feeds.get('company').next({name:'A'});assert.deepEqual(f.changes,[]);f.feeds.get('company').next({name:'B'});assert.deepEqual(f.changes,['company']);assert.equal((await f.reader.read('company','company')).name,'B');
});
test('quotes and other views use the same source and share updates',async()=>{
 const f=fixture(),prices=[],off=f.reader.watch('book','book',v=>prices.push(v.price));const pending=f.reader.read('book','book');
 f.feeds.get('book').next({price:10000});await pending;f.feeds.get('book').next({price:10010});assert.deepEqual(prices,[10000,10010]);assert.equal(f.starts(),1);off();
});
test('permission failure discards prior value, and account changes ignore late callbacks',async()=>{
 const f=fixture(),p=f.reader.read('account','account');f.feeds.get('account').next({cash:10});await p;
 f.feeds.get('account').error(Error('permission-denied'));await assert.rejects(f.reader.read('account','account'),/permission/);
 const old=f.feeds.get('account');f.reader.clear();old.next({cash:999});const newer=f.reader.read('account','account');f.feeds.get('account').next({cash:20});assert.equal((await newer).cash,20);assert.equal(f.stops(),1);
});
test('explicit refresh targets affected sources; clearing while refresh waits cannot restore old data',async()=>{
 const f=fixture();for(const key of ['static','account']){const p=f.reader.read(key,key);f.feeds.get(key).next({value:1});await p;}
 let fetches=0;await f.reader.refresh(k=>k==='account',async()=>{fetches++;return {value:2};});assert.equal(fetches,1);assert.equal((await f.reader.read('static','static')).value,1);assert.equal((await f.reader.read('account','account')).value,2);
 let finish;const pending=f.reader.refresh(k=>k==='account',()=>new Promise(r=>finish=r));f.reader.clear();finish({value:99});await pending;
 const current=f.reader.read('account','account');f.feeds.get('account').next({value:3});assert.equal((await current).value,3);
});
test('inactive sources are bounded, while active quote watchers are retained',async()=>{
 const f=fixture(2);f.reader.watch('quote','quote',()=>{});f.feeds.get('quote').next(1);
 for(const key of ['a','b']){const p=f.reader.read(key,key);f.feeds.get(key).next(1);await p;}
 assert.equal(f.stops(),1);await f.reader.read('quote','quote');assert.equal(f.starts(),3);f.reader.clear();
});

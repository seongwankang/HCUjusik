import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createImmutableReader,compareValue} from '../client/immutable-reader.js';
test('correction epoch reloads history instead of retaining a reversed execution',async()=>{
 let rows=[{id:'bad',time:10}],queries=0;const read=createImmutableReader(async()=>{queries++;return {rows,more:false};});
 assert.equal((await read('fills',{field:'time',revision:1})).length,1);rows=[];
 assert.equal((await read('fills',{field:'time',revision:2,epoch:1})).length,0);assert.equal(queries,2);
});
function fixture(){
 let rows=[],fail=false;const calls=[];
 const read=createImmutableReader(async(path,o)=>{
  calls.push({path,...o});if(fail&&o.cursor)throw Error('network');
  const sorted=rows.filter(r=>r.path===path&&(o.since===undefined||compareValue(r.time,o.since)>=0)).sort((a,b)=>compareValue(b.time,a.time)||b.id.localeCompare(a.id));
  const start=o.cursor?sorted.findIndex(r=>r.id===o.cursor)+1:0,page=sorted.slice(start,start+o.pageSize);
  return {rows:page,more:page.length===o.pageSize,cursor:page.at(-1)?.id};
 });
 return {read,calls,add:(id,time,path='public')=>rows.push({id,time,path}),fail:v=>fail=v};
}
test('unchanged revision uses no query; changed revision reads only at/after the old watermark',async()=>{
 const f=fixture();for(let n=0;n<65;n++)f.add(String(n),n);
 const a=await f.read('public',{field:'time',revision:1});assert.equal(a.length,65);assert.equal(f.calls.length,3);
 await f.read('public',{field:'time',revision:1});assert.equal(f.calls.length,3);
 f.add('new',100);const b=await f.read('public',{field:'time',revision:2});assert.equal(b.length,66);assert.equal(f.calls.length,4);assert.equal(f.calls.at(-1).since,64);
});
test('same timestamp, nanosecond precision, pagination and duplicate overlap retain every immutable row',async()=>{
 const f=fixture();const t={seconds:100,nanoseconds:10};f.add('one',t);await f.read('public',{field:'time'});
 for(let n=0;n<35;n++)f.add('same'+n,t);f.add('later',{seconds:100,nanoseconds:11});
 const rows=await f.read('public',{field:'time'});assert.equal(rows.length,37);assert.equal(new Set(rows.map(r=>r.id)).size,37);assert.equal(rows[0].id,'later');assert.deepEqual(f.calls.at(-1).since,t);
});
test('failed later page never advances the watermark or commits partial data',async()=>{
 const f=fixture();f.add('old',1);await f.read('public',{field:'time',revision:1});for(let n=0;n<35;n++)f.add('new'+n,n+2);
 f.fail(true);await assert.rejects(f.read('public',{field:'time',revision:2}),/network/);f.fail(false);
 const before=f.calls.length,rows=await f.read('public',{field:'time',revision:2});assert.equal(rows.length,36);assert.equal(f.calls[before].since,1);
});
test('bounded archives keep the latest window, isolate account paths, and clear on session reset',async()=>{
 const f=fixture();for(let n=0;n<200;n++)f.add(String(n),n);
 let rows=await f.read('public',{field:'time',pageSize:100,maxRecords:100,revision:1});assert.equal(rows.length,100);assert.equal(f.calls.length,1);assert.equal(rows.at(-1).time,100);
 f.add('new',300);rows=await f.read('public',{field:'time',pageSize:100,maxRecords:100,revision:2});assert.equal(rows.length,100);assert.equal(rows[0].id,'new');assert.equal(rows.at(-1).time,101);
 f.add('private',1,'user-a');assert.equal((await f.read('user-b',{field:'time'})).length,0);f.read.clear();await f.read('public',{field:'time',pageSize:100,maxRecords:100,revision:2});assert.equal(f.calls.at(-1).since,undefined);
});
test('simultaneous readers share a request, but a newer revision gets a follow-up refresh',async()=>{
 let release,calls=0;const read=createImmutableReader(async()=>{calls++;if(calls===1)await new Promise(r=>release=r);return {rows:[{id:String(calls),time:calls}],more:false};});
 const a=read('x',{field:'time',revision:1}),b=read('x',{field:'time',revision:1}),c=read('x',{field:'time',revision:2});release();const rows=await Promise.all([a,b,c]);assert.equal(calls,2);assert.equal(rows[2].length,2);
});

test('a new reader restores saved immutable rows without historical queries, then appends new rows',async()=>{
 const saved=new Map(),storage={get:async key=>saved.get(key),set:async(key,value)=>saved.set(key,structuredClone(value))};let calls=0,rows=[{id:'old',time:1}];
 const fetch=async(path,o)=>{calls++;return {rows:rows.filter(r=>o.since===undefined||r.time>=o.since),more:false};};
 let read=createImmutableReader(fetch,storage);await read('x',{field:'time',revision:1});assert.equal(calls,1);
 read=createImmutableReader(fetch,storage);assert.equal((await read('x',{field:'time',revision:1})).length,1);assert.equal(calls,1);
 rows.push({id:'new',time:2});assert.equal((await read('x',{field:'time',revision:2})).length,2);assert.equal(calls,2);
});
test('unavailable browser storage falls back to current server data',async()=>{
 const read=createImmutableReader(async()=>({rows:[{id:'current',time:2}],more:false}),{get:async()=>{throw Error('private mode');},set:async()=>{throw Error('quota');}});
 assert.equal((await read('x',{field:'time',revision:1}))[0].id,'current');
});

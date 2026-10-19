import {test} from 'node:test';import assert from 'node:assert/strict';import {emptyIndexes,insertIndexes,removeIndexes,priorityEntry} from '../client/order-index.js';
const entry=(i,side='buy',uid='a')=>({id:'order-'+i,uid,side,price:10000+(i%13)*10,quantity:2,remaining:2,sequence:i});
test('hundreds of orders retain independent price/time, owner and IPO indexes without a count cap',()=>{
 let book={...emptyIndexes(),initialPrice:10050};const orders=[];
 for(let i=1;i<=300;i++){const e=entry(i,i%3?'buy':'sell',i%2?'a':'b');orders.push(e);const {patch,proof}=insertIndexes(book,e);assert.deepEqual(proof.prefix.concat(proof.suffix),book[e.side==='buy'?'bidIndex':'askIndex']);book={...book,...patch};}
 for(const [side,key] of [['buy','bidIndex'],['sell','askIndex']])assert.deepEqual(book[key],orders.filter(e=>e.side===side).sort((a,b)=>(side==='buy'?b.price-a.price:a.price-b.price)||a.sequence-b.sequence).map(priorityEntry));
 assert.deepEqual(book.initialIndex,orders.filter(e=>e.side==='buy'&&e.price>=10050).map(priorityEntry));
 for(const e of orders.toReversed())book={...book,...removeIndexes(book,[e])};assert.deepEqual(book.bidIndex,[]);assert.deepEqual(book.askIndex,[]);assert.deepEqual(book.initialIndex,[]);assert.deepEqual(book.ownerBids,{});assert.deepEqual(book.ownerAsks,{});
});
test('priority entries omit mutable remaining quantities so partial fills keep their place',()=>{const e=entry(1);assert.deepEqual(priorityEntry(e),priorityEntry({...e,remaining:1}));});

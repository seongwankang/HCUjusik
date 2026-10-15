import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newExchange,submit,cancel,view,pruneInactive,validateOrder} from '../server/exchange.js';
const company={status:'listed',referencePrice:100,issuedShares:10};
let n=0;
const body=(side,price,quantity,extra={})=>({orderId:'order-'+String(++n).padStart(8,'0'),companyId:'test-a',side,price,quantity,...extra});
const place=(s,uid,side,price,q)=>submit(s,uid,body(side,price,q),company,'2026-10-15T00:00:00.000Z');
function conservation(s){
 const accounts=Object.values(s.accounts),m=s.markets['test-a'];if(!m)return;
 assert.equal(accounts.reduce((n,a)=>n+(a.positions['test-a']||0),0)+m.treasuryShares,10);
 assert.equal(accounts.reduce((n,a)=>n+a.cash,0)+m.issuerCash,accounts.length*1000000);
 for(const a of accounts){assert.ok(a.cash>=a.reservedCash&&a.reservedCash>=0);assert.ok((a.positions['test-a']||0)>=(a.reservedPositions['test-a']||0));}
 for(const [uid,a]of Object.entries(s.accounts)){
  const orders=Object.values(s.orders).filter(o=>o.uid===uid&&o.status==='open');
  assert.equal(a.reservedCash,orders.filter(o=>o.side==='buy').reduce((n,o)=>n+o.remaining*o.price,0));
  assert.equal(a.reservedPositions['test-a']||0,orders.filter(o=>o.side==='sell').reduce((n,o)=>n+o.remaining,0));
 }
}
test('initial supply first accepted buyer, partial fill, limit refund and no synthetic seller',()=>{
 const s=newExchange();let r=place(s,'a','buy',120,7);assert.equal(r.order.filled,7);assert.equal(s.accounts.a.cash,999300);assert.equal(s.accounts.a.reservedCash,0);
 r=place(s,'b','buy',100,5);assert.equal(r.order.filled,3);assert.equal(r.order.remaining,2);assert.equal(s.accounts.b.reservedCash,200);assert.equal(s.markets['test-a'].treasuryShares,0);
 assert.equal(s.fills[0].price,100);assert.equal(s.fills[1].buyer,'b');conservation(s);
});
test('best price then server sequence wins, fills at resting order price',()=>{
 const s=newExchange();place(s,'seller','buy',100,10);
 const early=place(s,'early','buy',90,2).order,later=place(s,'later','buy',95,2).order,tie=place(s,'tie','buy',95,2).order;
 place(s,'seller','sell',85,5);
 assert.equal(later.filled,2);assert.equal(tie.filled,2);assert.equal(early.filled,1);
 assert.deepEqual(s.fills.slice(1).map(f=>[f.buyer,f.price,f.quantity]),[['later',95,2],['tie',95,2],['early',90,1]]);conservation(s);
});
test('lower ask first, partial cancellations refund only unfilled reserves',()=>{
 const s=newExchange();place(s,'a','buy',100,5);place(s,'b','buy',100,5);
 place(s,'a','sell',130,5);const b=place(s,'b','sell',120,5).order;
 place(s,'c','buy',125,2);assert.equal(b.remaining,3);assert.equal(s.accounts.b.reservedPositions['test-a'],3);
 cancel(s,'b',b.orderId);assert.equal(s.accounts.b.reservedPositions['test-a'],0);assert.equal(b.filled,2);assert.equal(b.cancelled,3);
 cancel(s,'b',b.orderId);assert.equal(s.accounts.b.positions['test-a'],3);
 const buy=place(s,'c','buy',110,2).order;assert.equal(s.accounts.c.reservedCash,220);cancel(s,'c',buy.orderId);assert.equal(s.accounts.c.reservedCash,0);conservation(s);
});
test('idempotent replay, altered IDs, oversell and insufficient cash reject',()=>{
 const s=newExchange(),b=body('buy',100,3);submit(s,'a',b,company,'now');
 assert.equal(submit(s,'a',b,company,'later').duplicate,true);assert.equal(s.accounts.a.positions['test-a'],3);
 assert.throws(()=>submit(s,'a',{...b,quantity:4},company,'now'),/번호/);
 assert.throws(()=>place(s,'a','sell',100,4),/보유/);assert.throws(()=>place(s,'b','buy',1000000,2),/현금/);
 assert.throws(()=>cancel(s,'b',b.orderId),/본인/);conservation(s);
});
test('no self matches; paused symbols reject new orders while cancellation works',()=>{
 const s=newExchange();place(s,'a','buy',100,10);const sell=place(s,'a','sell',110,3).order;
 const buy=place(s,'a','buy',120,3).order;assert.equal(buy.remaining,3);assert.equal(sell.remaining,3);
 assert.throws(()=>submit(s,'a',body('buy',120,1),{...company,status:'paused'},'now'),/거래/);
 cancel(s,'a',sell.orderId);cancel(s,'a',buy.orderId);conservation(s);
});
test('inactive makers are cancelled, public depth and fills never expose other identities',()=>{
 const s=newExchange();place(s,'a','buy',100,10);const maker=place(s,'a','sell',110,2).order;
 pruneInactive(s,new Set(['b']));assert.equal(maker.status,'cancelled');assert.equal(s.accounts.a.reservedPositions['test-a'],0);
 const data=view(s,'b','test-a');assert.equal(JSON.stringify(data).includes('"uid"'),false);assert.equal(data.orders.length,0);assert.equal(data.fills.length,0);conservation(s);
});
test('invalid integer, schema, symbol, side and extreme values reject',()=>{
 const valid=body('buy',100,1);
 for(const extra of [{price:0},{price:1.5},{price:1000001},{quantity:-1},{quantity:NaN},{quantity:Infinity},{side:'market'},{companyId:'../x'},{uid:'victim'},{orderId:'bad/id'},{orderId:12345678},{price:1000000,quantity:1000000}])assert.throws(()=>validateOrder({...valid,...extra}));
});
test('deterministic mixed activity preserves all cash, issued shares and reservations',()=>{
 const s=newExchange();place(s,'a','buy',100,10);let seed=17;
 const rand=m=>{seed=(seed*1664525+1013904223)>>>0;return seed%m;};
 for(let i=0;i<250;i++){
  const uid=['a','b','c'][rand(3)],side=rand(2)?'buy':'sell';
  const candidate=structuredClone(s);
  try{if(rand(4)===0){const live=Object.values(candidate.orders).filter(o=>o.uid===uid&&o.status==='open');if(live.length)cancel(candidate,uid,live[rand(live.length)].orderId);}else place(candidate,uid,side,80+rand(50),1+rand(3));Object.assign(s,candidate);}catch{}
  conservation(s);
 }
});

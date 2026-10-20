// Pure matching engine. The adapter commits the entire bounded exchange state
// in one Firestore transaction, so order sequence is commit order, never client time.
export class ExchangeError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const fail=(s,status)=>{throw new ExchangeError(s,status);};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
import {INITIAL_CASH} from '../client/initial-capital.js';
export {INITIAL_CASH};
export function newExchange(){return {schema:1,sequence:0,accounts:{},markets:{},orders:{},fills:[]};}
export function validateOrder(b){
 if(!b||Object.keys(b).some(k=>!['orderId','companyId','side','quantity','price'].includes(k))||
  typeof b.orderId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(b.orderId)||!['test-a','test-b'].includes(b.companyId)||
  !['buy','sell'].includes(b.side)||!integer(b.price,1,1000000)||!integer(b.quantity,1,1000000)||b.price*b.quantity>1000000000)fail('주문 가격(1~100만 원)과 수량을 정수로 입력하세요.');
 return b;
}
function account(s,uid){
 if(!s.accounts[uid]){if(Object.keys(s.accounts).length>=250)fail('테스트 참가 계좌 한도에 도달했습니다.',409);s.accounts[uid]={cash:INITIAL_CASH,reservedCash:0,positions:{},reservedPositions:{}};}
 return s.accounts[uid];
}
const open=o=>o.remaining>0&&o.status==='open';
function release(s,o){
 const a=s.accounts[o.uid];if(o.side==='buy')a.reservedCash-=o.price*o.remaining;
 else a.reservedPositions[o.companyId]-=o.remaining;
 o.status='cancelled';o.cancelled=o.remaining;o.remaining=0;
}
export function pruneInactive(s,active){for(const o of Object.values(s.orders))if(open(o)&&!active.has(o.uid))release(s,o);}
export function submit(s,uid,body,company,now){
 const b=validateOrder(body),key=uid+':'+b.orderId,existing=s.orders[key];
 if(existing){if(['companyId','side','quantity','price'].some(k=>existing[k]!==b[k]))fail('이미 사용한 주문 번호의 내용이 다릅니다.',409);return {order:existing,duplicate:true};}
 if(!company||company.status!=='listed')fail('현재 거래 가능한 기업이 아닙니다.',409);
 if(Object.keys(s.orders).length>=500||s.fills.length>=1000||Object.values(s.orders).filter(open).length>=100)fail('테스트 주문장 한도에 도달했습니다. 기존 주문 취소는 가능합니다.',409);
 const a=account(s,uid),held=a.positions[b.companyId]||0,reserved=a.reservedPositions[b.companyId]||0;
 if(b.side==='buy'&&a.cash-a.reservedCash<b.price*b.quantity)fail('주문 가능 현금이 부족합니다.',409);
 if(b.side==='sell'&&held-reserved<b.quantity)fail('주문 가능한 보유 주식이 부족합니다.',409);
 if(!s.markets[b.companyId]){
  if(!integer(company.referencePrice,1,1000000)||!integer(company.issuedShares,1,1000000))fail('기업의 초기 가격·발행량 설정을 확인하세요.',409);
  s.markets[b.companyId]={initialPrice:company.referencePrice,issuedShares:company.issuedShares,treasuryShares:company.issuedShares,issuerCash:0,lastPrice:null};
 }
 const market=s.markets[b.companyId];
 const o={...b,uid,sequence:++s.sequence,createdAt:now,remaining:b.quantity,filled:0,cancelled:0,status:'open'};s.orders[key]=o;
 if(b.side==='buy')a.reservedCash+=b.price*b.quantity;
 else a.reservedPositions[b.companyId]=reserved+b.quantity;
 // The issuer ask has sequence 0. At its fixed initial price, every qualifying
 // buy is processed in server acceptance order; no synthetic shares are minted.
 const candidates=Object.values(s.orders).filter(x=>x!==o&&open(x)&&x.companyId===b.companyId&&x.side!==b.side&&x.uid!==uid);
 if(b.side==='buy'&&market.treasuryShares>0)candidates.push({issuer:true,side:'sell',price:market.initialPrice,remaining:market.treasuryShares,sequence:0});
 candidates.sort((x,y)=>(b.side==='buy'?x.price-y.price:y.price-x.price)||x.sequence-y.sequence);
 for(const maker of candidates){
  if(!o.remaining||(b.side==='buy'?maker.price>b.price:maker.price<b.price))break;
  const quantity=Math.min(o.remaining,maker.remaining),price=maker.price,total=price*quantity;
  const buyer=b.side==='buy'?o:maker,seller=b.side==='sell'?o:maker;
  const buyerAccount=s.accounts[buyer.uid];
  buyerAccount.cash-=total;buyerAccount.reservedCash-=buyer.price*quantity;
  buyerAccount.positions[b.companyId]=(buyerAccount.positions[b.companyId]||0)+quantity;
  if(seller.issuer){market.treasuryShares-=quantity;market.issuerCash+=total;}
  else {const sellerAccount=s.accounts[seller.uid];sellerAccount.cash+=total;sellerAccount.positions[b.companyId]-=quantity;sellerAccount.reservedPositions[b.companyId]-=quantity;}
  o.remaining-=quantity;o.filled+=quantity;
  if(!maker.issuer){maker.remaining-=quantity;maker.filled+=quantity;if(!maker.remaining)maker.status='filled';}
  market.lastPrice=price;
  s.fills.push({sequence:++s.sequence,companyId:b.companyId,price,quantity,buyer:buyer.uid,seller:seller.issuer?'issuer':seller.uid,buyOrderId:buyer.orderId,sellOrderId:seller.issuer?'issuer':seller.orderId,createdAt:now});
  if(s.fills.length>1000)fail('테스트 체결 기록 한도에 도달했습니다.',409);
 }
 if(!o.remaining)o.status='filled';
 return {order:o,duplicate:false};
}
export function cancel(s,uid,id){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(id))fail('주문 번호를 확인하세요.');
 const o=s.orders[uid+':'+id];if(!o)fail('본인 주문을 찾을 수 없습니다.',404);
 if(open(o))release(s,o);
 return {order:o};
}
export function view(s,uid,companyId){
 const a=s.accounts[uid]||{cash:INITIAL_CASH,reservedCash:0,positions:{},reservedPositions:{}};
 const levels=side=>{
  const totals=new Map();for(const o of Object.values(s.orders))if(open(o)&&o.side===side&&o.companyId===companyId)totals.set(o.price,(totals.get(o.price)||0)+o.remaining);
  const m=s.markets[companyId];if(side==='sell'&&m?.treasuryShares)totals.set(m.initialPrice,(totals.get(m.initialPrice)||0)+m.treasuryShares);
  return [...totals].sort((x,y)=>side==='buy'?y[0]-x[0]:x[0]-y[0]).slice(0,10).map(([price,quantity])=>({price,quantity}));
 };
 const own=Object.values(s.orders).filter(o=>o.uid===uid);
 const clean=o=>{const {uid:ignored,...rest}=o;return rest;};
 const fills=s.fills.filter(f=>f.buyer===uid||f.seller===uid).slice(-30).reverse().map(f=>({sequence:f.sequence,companyId:f.companyId,price:f.price,quantity:f.quantity,side:f.buyer===uid?'buy':'sell',createdAt:f.createdAt}));
 const visible=[...own.filter(open),...own.filter(o=>!open(o)).sort((x,y)=>y.sequence-x.sequence).slice(0,20)].sort((x,y)=>y.sequence-x.sequence);
 return {account:a,market:s.markets[companyId]||null,book:{bids:levels('buy'),asks:levels('sell')},orders:visible.map(clean),fills,limits:{orders:500,fills:1000},mode:'limit-v1'};
}

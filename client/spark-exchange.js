import {marketSession,assertMarketOpen,koreaDayStart} from './market-session.js';
import {doc,collection,getDoc,getDocs,query,where,Timestamp,orderBy,limit,runTransaction,increment,serverTimestamp} from 'firebase/firestore';
const validCompany=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const empty=()=>({cash:1000000,reservedCash:0,positions:{},reservedPositions:{},version:0,lastMarket:''});
const sorted=(orders,side)=>orders.filter(o=>o.side===side).sort((a,b)=>(side==='buy'?b.price-a.price:a.price-b.price)||a.sequence-b.sequence);
async function transact(db,bookRef,callback){
 for(let attempt=0;attempt<5;attempt++){
  let seen;
  try{return await runTransaction(db,async t=>{const snapshot=await t.get(bookRef);seen=snapshot.exists()?snapshot.data().version:-1;return callback(t,snapshot);});}
  catch(error){
   // Rules may see a competing book commit before optimistic preconditions.
   // Retry only actual book advancement, keeping the same order/fill ID.
   if(error.code!=='permission-denied'||seen===undefined||attempt===4)throw error;
   const latest=await getDoc(bookRef);if((latest.exists()?latest.data().version:-1)===seen)throw error;
  }
 }
}
export function crossing(book){
 let buy=sorted(book.orders,'buy')[0];if(!buy)return null;
 const asks=sorted(book.orders,'sell');
 if(book.treasuryShares>0)asks.push({uid:'',id:'issuer',side:'sell',price:book.initialPrice,quantity:book.issuedShares,remaining:book.treasuryShares,sequence:0});
 asks.sort((a,b)=>a.price-b.price||a.sequence-b.sequence);const sell=asks[0];
 if(sell?.id==='issuer')buy=book.orders.filter(o=>o.side==='buy'&&o.price>=book.initialPrice).sort((a,b)=>a.sequence-b.sequence)[0];
 if(!buy||!sell||buy.price<sell.price||buy.uid===sell.uid)return null;
 return {buy,sell,quantity:Math.min(buy.remaining,sell.remaining),price:buy.sequence<sell.sequence?buy.price:sell.price};
}
export async function initializeSpark(db,uid,companyId){
 if(!validCompany(companyId))throw new Error('기업을 선택하세요.');
 await transact(db,doc(db,'sparkBooks',companyId),async(t,bookSnapshot)=>{
  const account=doc(db,'sparkAccounts',uid),book=doc(db,'sparkBooks',companyId);
  const [a,c]=await Promise.all([t.get(account),t.get(doc(db,'companies',companyId))]);const b=bookSnapshot;
  if(!a.exists())t.set(account,empty());
  if(!b.exists()){
   const company=c.data();if(!company||company.status!=='listed')throw new Error('현재 거래 가능한 기업이 아닙니다.');
   if(!Number.isSafeInteger(company.referencePrice)||company.referencePrice<1||company.referencePrice>1000000||!Number.isSafeInteger(company.issuedShares)||company.issuedShares<1||company.issuedShares>1000000)throw new Error('기업 초기 발행 설정을 확인하세요.');
   t.set(book,{initialPrice:company.referencePrice,issuedShares:company.issuedShares,treasuryShares:company.issuedShares,issuerCash:0,lastPrice:0,orders:[],version:0,lastAction:{kind:'init',actor:uid},updatedAt:serverTimestamp()});
  }
 });
}
export async function placeSpark(db,uid,b){
 assertMarketOpen();
 if(typeof b.orderId!=='string'||! /^[A-Za-z0-9_-]{8,80}$/.test(b.orderId)||!validCompany(b.companyId)||!['buy','sell'].includes(b.side)||!Number.isSafeInteger(b.price)||b.price<1||b.price>1000000||!Number.isSafeInteger(b.quantity)||b.quantity<1||b.quantity>1000000||b.price*b.quantity>1000000000)throw new Error('지정가격과 수량을 정수로 확인하세요.');
 const bookRef=doc(db,'sparkBooks',b.companyId),orderRef=doc(db,'sparkAccounts',uid,'orders',b.orderId);
 return transact(db,bookRef,async(t,bookDoc)=>{
  assertMarketOpen();
  const [accountDoc,old]=await Promise.all([t.get(doc(db,'sparkAccounts',uid)),t.get(orderRef)]);
  if(old.exists()){
   if(['companyId','side','price','quantity'].some(k=>old.data()[k]!==b[k]))throw new Error('같은 주문 번호의 내용이 다릅니다.');
   return {order:old.data(),duplicate:true};
  }
  const book=bookDoc.data(),account=accountDoc.data();if(!book||!account)throw new Error('종목 화면을 열어 계좌를 준비하세요.');
  if(book.orders.length>=4)throw new Error('종목의 대기 주문 4건이 찼습니다. 체결하거나 잔량을 취소하세요.');
  if(book.orders.some(o=>o.uid===uid&&o.side!==b.side&&(b.side==='buy'?b.price>=o.price:b.price<=o.price)))throw new Error('본인의 반대 주문과 가격이 겹칩니다. 기존 주문을 먼저 취소하세요.');
  if(b.side==='buy'&&account.cash-account.reservedCash<b.price*b.quantity)throw new Error('주문 가능 현금이 부족합니다.');
  if(b.side==='sell'&&(account.positions[b.companyId]??0)-(account.reservedPositions[b.companyId]??0)<b.quantity)throw new Error('매도 가능 수량이 부족합니다.');
  const entry={uid,id:b.orderId,side:b.side,price:b.price,quantity:b.quantity,remaining:b.quantity,sequence:book.version+1};
  const order={companyId:b.companyId,orderId:b.orderId,uid,side:b.side,price:b.price,quantity:b.quantity,sequence:entry.sequence,remaining:b.quantity,filled:0,cancelled:0,status:'open',createdAt:serverTimestamp(),marketVersion:entry.sequence};
  t.update(bookRef,{orders:[...book.orders,entry],version:entry.sequence,lastAction:{kind:'place',actor:uid,entry},updatedAt:serverTimestamp()});
  t.update(doc(db,'sparkAccounts',uid),{version:increment(1),lastMarket:b.companyId,...(b.side==='buy'?{reservedCash:increment(b.price*b.quantity)}:{['reservedPositions.'+b.companyId]:increment(b.quantity)})});
  t.set(orderRef,order);return {order,duplicate:false};
 });
}
export async function matchSpark(db,uid,companyId,{recordPublic=true}={}){
 if(!marketSession().open)return false;
 const bookRef=doc(db,'sparkBooks',companyId),fillId=crypto.randomUUID();
 return transact(db,bookRef,async(t,snapshot)=>{
  if(!marketSession().open)return false;
  const book=snapshot.data();if(!book)return false;
  const match=crossing(book);if(!match)return false;
  const {buy,sell,quantity:q,price}=match,version=book.version+1,issuer=sell.id==='issuer';
  const orders=book.orders.filter(o=>!(o.uid===buy.uid&&o.id===buy.id)&&!(o.uid===sell.uid&&o.id===sell.id));
  for(const o of [buy,sell])if(o.id!=='issuer'&&o.remaining>q)orders.push({...o,remaining:o.remaining-q});
  t.update(bookRef,{orders,version,lastAction:{kind:'fill',actor:uid,buy,sell,fillId},updatedAt:serverTimestamp(),lastPrice:price,treasuryShares:book.treasuryShares-(issuer?q:0),issuerCash:book.issuerCash+(issuer?price*q:0)});
  const record={companyId,price,quantity:q,marketVersion:version,createdAt:serverTimestamp()};
  if(recordPublic)t.set(doc(db,'sparkBooks',companyId,'trades',fillId),record);
  t.update(doc(db,'sparkAccounts',buy.uid),{cash:increment(-price*q),reservedCash:increment(-buy.price*q),['positions.'+companyId]:increment(q),version:increment(1),lastMarket:companyId});
  t.set(doc(db,'sparkAccounts',buy.uid,'fills',fillId),{...record,side:'buy'});
  for(const o of issuer?[buy]:[buy,sell])t.update(doc(db,'sparkAccounts',o.uid,'orders',o.id),{remaining:o.remaining-q,filled:o.quantity-o.remaining+q,status:o.remaining===q?'filled':'open',marketVersion:version});
  if(!issuer){
   t.update(doc(db,'sparkAccounts',sell.uid),{cash:increment(price*q),['positions.'+companyId]:increment(-q),['reservedPositions.'+companyId]:increment(-q),version:increment(1),lastMarket:companyId});
   t.set(doc(db,'sparkAccounts',sell.uid,'fills',fillId),{...record,side:'sell'});
  }
  return true;
 });
}
export async function cancelSpark(db,uid,{orderId,companyId,ownerUid=uid}){
 if(!validCompany(companyId)||typeof ownerUid!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)||typeof orderId!=='string'||! /^[A-Za-z0-9_-]{8,80}$/.test(orderId))throw new Error('취소할 주문을 확인하세요.');
 const bookRef=doc(db,'sparkBooks',companyId);
 return transact(db,bookRef,async(t,snapshot)=>{
  const book=snapshot.data();
  const entry=book?.orders.find(o=>o.uid===ownerUid&&o.id===orderId);if(!entry)return {ok:true};
  const version=book.version+1;
  t.update(bookRef,{orders:book.orders.filter(o=>o!==entry),version,lastAction:{kind:'cancel',actor:uid,entry},updatedAt:serverTimestamp()});
  t.update(doc(db,'sparkAccounts',ownerUid),{version:increment(1),lastMarket:companyId,...(entry.side==='buy'?{reservedCash:increment(-entry.price*entry.remaining)}:{['reservedPositions.'+companyId]:increment(-entry.remaining)})});
  t.update(doc(db,'sparkAccounts',ownerUid,'orders',entry.id),{remaining:0,cancelled:entry.remaining,status:'cancelled',marketVersion:version});return {ok:true};
 });
}
export async function marketHistory(db,companyId,max=100){
 if(!validCompany(companyId))throw new Error('기업을 선택하세요.');
 try{const snapshot=await getDocs(query(collection(db,'sparkBooks',companyId,'trades'),orderBy('marketVersion','desc'),limit(max)));return {available:true,trades:snapshot.docs.map(d=>d.data())};}
 catch(error){if(error.code==='permission-denied')return {available:false,trades:[]};throw error;}
}
export async function previousClose(db,companyId){
 const result=await getDocs(query(collection(db,'sparkBooks',companyId,'trades'),where('createdAt','<',Timestamp.fromMillis(koreaDayStart())),orderBy('createdAt','desc'),limit(1)));
 return result.empty?null:result.docs[0].data().price;
}
export async function sparkView(db,uid,companyId,role){
 await initializeSpark(db,uid,companyId);
 // Each confirmed pair is independently validated by Rules. No browser or
 // private counterparty account read is trusted as settlement authority.
 const operation=await getDoc(doc(db,'companyOperations',companyId)),settlementLocked=operation.exists()&&operation.data().locked===true;
 let history=await marketHistory(db,companyId),matched=false;
 let matchError=settlementLocked?'배당 정산 중입니다. 정산이 완료되면 거래를 재개합니다.':null;try{for(let i=0;i<8&&!settlementLocked;i++){if(!await matchSpark(db,uid,companyId,{recordPublic:history.available}))break;matched=true;}}catch{matchError='미체결 주문 처리가 보류됐습니다. 호가를 새로고침하거나 관리자에게 대기 주문 확인을 요청하세요.';}
 if(matched&&history.available)history=await marketHistory(db,companyId);
 const [accountDoc,bookDoc,ordersDoc,fillsDoc]=await Promise.all([getDoc(doc(db,'sparkAccounts',uid)),getDoc(doc(db,'sparkBooks',companyId)),getDocs(query(collection(db,'sparkAccounts',uid,'orders'),orderBy('createdAt','desc'),limit(30))),getDocs(query(collection(db,'sparkAccounts',uid,'fills'),orderBy('createdAt','desc'),limit(30)))]);
 const book=bookDoc.data(),orders=ordersDoc.docs.map(d=>d.data());
 for(const o of book.orders.filter(o=>o.uid===uid))if(!orders.some(x=>x.orderId===o.id))orders.push({companyId,orderId:o.id,...o,filled:o.quantity-o.remaining,cancelled:0,status:'open'});
 const levels=side=>{const m=new Map();for(const o of book.orders.filter(o=>o.side===side))m.set(o.price,(m.get(o.price)||0)+o.remaining);if(side==='sell'&&book.treasuryShares)m.set(book.initialPrice,(m.get(book.initialPrice)||0)+book.treasuryShares);return [...m].sort((a,b)=>side==='buy'?b[0]-a[0]:a[0]-b[0]).map(([price,quantity])=>({price,quantity}));};
 let close=null,closeKind='unavailable';try{close=await previousClose(db,companyId);closeKind=close?'previous':'initial';close??=book.initialPrice;}catch{}
 return {marketOpen:marketSession().open,marketHours:marketSession().label,settlementLocked,marketTrades:history.trades,marketHistoryAvailable:history.available,account:accountDoc.data(),market:{lastPrice:book.lastPrice,treasuryShares:book.treasuryShares,previousClose:close,closeKind},book:{asks:levels('sell'),bids:levels('buy')},orders:orders.sort((a,b)=>b.sequence-a.sequence),fills:fillsDoc.docs.map(d=>d.data()),mode:'spark-limit-v1',matchError,adminOrders:role==='admin'?book.orders:[]};
}

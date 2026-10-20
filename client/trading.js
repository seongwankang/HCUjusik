import {INITIAL_CASH} from './initial-capital.js';
import {doc,collection,getDoc,getDocs,query,orderBy,limit,runTransaction,serverTimestamp} from 'firebase/firestore';
export const emptyAccount=()=>({cash:INITIAL_CASH,positions:{},version:0,lastOrderId:''});
export async function testPortfolio(db,uid){
 const ref=doc(db,'tradeTests',uid);
 await runTransaction(db,async t=>{if(!(await t.get(ref)).exists())t.set(ref,emptyAccount());});
 const [account,orders]=await Promise.all([getDoc(ref),getDocs(query(collection(ref,'orders'),orderBy('version','desc'),limit(20)))]);
 return {...account.data(),orders:orders.docs.map(s=>({id:s.id,...s.data(),createdAt:s.data().createdAt?.toDate().toISOString()}))};
}
export async function testOrder(db,uid,b){
 if(!['test-a','test-b'].includes(b.companyId)||!['buy','sell'].includes(b.side)||!Number.isSafeInteger(b.quantity)||b.quantity<1||b.quantity>1000000||!Number.isSafeInteger(b.price)||b.price<1||typeof b.orderId!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(b.orderId))throw new Error('주문 입력을 확인하세요.');
 const accountRef=doc(db,'tradeTests',uid),orderRef=doc(accountRef,'orders',b.orderId);
 for(let attempt=0;attempt<5;attempt++){
 let readVersion;
 try{return await runTransaction(db,async t=>{
  const [account,company,oldOrder]=await Promise.all([t.get(accountRef),t.get(doc(db,'companies',b.companyId)),t.get(orderRef)]);
  if(oldOrder.exists()){
   const old=oldOrder.data();if(['companyId','side','quantity','price'].some(k=>old[k]!==b[k]))throw new Error('같은 주문 번호의 내용이 다릅니다.');
   return {ok:true,duplicate:true};
  }
  if(!account.exists())throw new Error('테스트 계좌를 먼저 열어 주세요.');
  if(!company.exists()||company.data().status!=='listed')throw new Error('거래 가능한 테스트 기업이 아닙니다.');
  if(company.data().referencePrice!==b.price)throw new Error('가격이 변경됐습니다. 종목 화면을 다시 열어 주세요.');
  const a=account.data(),total=b.price*b.quantity,held=a.positions[b.companyId]||0;readVersion=a.version;
  if(b.side==='buy'&&a.cash<total)throw new Error('테스트 계좌의 잔액이 부족합니다.');
  if(b.side==='sell'&&held<b.quantity)throw new Error('보유 수량보다 많이 매도할 수 없습니다.');
  const cash=a.cash+(b.side==='buy'?-total:total),quantity=held+(b.side==='buy'?b.quantity:-b.quantity);
  if(!Number.isSafeInteger(cash)||cash<0||cash>1000000000000||quantity>1000000)throw new Error('테스트 계좌 한도를 초과했습니다.');
  const version=a.version+1;
  t.update(accountRef,{cash,positions:{...a.positions,[b.companyId]:quantity},version,lastOrderId:b.orderId});
  t.set(orderRef,{companyId:b.companyId,side:b.side,quantity:b.quantity,price:b.price,total,version,createdAt:serverTimestamp()});
  return {ok:true,duplicate:false};
 });}catch(error){
  // Rules can observe a competing commit before the transaction precondition
  // is checked. Retry only if that account actually advanced; keep the same ID.
  if(error.code!=='permission-denied'||readVersion===undefined||attempt===4)throw error;
  const latest=await getDoc(accountRef);if(!latest.exists()||latest.data().version===readVersion)throw error;
 }
 }
}

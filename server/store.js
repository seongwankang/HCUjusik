import {ExchangeError,newExchange,submit,cancel,view,pruneInactive} from './exchange.js';
export function authorize(profile,claims){
 if(profile?.active!==true||!['student','president','admin'].includes(profile.role))throw new ExchangeError('활성 참가 계정이 아닙니다.',403);
 if(profile.role!=='admin'&&!(claims.email_verified===true&&typeof claims.email==='string'&&/^[^\s@]+@hcu\.hs\.kr$/i.test(claims.email)))throw new ExchangeError('학교 이메일 인증을 완료하세요.',403);
}
export function createExchangeStore(db){
 const stateRef=db.doc('exchangeState/limit-v1');
 const assertState=s=>{if(s.schema!==1)throw new ExchangeError('거래 데이터 버전을 확인하세요.',503);};
 return {
  async read(uid,claims,companyId){
   const [p,s,c]=await db.getAll(db.doc(`users/${uid}`),stateRef,db.doc(`companies/${companyId}`));authorize(p.data(),claims);
   const state=s.exists?s.data():newExchange();assertState(state);
   // A read can preview the initial offering without provisioning assets.
   if(!state.markets[companyId]&&c.exists&&c.data().status==='listed'){
    const company=c.data();state.markets[companyId]={initialPrice:company.referencePrice,issuedShares:company.issuedShares,treasuryShares:company.issuedShares,issuerCash:0,lastPrice:null};
   }
   return {...view(state,uid,companyId),companyStatus:c.exists?c.data().status:'missing'};
  },
  async mutate(uid,claims,operation,body){
   return db.runTransaction(async t=>{
    const [p,s]=await t.getAll(db.doc(`users/${uid}`),stateRef);authorize(p.data(),claims);
    const state=s.exists?s.data():newExchange();assertState(state);
    const makerIds=[...new Set(Object.values(state.orders).filter(o=>o.status==='open').map(o=>o.uid))];
    const profiles=makerIds.length?await t.getAll(...makerIds.map(id=>db.doc(`users/${id}`))):[];
    const active=new Set(makerIds.filter((id,i)=>profiles[i].data()?.active===true));pruneInactive(state,active);
    let result;
    if(operation==='order'){
     const company=await t.get(db.doc(`companies/${body.companyId}`));
     result=submit(state,uid,body,company.data(),new Date().toISOString());
    }else result=cancel(state,uid,body.orderId);
    // Firestore document limit is 1 MiB; reject before it and keep prior state intact.
    if(Buffer.byteLength(JSON.stringify(state))>700000)throw new ExchangeError('테스트 주문장 저장 한도에 도달했습니다.',409);
    t.set(stateRef,state);
    const {uid:ignored,...order}=result.order;
    return {...result,order};
   },{maxAttempts:5});
  }
 };
}

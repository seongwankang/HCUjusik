import {FieldValue} from 'firebase-admin/firestore';
import {INITIAL_CASH} from '../client/initial-capital.js';
export const CAPITAL_MIGRATION='initial-capital-2000000-v1';
const BONUS=1000000;
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;

// Private per-user receipts make retries and concurrent runs exactly-once.
export async function increaseInitialCapital(db){
 const users=await db.collection('users').get();
 const result={credited:0,alreadyApplied:0,excluded:0};
 for(const entry of users.docs){
  const status=await db.runTransaction(async t=>{
   const userRef=db.doc('users/'+entry.id),portfolioRef=db.doc('portfolios/'+entry.id),accountRef=db.doc('sparkAccounts/'+entry.id);
   const receiptRef=db.doc('capitalAdjustments/'+CAPITAL_MIGRATION+'/users/'+entry.id);
   const [user,portfolio,account,receipt]=await Promise.all([t.get(userRef),t.get(portfolioRef),t.get(accountRef),t.get(receiptRef)]);
   if(!user.exists||!['student','president'].includes(user.data().role))return 'excluded';
   if(receipt.exists||portfolio.data()?.initialCapital===INITIAL_CASH)return 'alreadyApplied';
   const oldPortfolio=portfolio.exists?portfolio.data():null,oldAccount=account.exists?account.data():null;
   for(const data of [oldPortfolio,oldAccount])if(data&&(!money(data.cash)||!Number.isSafeInteger(data.version)||data.version<0||!money(data.cash+BONUS)))throw Error('Invalid participant account; no writes made for this participant');
   t.set(receiptRef,{beforePortfolio:oldPortfolio,beforeAccount:oldAccount,amount:BONUS,createdAt:FieldValue.serverTimestamp()});
   if(oldPortfolio)t.update(portfolioRef,{cash:oldPortfolio.cash+BONUS,initialCapital:INITIAL_CASH,version:oldPortfolio.version+1});
   else t.set(portfolioRef,{cash:INITIAL_CASH,holdings:[],version:0,initialCapital:INITIAL_CASH});
   if(oldAccount)t.update(accountRef,{cash:oldAccount.cash+BONUS,version:oldAccount.version+1});
   else t.set(accountRef,{cash:INITIAL_CASH,reservedCash:0,positions:{},reservedPositions:{},version:0,lastMarket:''});
   return 'credited';
  });
  result[status]++;
 }
 await db.doc('capitalAdjustments/'+CAPITAL_MIGRATION).set({...result,status:'complete',completedAt:FieldValue.serverTimestamp()});
 return result;
}

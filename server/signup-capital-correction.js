import {FieldValue} from 'firebase-admin/firestore';
export const SIGNUP_CORRECTION='signup-overgrant-2026-10-22';
export const SIGNUP_FROM=Date.parse('2026-10-22T08:00:00+09:00');
export const SIGNUP_UNTIL=Date.parse('2026-10-23T00:00:00+09:00');
const EXTRA=1000000;
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
export function eligibleSignup(user,portfolio,createdAt){return ['student','president'].includes(user?.role)&&createdAt>=SIGNUP_FROM&&createdAt<SIGNUP_UNTIL&&portfolio?.initialCapital===2000000;}
// Selection uses Firestore's server-controlled profile creation metadata and the
// original capital marker, never the current cash balance as proof of a grant.
export async function correctSignupCapital(db,{apply=false}={}){
 const users=await db.collection('users').get(),result={scanned:users.size,eligible:0,alreadyApplied:0,recovered:0,amount:0,insufficientCash:0,reservedFunds:0,missingAccounts:0};
 for(const u of users.docs){
  const status=await db.runTransaction(async t=>{
   if((await t.get(db.doc('systemMaintenance/reset'))).exists)throw Error('Maintenance in progress');
   const userRef=db.doc('users/'+u.id),portfolioRef=db.doc('portfolios/'+u.id),accountRef=db.doc('sparkAccounts/'+u.id),receiptRef=db.doc('capitalAdjustments/'+SIGNUP_CORRECTION+'/users/'+u.id);
   const [user,portfolio,account,receipt]=await Promise.all([t.get(userRef),t.get(portfolioRef),t.get(accountRef),t.get(receiptRef)]);
   if(receipt.exists)return 'alreadyApplied';
   if(!user.exists||!eligibleSignup(user.data(),portfolio.data(),user.createTime.toMillis()))return 'excluded';
   const p=portfolio.data(),a=account.data();
   if(!money(p.cash)||!Number.isSafeInteger(p.version)||a&&(!money(a.cash)||!money(a.reservedCash)||!Number.isSafeInteger(a.version)))throw Error('Invalid eligible account; no writes committed');
   if(p.cash<EXTRA||a&&a.cash<EXTRA)return 'insufficientCash';
   if(a&&a.cash-a.reservedCash<EXTRA)return 'reservedFunds';
   if(!apply)return a?'eligible':'missingAccounts';
   t.set(receiptRef,{amount:EXTRA,profileCreatedAt:user.createTime,beforePortfolio:p,beforeAccount:a||null,createdAt:FieldValue.serverTimestamp()});
   t.update(portfolioRef,{cash:p.cash-EXTRA,initialCapital:1000000,version:p.version+1});
   if(a)t.update(accountRef,{cash:a.cash-EXTRA,version:a.version+1});
   else t.set(accountRef,{cash:1000000,reservedCash:0,positions:{},reservedPositions:{},version:0,lastMarket:''});
   return 'recovered';
  });
  if(status==='excluded')continue;
  if(status==='alreadyApplied'){result.alreadyApplied++;continue;}
  result.eligible++;
  if(status==='recovered'){result.recovered++;result.amount+=EXTRA;}else if(status!=='eligible')result[status]++;
 }
 if(apply)await db.doc('capitalAdjustments/'+SIGNUP_CORRECTION).set({...result,from:new Date(SIGNUP_FROM),until:new Date(SIGNUP_UNTIL),completedAt:FieldValue.serverTimestamp()},{merge:true});
 return {mode:apply?'apply':'audit',...result};
}

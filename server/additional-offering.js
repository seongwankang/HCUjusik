import {FieldValue} from 'firebase-admin/firestore';
import {currentPriceLimits,withinPriceLimits} from '../client/daily-price-limits.js';
export const ADDITIONAL_OFFERING_ID='additional-200-at-10000-2026-10-23';
const QUANTITY=200,PRICE=10000;
function validate(company,book){
 if(!company||!book||!Number.isSafeInteger(book.issuedShares)||book.issuedShares<1||book.issuedShares+QUANTITY>1000000||company.issuedShares!==book.issuedShares||!Number.isSafeInteger(book.treasuryShares)||book.treasuryShares<0||book.treasuryShares>book.issuedShares||book.initialPrice!==PRICE||!Number.isSafeInteger(book.version))throw Error('Additional offering requires matching company/book shares and a 10000-won issuer price');
}
// A durable, frozen roster and one receipt per company make retries safe even
// while normal trading continues. Never credit cash before the shares sell.
export async function issueAdditionalShares(db,{now=Date.now()}={}){
 const root=db.doc('shareIssuances/'+ADDITIONAL_OFFERING_ID);
 if((await db.doc('systemMaintenance/reset').get()).exists)throw Error('Market maintenance in progress');
 let plan=(await root.get()).data();
 if(!plan){
  const companies=await db.collection('companies').get(),eligible=companies.docs.filter(s=>['listed','paused'].includes(s.data().status));
  if(!eligible.length||eligible.length>200)throw Error('Invalid offering roster size');
  for(const c of eligible){const b=(await db.doc('sparkBooks/'+c.id).get()).data();validate(c.data(),b);if(!withinPriceLimits(PRICE,currentPriceLimits(b,now)))throw Error('10000-won offering is outside current daily price limits; no shares issued');}
  await db.runTransaction(async t=>{const old=await t.get(root);if(!old.exists)t.create(root,{companyIds:eligible.map(s=>s.id).sort(),quantity:QUANTITY,price:PRICE,createdAt:FieldValue.serverTimestamp()});});plan=(await root.get()).data();
 }
 let issued=0,alreadyIssued=0;
 for(const cid of plan.companyIds){
  const applied=await db.runTransaction(async t=>{
   const companyRef=db.doc('companies/'+cid),bookRef=db.doc('sparkBooks/'+cid),receipt=root.collection('companies').doc(cid);
   const [company,book,old,maintenance,operations]=await Promise.all([t.get(companyRef),t.get(bookRef),t.get(receipt),t.get(db.doc('systemMaintenance/reset')),t.get(db.doc('companyOperations/'+cid))]);
   if(old.exists)return false;if(maintenance.exists||operations.data()?.locked)throw Error('Company settlement/maintenance in progress; retry offering later');
   const c=company.data(),b=book.data();validate(c,b);
   const nextIssued=b.issuedShares+QUANTITY,nextTreasury=b.treasuryShares+QUANTITY;
   t.update(companyRef,{issuedShares:nextIssued});
   t.update(bookRef,{issuedShares:nextIssued,treasuryShares:nextTreasury,version:b.version+1,lastAction:{kind:'offering',actor:ADDITIONAL_OFFERING_ID},updatedAt:FieldValue.serverTimestamp()});
   t.create(receipt,{quantity:QUANTITY,price:PRICE,beforeIssued:b.issuedShares,afterIssued:nextIssued,beforeTreasury:b.treasuryShares,afterTreasury:nextTreasury,companyCashCredited:0,createdAt:FieldValue.serverTimestamp()});return true;
  });if(applied)issued++;else alreadyIssued++;
 }
 let unavailableAtCurrentBand=0;
 for(const cid of plan.companyIds){const b=(await db.doc('sparkBooks/'+cid).get()).data();if(!withinPriceLimits(PRICE,currentPriceLimits(b,now)))unavailableAtCurrentBand++;}
 await root.set({completedAt:FieldValue.serverTimestamp()},{merge:true});
 return {companies:plan.companyIds.length,issued,alreadyIssued,sharesPerCompany:QUANTITY,price:PRICE,totalAdditionalShares:plan.companyIds.length*QUANTITY,unavailableAtCurrentBand};
}

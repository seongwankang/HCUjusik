import {DEFAULT_CONFIG} from '../client/business-policy.js';
import {FieldValue} from 'firebase-admin/firestore';
import {newOperations} from '../client/economy.js';
export const COMPANY_INITIAL_CAPITAL=10000000;
// Private receipts are authoritative; company cash can subsequently be spent.
export async function fundCompanyStartup(db,{now=Date.now()}={}){
 if((await db.doc('systemMaintenance/reset').get()).exists)return {credited:0,maintenance:true};
 await db.runTransaction(async t=>{const receipt=db.doc('companyCapitalGrants/production-v1');if(!(await t.get(receipt)).exists){t.set(db.doc('economyConfig/main'),DEFAULT_CONFIG);t.set(receipt,{policyVersion:1,createdAt:FieldValue.serverTimestamp()});}});
 const companies=await db.collection('companies').get();let credited=0;
 for(const company of companies.docs){
  const applied=await db.runTransaction(async t=>{
   const ref=db.doc('companyOperations/'+company.id),receipt=db.doc('companyCapitalGrants/production-v1/companies/'+company.id);
   const [current,paid,maintenance]=await Promise.all([t.get(ref),t.get(receipt),t.get(db.doc('systemMaintenance/reset'))]);
   if(paid.exists||maintenance.exists)return false;
   const o=current.exists?current.data():newOperations(now);
   if(o.locked)throw Error('Company settlement in progress; retry funding later');
   const cash=o.cash+COMPANY_INITIAL_CAPITAL;
   if(!Number.isSafeInteger(cash)||Math.abs(cash)>1e12)throw Error('Company cash limit');
   if(current.exists)t.update(ref,{cash});else t.set(ref,{...o,cash});
   t.set(receipt,{amount:COMPANY_INITIAL_CAPITAL,createdAt:FieldValue.serverTimestamp()});
   return true;
  });if(applied)credited++;
 }
 return {credited,companies:companies.size};
}

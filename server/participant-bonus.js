import {FieldValue} from 'firebase-admin/firestore';
export const PARTICIPANT_BONUS_ID='participant-bonus-500000-2026-10-23-v1';
export const PARTICIPANT_BONUS_AMOUNT=500000;
const cash=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1e12;
function check(data){if(!data||!cash(data.cash)||!cash(data.cash+PARTICIPANT_BONUS_AMOUNT)||!Number.isSafeInteger(data.version)||data.version<0||data.version>=1000000000)throw Error('Invalid grant account; retry after correcting the account');}
// Freeze the currently registered student/president roster once. Neither late
// signups nor retries turn a one-off distribution into a recurring grant.
export async function grantParticipantBonus(db){
 const root=db.doc('participantGrants/'+PARTICIPANT_BONUS_ID),maintenance=db.doc('systemMaintenance/reset');
 const roster=await db.runTransaction(async t=>{
  const [old,reset]=await Promise.all([t.get(root),t.get(maintenance)]);if(reset.exists)throw Error('Maintenance in progress');
  if(old.exists){const d=old.data();if(d.amount!==PARTICIPANT_BONUS_AMOUNT||!Array.isArray(d.roster))throw Error('Grant policy mismatch');return d.roster;}
  const users=await t.get(db.collection('users').where('role','in',['student','president']).select('role'));
  const ids=users.docs.map(u=>u.id).sort();if(ids.length>1000)throw Error('Grant roster exceeds supported size');
  t.set(root,{amount:PARTICIPANT_BONUS_AMOUNT,roster:ids,participants:ids.length,status:'processing',createdAt:FieldValue.serverTimestamp()});return ids;
 });
 const result={participants:roster.length,credited:0,alreadyPaid:0,amountPerParticipant:PARTICIPANT_BONUS_AMOUNT,totalAmount:roster.length*PARTICIPANT_BONUS_AMOUNT};
 for(const uid of roster){const paid=await db.runTransaction(async t=>{
  const receipt=root.collection('users').doc(uid),portfolio=db.doc('portfolios/'+uid),account=db.doc('sparkAccounts/'+uid);
  const [prior,p,a,reset]=await Promise.all([t.get(receipt),t.get(portfolio),t.get(account),t.get(maintenance)]);if(reset.exists)throw Error('Maintenance in progress');
  if(prior.exists){if(prior.data().amount!==PARTICIPANT_BONUS_AMOUNT)throw Error('Grant receipt mismatch');return false;}
  const beforePortfolio=p.data(),beforeAccount=a.data();check(beforePortfolio);if(beforeAccount)check(beforeAccount);
  if(!beforeAccount&&(beforePortfolio.holdings?.length||0)>0)throw Error('Legacy holdings need review before account creation');
  const beforeCash=beforeAccount?.cash??beforePortfolio.cash;
  t.update(portfolio,{cash:beforePortfolio.cash+PARTICIPANT_BONUS_AMOUNT,version:beforePortfolio.version+1});
  if(beforeAccount)t.update(account,{cash:beforeCash+PARTICIPANT_BONUS_AMOUNT,version:beforeAccount.version+1});
  else t.set(account,{cash:beforeCash+PARTICIPANT_BONUS_AMOUNT,reservedCash:0,positions:{},reservedPositions:{},version:0,lastMarket:''});
  t.set(receipt,{amount:PARTICIPANT_BONUS_AMOUNT,beforeCash,afterCash:beforeCash+PARTICIPANT_BONUS_AMOUNT,portfolioBeforeCash:beforePortfolio.cash,portfolioAfterCash:beforePortfolio.cash+PARTICIPANT_BONUS_AMOUNT,createdAt:FieldValue.serverTimestamp()});return true;
 });if(paid)result.credited++;else result.alreadyPaid++;}
 const receipts=await root.collection('users').get(),keys=new Set(roster);
 if(receipts.size!==roster.length||receipts.docs.some(r=>!keys.has(r.id)||r.data().amount!==PARTICIPANT_BONUS_AMOUNT||r.data().afterCash-r.data().beforeCash!==PARTICIPANT_BONUS_AMOUNT||r.data().portfolioAfterCash-r.data().portfolioBeforeCash!==PARTICIPANT_BONUS_AMOUNT))throw Error('Grant verification failed');
 await root.set({status:'complete',paidParticipants:receipts.size,totalAmount:result.totalAmount,completedAt:FieldValue.serverTimestamp()},{merge:true});
 return {...result,verified:receipts.size};
}

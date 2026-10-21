import {FieldValue} from 'firebase-admin/firestore';
import {koreaDay,settlementTime} from '../client/settlement-time.js';
const stamp=v=>v?.toMillis?.()??NaN;
// A single, narrowly checked repair. All originals remain in private Firestore;
// no account identifiers, balances or student data are printed by the job.
export async function correctStartupSettlement(db,{day=20747,expectedCompanies=4}={}){
 const id='startup-cutoff-'+day,root=db.doc('settlementCorrections/'+id);
 if((await root.get()).data()?.status==='complete')return {status:'complete',companies:expectedCompanies};
 const events=(await db.collection('events').get()).docs.filter(s=>s.data().title==='창업'&&s.data().type==='choice'&&koreaDay(stamp(s.data().endsAt))===day);
 if(events.length!==1)throw Error('Expected exactly one startup event');
 const event=events[0],candidates=[];
 for(const cid of event.data().targets){
  const ref=db.doc('companyOperations/'+cid),daily=ref.collection('days').doc('d'+day),[o,d,e]=await Promise.all([ref.get(),daily.get(),db.doc('companyEffects/'+cid+'/items/'+event.id).get()]);
  if(d.data()?.revenue!==400000)continue;
  if(o.data()?.locked||o.data()?.lastSettledDay!==day||o.data()?.settlementCount!==1||e.data()?.effect?.kind!=='grant'||e.data().effect.asset!=='equipment'||e.data().result?.count!==1||stamp(d.data().createdAt)<stamp(e.data().appliedAt)||stamp(e.data().appliedAt)<settlementTime(day))throw Error('Unexpected settlement; manual audit required');
  candidates.push({ref,daily});
 }
 if(candidates.length!==expectedCompanies)throw Error('Unexpected affected company count');
 return db.runTransaction(async t=>{
  if((await t.get(root)).exists)return {status:'complete',companies:expectedCompanies};
  const spy=(await t.get(db.doc('spyRounds/d'+day))).data();
  if(spy?.transfers?.some(x=>x.amount>0&&candidates.some(c=>c.ref.id===x.targetId||c.ref.id===x.companyId)))throw Error('Spy transfers require a separate audited correction');
  const changes=[],debits=new Map();let revenue=0,dividends=0;
  for(const {ref,daily} of candidates){
   const [os,ds,payouts]=await Promise.all([t.get(ref),t.get(daily),t.get(daily.collection('payouts'))]),o=os.data(),d=ds.data();
   if(o.locked||o.lastSettledDay!==day||d.revenue!==400000||d.correctionId||o.paidAmount!==d.dividend)throw Error('Settlement changed during audit');
   let amount=0,shares=0;
   for(const p of payouts.docs){
    const a=p.data(),history=db.doc('sparkAccounts/'+p.id+'/dividends/'+ref.id+'_d'+day),h=await t.get(history);
    if(!Number.isSafeInteger(a.amount)||a.amount<0||a.amount!==d.perShare*a.shares||h.data()?.amount!==a.amount||h.data()?.shares!==a.shares)throw Error('Dividend receipt mismatch');
    amount+=a.amount;shares+=a.shares;debits.set(p.id,(debits.get(p.id)||0)+a.amount);
    changes.push([p,{amount:0,correctionId:id}],[h,{amount:0,correctionId:id}]);
   }
   if(amount!==d.dividend||shares!==d.sold||d.retained+d.dividend!==d.revenue)throw Error('Incomplete settlement receipts');
   revenue+=d.revenue;dividends+=amount;
   changes.push([os,{cash:o.cash-d.retained,paidAmount:0,revenueRevision:(o.revenueRevision||0)+1}], [ds,{revenue:0,dividend:0,retained:0,perShare:0,treasuryDividend:0,correctionId:id}]);
  }
  for(const [uid,amount] of debits){if(!amount)continue;const a=await t.get(db.doc('sparkAccounts/'+uid)),v=a.data();if(!v||!Number.isSafeInteger(v.cash)||v.cash<amount)throw Error('Dividend already spent; correction requires review');changes.push([a,{cash:v.cash-amount,version:v.version+1}]);}
  if(changes.length>240)throw Error('Correction exceeds atomic backup capacity');
  for(const [s,patch] of changes){t.set(root.collection('documents').doc(Buffer.from(s.ref.path).toString('base64url')),{path:s.ref.path,data:s.data()});t.update(s.ref,patch);}
  t.set(root,{status:'complete',day,companies:candidates.length,reversedRevenue:revenue,reversedDividends:dividends,completedAt:FieldValue.serverTimestamp()});
  return {status:'corrected',companies:candidates.length,reversedRevenue:revenue,reversedDividends:dividends};
 });
}

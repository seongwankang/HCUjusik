import {FieldValue} from 'firebase-admin/firestore';
import {priceLimits,priceLimitDay,withinPriceLimits} from '../client/daily-price-limits.js';
import {nextSmoothedPrice,QUOTE_MODEL} from '../client/smoothed-price.js';
import {emptyIndexes} from '../client/order-index.js';
import {cancelSpark} from '../client/spark-exchange.js';

// After 21:00 prepare tomorrow. Before then always exclude today's fills,
// even when a delayed scheduled job starts after 08:00.
export function limitSession(now){
 const day=priceLimitDay(now),minute=((Math.floor(now/60000)+540)%1440+1440)%1440;
 const target=day+(minute>=1260?1:0);
 return {day:target,cutoff:target*86400000-32400000-10800000};
}
export async function closingQuote(db,cid,book,cutoff,old){
 const a=book.displayPriceAnchor,anchorKey=a?a.version+':'+a.price:'',anchorTime=a?.appliedAt?.toMillis?.()??book.updatedAt?.toMillis?.();
 const anchor=a&&Number.isSafeInteger(a.version)&&a.version<=book.version&&a.price>0&&a.price%100===0&&(old?.anchorKey===anchorKey||anchorTime<cutoff)?a:null;
 const key=anchor?anchor.version+':'+anchor.price:'';
 const valid=old&&old.model===QUOTE_MODEL&&old.referencePrice===book.initialPrice&&old.correctionRevision===(book.correctionRevision||0)&&old.anchorKey===key&&old.cutoff<=cutoff&&old.version<=book.version;
 let state=valid?{...old}:{model:QUOTE_MODEL,referencePrice:book.initialPrice,correctionRevision:book.correctionRevision||0,anchorKey:key,value:anchor?.price||book.initialPrice,count:0,version:anchor?.version??-1};
 let done=false;
 while(!done){
  const page=await db.collection('sparkBooks/'+cid+'/trades').where('marketVersion','>',state.version).orderBy('marketVersion').limit(100).get();
  for(const row of page.docs){const t=row.data();
   if(!t.createdAt?.toMillis||!Number.isSafeInteger(t.marketVersion))throw Error('Invalid closing trade');
   if(t.createdAt.toMillis()>=cutoff){done=true;break;}
   if(!Number.isSafeInteger(t.quantity)||t.quantity<1)throw Error('Invalid closing trade quantity');
   state.value=nextSmoothedPrice(state.value,t.price,t.quantity);state.count+=t.quantity;state.version=t.marketVersion;
  }
  if(page.size<100)done=true;
 }
 return {...state,cutoff,price:Math.max(100,Math.round(state.value/100)*100)};
}
export async function publishDailyPriceLimits(db,{now=Date.now(),cancel=cancelSpark}={}){
 if((await db.doc('systemMaintenance/reset').get()).exists)return {updated:0,cancelled:0,maintenance:true};
 const session=limitSession(now),companies=await db.collection('companies').get(),result={updated:0,cancelled:0};
 const tomorrow=session.day>priceLimitDay(now);
 for(const company of companies.docs){
  if(!['listed','paused'].includes(company.data().status))continue;
  const bookRef=db.doc('sparkBooks/'+company.id),snapshot=await bookRef.get();
  let book=snapshot.data();
  if(!book){book={...emptyIndexes(),initialPrice:company.data().referencePrice,issuedShares:company.data().issuedShares,treasuryShares:company.data().issuedShares,issuerCash:0,lastPrice:0,orders:[],version:0,lastAction:{kind:'init',actor:'daily-price-limits'},updatedAt:FieldValue.serverTimestamp()};await bookRef.set(book);}
  if((tomorrow?book.nextPriceLimits:book.priceLimits)?.day===session.day)continue;
  const stateRef=db.doc('marketQuoteState/'+company.id),state=await closingQuote(db,company.id,book,session.cutoff,(await stateRef.get()).data());
  const limits=priceLimits(state.price,session.day);
  // Expire only orders outside the new band. Existing cancellation transactions
  // release exactly the remaining reserved cash/shares, including partial fills.
  if(!tomorrow)for(const order of book.orders)if(!withinPriceLimits(order.price,limits)){await cancel(db,'daily-price-limits',{companyId:company.id,orderId:order.id,ownerUid:order.uid});result.cancelled++;}
  const batch=db.batch();batch.set(stateRef,state);batch.update(bookRef,tomorrow?{nextPriceLimits:limits}:{priceLimits:limits,nextPriceLimits:FieldValue.delete()});await batch.commit();result.updated++;
 }
 return result;
}

import {doc,onSnapshot} from 'firebase/firestore';
import {withMedianPrice} from './median-price.js';
export function companyQuote(company,book){
 const last=book&&Object.hasOwn(book,'displayPrice')?book.displayPrice:book?.lastPrice;
 if(last!==undefined&&(!Number.isSafeInteger(last)||last<0))return {currentPrice:null,quoteKind:'error'};
 if(last>0)return {currentPrice:last,quoteKind:book?.displayInitial?'initial':'traded'};
 return Number.isSafeInteger(company.referencePrice)&&company.referencePrice>0?{currentPrice:company.referencePrice,quoteKind:'initial'}:{currentPrice:null,quoteKind:'error'};
}
export function subscribeQuotes(db,companies,update,reads){
 let active=true;
 const stops=companies.filter(c=>/^[A-Za-z0-9_-]{1,128}$/.test(c.id)).map(c=>{
  let revision=0;const error=()=>{if(active)update(c.id,{currentPrice:null,quoteKind:'error'});};
  const next=async s=>{if(s.metadata.hasPendingWrites)return;const current=++revision;try{const book=await withMedianPrice(db,c,s.exists()?s.data():null);if(active&&current===revision)update(c.id,companyQuote(c,book));}catch{if(current===revision)error();}};
  return reads?reads.watchDoc('sparkBooks/'+c.id,next,error):onSnapshot(doc(db,'sparkBooks',c.id),{includeMetadataChanges:true},next,error);
 });
 return ()=>{active=false;stops.forEach(stop=>stop());};
}

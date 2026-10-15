import {doc,onSnapshot} from 'firebase/firestore';
export function companyQuote(company,book){
 const last=book?.lastPrice;
 if(last!==undefined&&(!Number.isSafeInteger(last)||last<0))return {currentPrice:null,quoteKind:'error'};
 if(last>0)return {currentPrice:last,quoteKind:'traded'};
 return Number.isSafeInteger(company.referencePrice)&&company.referencePrice>0?{currentPrice:company.referencePrice,quoteKind:'initial'}:{currentPrice:null,quoteKind:'error'};
}
export function subscribeQuotes(db,companies,update){
 const stops=companies.filter(c=>/^[A-Za-z0-9_-]{1,128}$/.test(c.id)).map(c=>onSnapshot(doc(db,'sparkBooks',c.id),{includeMetadataChanges:true},s=>{if(!s.metadata.hasPendingWrites)update(c.id,companyQuote(c,s.exists()?s.data():null));},()=>update(c.id,{currentPrice:null,quoteKind:'error'})));
 return ()=>stops.forEach(stop=>stop());
}

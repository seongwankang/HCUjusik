import {FieldValue} from 'firebase-admin/firestore';
// Invalidate the trusted daily band. Existing published Rules then reject
// place/fill even from an already-open browser; cancellations remain allowed.
export async function closeMarket(db){
 const books=await db.collection('sparkBooks').get();let closed=0;
 for(const book of books.docs){
  await db.runTransaction(async t=>{
   const ref=db.doc('sparkBooks/'+book.id),receipt=db.doc('marketClosures/manual-2026-10-22/books/'+book.id);
   const [s,r]=await Promise.all([t.get(ref),t.get(receipt)]);if(!s.exists)return;
   const b=s.data();if(b.priceLimits?.day===-1&&!b.nextPriceLimits)return;
   if(!r.exists)t.set(receipt,{priceLimits:b.priceLimits||null,nextPriceLimits:b.nextPriceLimits||null,createdAt:FieldValue.serverTimestamp()});
   t.update(ref,{priceLimits:{day:-1,referencePrice:10000,lower:5000,upper:20000},nextPriceLimits:FieldValue.delete()});closed++;
  });
 }
 await db.doc('marketClosures/manual-2026-10-22').set({closed:true,checkedAt:FieldValue.serverTimestamp()},{merge:true});
 return {closed,books:books.size};
}

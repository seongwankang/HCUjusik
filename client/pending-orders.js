import {collection,getDocs,query,where,orderBy,documentId,limit,startAfter} from 'firebase/firestore';
export async function openBuyOrders(db,uid,reads){
 const read=reads?.getDocs||getDocs,scope='sparkAccounts/'+uid+'/orders';let cursor=null;const rows=new Map();
 for(;;){const page=await read(query(collection(db,scope),where('status','==','open'),orderBy(documentId()),limit(30),...(cursor?[startAfter(cursor)]:[])),scope);
  for(const d of page.docs){const o=d.data();if(o.side==='buy'&&o.status==='open'&&o.remaining>0)rows.set(d.id,{...o,orderId:d.id});}
  if(page.size<30)return [...rows.values()];cursor=page.docs.at(-1);
 }
}
export function pendingBuyRows(orders,companies){
 const groups=new Map();
 for(const o of orders){if(o.side!=='buy'||o.status!=='open'||!o.remaining)continue;
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(o.companyId)||!Number.isSafeInteger(o.price)||o.price<1||o.price>1000000||!Number.isSafeInteger(o.remaining)||o.remaining<1||o.remaining>1000000)throw Error('매수 대기 주문을 확인하세요.');
  const key=o.companyId+':'+o.price,c=companies[o.companyId],row=groups.get(key)||{companyId:o.companyId,name:c?.name||o.companyId,ticker:c?.ticker||o.companyId,price:o.price,quantity:0,reservedAmount:0};row.quantity+=o.remaining;row.reservedAmount+=o.price*o.remaining;
  if(!Number.isSafeInteger(row.quantity)||!Number.isSafeInteger(row.reservedAmount))throw Error('매수 대기 수량을 확인하세요.');groups.set(key,row);
 }
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko')||b.price-a.price);
}

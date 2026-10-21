import {collection,getDocs,query,where,orderBy,limit} from 'firebase/firestore';
export function medianTradePrice(rows){
 if(!rows.length)return null;
 const prices=rows.slice(0,100).map(r=>r.price);
 if(prices.some(p=>!Number.isSafeInteger(p)||p<=0||p>1000000))throw Error('체결 가격을 확인하세요.');
 prices.sort((a,b)=>a-b);const mid=Math.floor(prices.length/2);
 return Math.round((prices.length%2?prices[mid]:(prices[mid-1]+prices[mid])/2)/100)*100;
}
export function createMedianReader(fetchRows,storage){
 const cache=new Map(),queues=new Map();
 return function read(cid,book={}){
  const task=(queues.get(cid)||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(!Number.isSafeInteger(book.version)||book.version<0)throw Error('호가 버전을 확인하세요.');
   let old=cache.get(cid);if(!old&&storage)try{old=await storage.get(cid);}catch{}
   if(old&&(!Number.isSafeInteger(old.version)||!Array.isArray(old.rows)||old.rows.length>100||old.rows.some(r=>!Number.isSafeInteger(r.marketVersion)||r.marketVersion>old.version)))old=null;
   if(old&&old.version>book.version)old=null; // Market reset.
   if(!old||old.version!==book.version){
    // Exactly one intervening order/cancel cannot conceal a fill. A larger gap
    // is checked even if the most recent action was not itself a fill.
    const orderOnly=old&&book.version===old.version+1&&['place','cancel'].includes(book.lastAction?.kind);
    const fresh=orderOnly?[]:await fetchRows(cid,old?.version);
    if(fresh.some(r=>!Number.isSafeInteger(r.marketVersion)||r.marketVersion<0))throw Error('체결 순서를 확인하세요.');
    const rows=[...fresh,...(old?.rows||[])].sort((a,b)=>b.marketVersion-a.marketVersion).filter((r,i,a)=>i===0||r.marketVersion!==a[i-1].marketVersion).slice(0,100);
    // Do not cache a query that overtook its book snapshot. The next confirmed
    // book notification will fetch a consistent window.
    if(rows.some(r=>r.marketVersion>book.version))throw Error('시세 갱신 중입니다.');
    old={version:book.version,rows};medianTradePrice(rows);cache.set(cid,old);if(storage)try{await storage.set(cid,old);}catch{}
   }
   return medianTradePrice(old.rows);
  });queues.set(cid,task);return task;
 };
}
const readers=new WeakMap();
export function medianReader(db){
 if(!readers.has(db)){
  const prefix='hcujusik-median-v1:'+db.app?.options?.projectId+':';
  const storage=typeof localStorage==='undefined'?null:{get:async id=>{const raw=localStorage.getItem(prefix+id);return raw?JSON.parse(raw):null;},set:async(id,v)=>localStorage.setItem(prefix+id,JSON.stringify(v))};
  readers.set(db,createMedianReader(async(cid,since)=>{
   const page=await getDocs(query(collection(db,'sparkBooks',cid,'trades'),...(since===undefined?[]:[where('marketVersion','>',since)]),orderBy('marketVersion','desc'),limit(100)));
   return page.docs.map(s=>({price:s.data().price,marketVersion:s.data().marketVersion}));
  },storage));
 }
 return readers.get(db);
}
export async function withMedianPrice(db,company,book){
 if(!book||book.lastPrice===0&&book.version===undefined)return {...book,displayPrice:company.referencePrice,displayInitial:true};
 const price=await medianReader(db)(company.id,book);
 return {...book,displayPrice:price??company.referencePrice,displayInitial:price===null};
}

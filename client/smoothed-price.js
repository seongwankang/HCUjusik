import {collection,getDocs,query,where,orderBy,limit} from 'firebase/firestore';
const validPrice=p=>Number.isFinite(p)&&p>0&&p<=1000000;
export function nextSmoothedPrice(previous,price){
 if(!validPrice(previous)||!Number.isSafeInteger(price)||!validPrice(price))throw Error('체결 가격을 확인하세요.');
 return previous*.9+price*.1;
}
// Replay every fill in sequence, once. Persist only the unrounded accumulator
// and processed book version; refreshing never starts the average over again.
export function createSmoothedReader(fetchPage,storage){
 const cache=new Map(),queues=new Map();
 return function read(cid,book={},referencePrice){
  const task=(queues.get(cid)||Promise.resolve()).catch(()=>{}).then(async()=>{
   if(!Number.isSafeInteger(book.version)||book.version<0||!Number.isSafeInteger(referencePrice)||!validPrice(referencePrice))throw Error('기준가 정보를 확인하세요.');
   let old=cache.get(cid);if(!old&&storage)try{old=await storage.get(cid);}catch{}
   if(!old||old.referencePrice!==referencePrice||old.correctionRevision!==(book.correctionRevision||0)||!Number.isSafeInteger(old.version)||old.version<0||old.version>book.version||!validPrice(old.value)||!Number.isSafeInteger(old.count)||old.count<0)old={referencePrice,value:referencePrice,count:0,version:-1,correctionRevision:book.correctionRevision||0};
   if(old.version!==book.version){
    const state={...old};
    const orderOnly=book.version===old.version+1&&['place','cancel'].includes(book.lastAction?.kind);
    if(!orderOnly){let cursor=old.version;for(;;){
     const rows=await fetchPage(cid,cursor,book.version);
     if(rows.length>100)throw Error('체결 조회 범위를 확인하세요.');
     for(const row of rows){
      if(!Number.isSafeInteger(row.marketVersion)||row.marketVersion<=cursor||row.marketVersion>book.version)throw Error('체결 순서를 확인하세요.');
      state.value=nextSmoothedPrice(state.value,row.price);state.count++;cursor=row.marketVersion;
     }
     if(rows.length<100)break;
    }}
    state.version=book.version;cache.set(cid,state);old=state;if(storage)try{await storage.set(cid,state);}catch{}
   }
   return {price:Math.round(old.value/100)*100,initial:old.count===0};
  });queues.set(cid,task);return task;
 };
}
const readers=new WeakMap();
export function smoothedReader(db){
 if(!readers.has(db)){
  const prefix='hcujusik-ema90-v1:'+db.app?.options?.projectId+':';
  const storage=typeof localStorage==='undefined'?null:{get:async id=>{const raw=localStorage.getItem(prefix+id);return raw?JSON.parse(raw):null;},set:async(id,state)=>localStorage.setItem(prefix+id,JSON.stringify(state))};
  readers.set(db,createSmoothedReader(async(cid,since,through)=>{
   const page=await getDocs(query(collection(db,'sparkBooks',cid,'trades'),where('marketVersion','>',since),where('marketVersion','<=',through),orderBy('marketVersion'),limit(100)));
   return page.docs.map(s=>({price:s.data().price,marketVersion:s.data().marketVersion}));
  },storage));
 }
 return readers.get(db);
}
export async function withSmoothedPrice(db,company,book){
 if(!book||book.lastPrice===0&&book.version===undefined)return {...book,displayPrice:company.referencePrice,displayInitial:true};
 const {price,initial}=await smoothedReader(db)(company.id,book,company.referencePrice);
 return {...book,displayPrice:price,displayInitial:initial};
}

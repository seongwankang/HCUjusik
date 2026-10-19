import {Timestamp} from 'firebase/firestore';
const encode=v=>v instanceof Timestamp?{__immutableTime:[v.seconds,v.nanoseconds]}:Array.isArray(v)?v.map(encode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)])):v;
const decode=v=>v&&typeof v==='object'&&Object.keys(v).length===1&&Array.isArray(v.__immutableTime)?new Timestamp(...v.__immutableTime):Array.isArray(v)?v.map(decode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])):v;
// Only historical records go here. Authentication, live balances and permissions do not.
export function historyStorage(projectId,indexedDB=globalThis.indexedDB){
 if(!indexedDB)return null;
 let owner=null,opening;
 const open=()=>opening||=new Promise(resolve=>{try{const r=indexedDB.open('chung-un-history-'+projectId+'-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>db.close();resolve(db);};r.onerror=r.onblocked=()=>resolve(null);}catch{resolve(null);}});
 const get=async key=>{try{const db=await open();if(!db)return;return await new Promise(resolve=>{const r=db.transaction('records').objectStore('records').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve();});}catch{return;}};
 const setOwner=async uid=>{owner=uid;try{const db=await open();if(!db)return false;return await new Promise(resolve=>{const tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.get('__owner');let changed=false;r.onsuccess=()=>{if(r.result!==uid){changed=true;s.clear();s.put(uid,'__owner');}};tx.oncomplete=()=>resolve(changed);tx.onerror=tx.onabort=()=>resolve(false);});}catch{return false;}};
 return {
  async get(key){const value=await get(key);if(!value||value.owner!==owner||value.schema!==1)return;try{return decode(value.data);}catch{return;}},
  async set(key,data){const expected=owner;if(!expected)return;try{const db=await open();if(!db)return;const value=encode(data);await new Promise(resolve=>{const tx=db.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.get('__owner');r.onsuccess=()=>{if(r.result===expected)s.put({schema:1,owner:expected,data:value},key);};tx.oncomplete=tx.onabort=tx.onerror=resolve;});}catch{/* Quota/private-mode failures fall back to the in-memory cache. */}},
  setOwner,
  async clear(){await setOwner(null);}
 };
}

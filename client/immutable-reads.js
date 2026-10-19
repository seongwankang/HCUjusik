import {collection,getDocs,query,orderBy,documentId,where,limit,startAfter} from 'firebase/firestore';
import {createImmutableReader} from './immutable-reader.js';
import {historyStorage} from './history-storage.js';
const readers=new WeakMap(),stores=new WeakMap(),owners=new WeakMap();
function storeFor(db){if(!stores.has(db))stores.set(db,historyStorage(db.app?.options?.projectId||'default'));return stores.get(db);}
export function immutableRows(db,path,{persistent=false,...options}){
 let group=readers.get(db);if(!group){group={};readers.set(db,group);}const mode=persistent?'view':'authoritative';
 let read=group[mode];if(!read){
  read=createImmutableReader(async(path,{field,pageSize,since,cursor})=>{
   // Inclusive watermark preserves different documents sharing one timestamp.
   const page=await getDocs(query(collection(db,path),orderBy(field,'desc'),orderBy(documentId(),'desc'),...(since===undefined?[]:[where(field,'>=',since)]),limit(pageSize),...(cursor?[startAfter(cursor)]:[])));
   return {rows:page.docs.map(d=>({...d.data(),id:d.id})),more:page.size===pageSize,cursor:page.docs.at(-1)};
  },persistent?{
   get:key=>storeFor(db)?.get(key)||Promise.resolve(),
   // A request started by the previous account may finish after sign-out.
   set:(key,data)=>readers.get(db)===group?storeFor(db)?.set(key,data)||Promise.resolve():Promise.resolve(),
  }:null);group[mode]=read;
 }
 return read(path,options);
}
export async function setHistoryOwner(db,uid){if(owners.get(db)!==uid){readers.delete(db);owners.set(db,uid);}if(await storeFor(db)?.setOwner(uid))readers.delete(db);}
export async function clearImmutableRows(db){readers.delete(db);owners.delete(db);await storeFor(db)?.clear();}

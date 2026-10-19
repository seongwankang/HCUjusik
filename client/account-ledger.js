import {doc,getDoc} from 'firebase/firestore';
import {immutableRows} from './immutable-reads.js';
import {acquisitionCosts} from './acquisition-cost.js';
const caches=new WeakMap();
export async function accountLedger(db,uid,reads){
 const readDoc=reads?.getDoc||getDoc;
 let cache=caches.get(db);if(!cache){cache=new Map();caches.set(db,cache);}
 for(let attempt=0;attempt<3;attempt++){
  const before=(await readDoc(doc(db,'sparkAccounts',uid))).data();if(!before)return {account:null,fills:[],costBasis:{}};
  const hit=cache.get(uid);if(hit?.version===before.version)return {...hit.value,account:before};
  const fills=await immutableRows(db,'sparkAccounts/'+uid+'/fills',{field:'createdAt',pageSize:30,revision:before.version,persistent:true});
  const after=(await getDoc(doc(db,'sparkAccounts',uid))).data();if(after?.version!==before.version)continue;
  const ordered=fills.toSorted((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)||b.marketVersion-a.marketVersion||a.id.localeCompare(b.id));
  const value={account:after,fills:ordered,costBasis:acquisitionCosts(fills,after.positions)};cache.set(uid,{version:after.version,value});return value;
 }
 throw Error('새 체결 내역이 반영 중입니다. 잠시 후 새로고침해 주세요.');
}

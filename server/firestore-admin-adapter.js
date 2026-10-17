// Node-only adapter: reuse the tested client accounting transactions with IAM.
import {FieldValue,FieldPath,Timestamp} from 'firebase-admin/firestore';
export {FieldPath,Timestamp};
const snap=s=>({id:s.id,ref:s.ref,raw:s,exists:()=>s.exists,data:()=>s.data()});
export const doc=(db,...path)=>db.doc(path.join('/'));
export const collection=(db,...path)=>db.collection(path.join('/'));
export const getDoc=async ref=>snap(await ref.get());
export const getDocs=async ref=>{const s=await ref.get();return {size:s.size,empty:s.empty,docs:s.docs.map(snap)};};
export const setDoc=(ref,data,options)=>options?ref.set(data,options):ref.set(data);
export const updateDoc=(ref,data)=>ref.update(data);
export const query=(ref,...constraints)=>constraints.reduce((q,apply)=>apply(q),ref);
export const where=(...args)=>q=>q.where(...args);
export const orderBy=(...args)=>q=>q.orderBy(...args);
export const limit=n=>q=>q.limit(n);
export const startAfter=cursor=>q=>q.startAfter(cursor.raw||cursor);
export const documentId=()=>FieldPath.documentId();
export const serverTimestamp=()=>FieldValue.serverTimestamp();
export const writeBatch=db=>db.batch();
export const runTransaction=(db,callback)=>db.runTransaction(t=>callback({get:async ref=>snap(await t.get(ref)),set:(...args)=>t.set(...args),update:(...args)=>t.update(...args),delete:(...args)=>t.delete(...args)}));

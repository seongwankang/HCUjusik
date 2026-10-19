import {doc,onSnapshot,getDoc,getDocs,queryEqual} from 'firebase/firestore';
import {createLiveReader} from './live-reader.js';
export function createViewReads(db,onChange=()=>{}){
 const queries=[];
 const key=ref=>{if(ref.type==='document')return 'doc:'+ref.path;let i=queries.findIndex(q=>queryEqual(q,ref));if(i<0){i=queries.length;queries.push(ref);}return 'query:'+i;};
 const reader=createLiveReader({onChange:(key,ref)=>onChange(ref.type==='document'?ref.path:'*'),
  fingerprint:s=>JSON.stringify(s.docs?s.docs.map(d=>[d.id,d.data()]):[s.exists(),s.data()]),
  // Receive server acknowledgements even when only metadata changed after our write.
  // Initial SDK cache data alone cannot confirm this account's read permissions.
  subscribe:(ref,next,error)=>onSnapshot(ref,{includeMetadataChanges:true},s=>{if(!s.metadata.hasPendingWrites&&!s.metadata.fromCache)next(s);},error),
 });
 return {
  getDoc:ref=>reader.read(key(ref),ref),getDocs:ref=>reader.read(key(ref),ref),
  watchDoc:(path,fn,error)=>{const ref=doc(db,path);return reader.watch(key(ref),ref,fn,error);},
  // After an explicit user refresh or mutation, confirm watched mutable sources.
  refresh:paths=>reader.refresh((k,ref)=>paths.some(path=>path==='*'||ref.path===path||ref.path?.startsWith(path+'/')),ref=>ref.type==='document'?getDoc(ref):getDocs(ref)),
  clear:()=>{reader.clear();queries.length=0;},
 };
}

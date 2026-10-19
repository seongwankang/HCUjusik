// Immutable priority entries keep partial fills in their original queue position.
export const priorityEntry=({uid,id,side,price,quantity,sequence})=>({uid,id,side,price,quantity,sequence});
export const before=(a,b,side)=>side==='initial'?a.sequence<b.sequence:(a.price===b.price?a.sequence<b.sequence:side==='buy'?a.price>b.price:a.price<b.price);
const split=(list,e,side)=>{const at=list.findIndex(x=>before(e,x,side));return at<0?[list,[]]:[list.slice(0,at),list.slice(at)];};
export const emptyIndexes=()=>({indexVersion:2,indexCursor:0,bidIndex:[],askIndex:[],initialIndex:[],ownerBids:{},ownerAsks:{}});
export function insertIndexes(book,entry){
 const e=priorityEntry(entry),buy=e.side==='buy',key=buy?'bidIndex':'askIndex',ownKey=buy?'ownerBids':'ownerAsks';
 const [prefix,suffix]=split(book[key],e,e.side),[ownPrefix,ownSuffix]=split(book[ownKey][e.uid]||[],e,e.side),eligible=buy&&e.price>=book.initialPrice;
 const [initialPrefix,initialSuffix]=eligible?split(book.initialIndex,e,'initial'):[[],[]];
 return {patch:{[key]:[...prefix,e,...suffix],[ownKey]:{...book[ownKey],[e.uid]:[...ownPrefix,e,...ownSuffix]},...(eligible?{initialIndex:[...initialPrefix,e,...initialSuffix]}:{})},proof:{prefix,suffix,ownPrefix,ownSuffix,initialPrefix,initialSuffix}};
}
export function removeIndexes(book,entries){
 const patch={bidIndex:book.bidIndex,askIndex:book.askIndex,initialIndex:book.initialIndex,ownerBids:{...book.ownerBids},ownerAsks:{...book.ownerAsks}};
 for(const e of entries){if(e.id==='issuer')continue;const key=e.side==='buy'?'bidIndex':'askIndex',own=e.side==='buy'?'ownerBids':'ownerAsks',keep=x=>x.uid!==e.uid||x.id!==e.id;patch[key]=patch[key].filter(keep);patch.initialIndex=patch.initialIndex.filter(keep);patch[own][e.uid]=(patch[own][e.uid]||[]).filter(keep);if(!patch[own][e.uid].length)delete patch[own][e.uid];}
 return patch;
}

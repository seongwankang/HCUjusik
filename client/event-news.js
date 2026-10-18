import {doc,getDoc,runTransaction,serverTimestamp} from 'firebase/firestore';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;

export async function eventNewsId(eventId){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('event-news:'+eventId));
 return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function eventNewsSummary(event,companies,choices,receipts,outcomes){
 const groups=outcomes.map((effect,i)=>({label:event.type==='choice'?event.options[i]:'발생 효과',effect,companies:[]})),unselected=[];
 for(const id of event.targets){
  const name=companies[id]?.name||id,option=event.type==='choice'?choices[id]?.option:0;
  if(!Number.isInteger(option)||!groups[option]){unselected.push(name);continue;}
  const receipt=receipts[id],result=receipt?.result;
  groups[option].companies.push({companyId:id,name,status:receipt?'applied':'pending',result:Number.isSafeInteger(result?.amount)?{amount:result.amount}:Number.isSafeInteger(result?.count)?{count:result.count}:null});
 }
 return {type:event.type,groups,unselected};
}
export function mergeEventNews(previous,next){
 const completed=new Map((previous?.groups||[]).flatMap(g=>g.companies||[]).filter(c=>c.status==='applied').map(c=>[c.companyId,c]));
 return {...next,groups:next.groups.map(g=>({...g,companies:g.companies.map(c=>c.status==='pending'&&completed.has(c.companyId)?{...c,status:'applied',result:completed.get(c.companyId).result}:c)}))};
}
export async function publishEventNews(db,eid){
 const event=(await getDoc(doc(db,'events',eid))).data();
 if(!event?.autoNews)return;
 if(event.type==='choice'&&event.endsAt.toMillis()>Date.now())throw Error('선택 마감 후 결과 뉴스를 게시할 수 있습니다.');
 const companies={},choices={},receipts={};
 const outcomes=await Promise.all(Array.from({length:event.type==='choice'?3:1},async(_,i)=>{
  const effect=(await getDoc(doc(db,'eventOutcomes',eid,'options',String(i)))).data()?.effect;
  if(!effect)throw Error('뉴스에 표시할 이벤트 결과가 없습니다.');return effect;
 }));
 await Promise.all(event.targets.map(async cid=>{
  const [company,receipt,choice]=await Promise.all([getDoc(doc(db,'companies',cid)),getDoc(doc(db,'companyEffects',cid,'items',eid)),event.type==='choice'?getDoc(doc(db,'companyChoices',cid,'items',eid)):null]);
  companies[cid]=company.data();receipts[cid]=receipt.data();if(choice)choices[cid]=choice.data();
 }));
 const summary=eventNewsSummary(event,companies,choices,receipts,outcomes),id=await eventNewsId(eid);
 await runTransaction(db,async t=>{
  const ref=doc(db,'news',id),old=await t.get(ref);
  if(old.exists()){
   if(old.data().eventId!==eid)throw Error('동일 뉴스 주소에 다른 게시물이 있습니다.');
   // A slower concurrent retry must never turn a completed row back to pending.
   const merged=mergeEventNews(old.data().eventSummary,summary);
   if(JSON.stringify(canonical(old.data().eventSummary))!==JSON.stringify(canonical(merged)))t.update(ref,{eventSummary:merged});
  }else t.set(ref,{title:(event.type==='choice'?'[선택 결과] ':'[이벤트] ')+event.title.slice(0,110),content:event.content,category:'이벤트',companyId:'',companyName:'',publishedAt:serverTimestamp(),eventId:eid,eventSummary:summary});
 });
 return id;
}

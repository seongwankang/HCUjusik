import {doc,getDoc,getDocs,collection,query,limit,orderBy,startAfter,runTransaction,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {validateEffect,destruction,requireProduction,adjustedRevenue} from './event-model.js';
const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const fail=s=>{throw new Error(s);};
export async function effectRecords(db,cid){
 // Page through all receipts: no silent 100-event cutoff in accounting.
 let cursor=null,rows=[];for(;;){const page=await getDocs(query(collection(db,'companyEffects',cid,'items'),orderBy('__name__'),limit(100),...(cursor?[startAfter(cursor)]:[])));rows.push(...page.docs.map(s=>({id:s.id,...s.data()})));if(page.size<100)return rows;cursor=page.docs.at(-1);}
}
export async function publishEvent(db,b){
 if(!valid(b.id)||!['random','choice'].includes(b.type))fail('이벤트 종류를 확인하세요.');
 const title=String(b.title||'').trim(),content=String(b.content||'').trim();
 if(!title||title.length>120||!content||content.length>5000)fail('제목과 상황 설명을 입력하세요.');
 const companies=(await getDocs(query(collection(db,'companies'),limit(100)))).docs;
 const targets=b.type==='choice'||!b.companyId?companies.map(s=>s.id):[b.companyId];
 if(!targets.length||targets.some(id=>!companies.some(s=>s.id===id)))fail('대상 기업을 확인하세요.');
 const deadline=Timestamp.fromDate(new Date(b.deadline));if(!Number.isFinite(deadline.toMillis())||deadline.toMillis()<=Date.now())fail('미래의 선택 마감 시간을 입력하세요.');
 const labels=b.type==='choice'?b.options?.map(o=>String(o.label||'').trim()):[];
 if(b.type==='choice'&&(labels?.length!==3||labels.some(l=>!l||l.length>200)))fail('선택지 3개를 각각 200자 이내로 입력하세요.');
 const effects=b.type==='choice'?b.options.map(o=>validateEffect(o.effect)):[validateEffect(b.effect)];
 const ref=doc(db,'events',b.id);if((await getDoc(ref)).exists())fail('이미 발행한 이벤트입니다. 적용 상태를 조회하세요.');
 const batch=writeBatch(db);
 batch.set(ref,{type:b.type,title,content,companyId:b.companyId||'',targets,options:labels,startsAt:serverTimestamp(),endsAt:deadline});
 effects.forEach((effect,i)=>batch.set(doc(db,'eventOutcomes',b.id,'options',String(i)),{effect}));
 await batch.commit();return {id:b.id};
}
export async function chooseEvent(db,cid,eid,option){
 if(!valid(cid)||!valid(eid)||!Number.isInteger(option)||option<0||option>2)fail('기업과 선택지를 확인하세요.');
 await runTransaction(db,async t=>{const ref=doc(db,'companyChoices',cid,'items',eid),[old,os]=await Promise.all([t.get(ref),t.get(doc(db,'companyOperations',cid))]);if(old.exists()){if(old.data().option!==option)fail('이미 선택했습니다. 선택은 변경할 수 없습니다.');return;}if(!os.exists())fail('회사 계좌를 먼저 준비하세요.');if(os.data().locked)fail('배당 정산 완료 후 선택하세요.');if(os.data().pendingEvent)fail('이전에 선택한 이벤트 결과를 먼저 적용하세요.');t.set(ref,{option,chosenAt:serverTimestamp()});t.update(doc(db,'companyOperations',cid),{pendingEvent:eid});});
 // Separate commit is intentional. Rules use get(), not getAfter(), to keep
 // unrevealed alternatives unreadable even in an attempted atomic preview.
 return applyEvent(db,cid,eid,option);
}
export async function applyEvent(db,cid,eid,option=0){
 if(!valid(cid)||!valid(eid))fail('이벤트 주소를 확인하세요.');
 return runTransaction(db,async t=>{
  const receipt=doc(db,'companyEffects',cid,'items',eid),ops=doc(db,'companyOperations',cid);
  const [old,event,os]=await Promise.all([t.get(receipt),t.get(doc(db,'events',eid)),t.get(ops)]);
  if(old.exists())return {applied:true};if(!event.exists())fail('이벤트가 없습니다.');
  const n=event.data();if(!n.targets.includes(cid))fail('대상 기업이 아닙니다.');
  const selected=n.type==='choice'?await t.get(doc(db,'companyChoices',cid,'items',eid)):null;
  const outcome=await t.get(doc(db,'eventOutcomes',eid,'options',String(option)));const effect=outcome.data()?.effect;if(!effect)fail('이벤트 결과가 없습니다.');
  if(os.exists()&&['destroy','efficiency'].includes(effect.kind))requireProduction(os.data());
  if(os.exists()&&os.data().locked)fail('배당 정산 완료 후 결과 적용을 다시 눌러 주세요. 선택은 저장되어 있습니다.');
  if(os.exists())t.update(ops,{...(effect.kind==='destroy'?destruction(os.data(),effect):{}),lastEvent:eid,...(n.type==='choice'?{pendingEvent:''}:{})});
  t.set(receipt,{option,effect,appliedAt:serverTimestamp(),effectiveAt:n.type==='choice'?selected.data().chosenAt:n.startsAt});return {applied:true};
 });
}
export async function eventCompanyView(db,cid){
 if(!valid(cid))fail('기업을 선택하세요.');
 const [events,effects]=await Promise.all([getDocs(query(collection(db,'events'),orderBy('startsAt','desc'),limit(100))),effectRecords(db,cid)]);
 const choices=await Promise.all(events.docs.filter(s=>s.data().type==='choice'&&s.data().targets.includes(cid)).map(async s=>{const c=await getDoc(doc(db,'companyChoices',cid,'items',s.id));return {id:s.id,...s.data(),choice:c.exists()?c.data():null};}));
 const os=await getDoc(doc(db,'companyOperations',cid));const projection=os.exists()?adjustedRevenue(os.data(),Math.floor((Date.now()+32400000)/86400000),effects):{base:0,revenue:0};
 return {choices,effects:effects.map(r=>({...r,title:events.docs.find(e=>e.id===r.id)?.data().title||r.id})),projection};
}
export async function applyRandomEvent(db,eid){
 const s=await getDoc(doc(db,'events',eid));if(!s.exists()||s.data().type!=='random')fail('랜덤 이벤트를 선택하세요.');
 const failed=[];let applied=0;for(const cid of s.data().targets){try{await applyEvent(db,cid,eid);applied++;}catch(e){failed.push({companyId:cid,message:e.message});}}
 return {applied,failed};
}

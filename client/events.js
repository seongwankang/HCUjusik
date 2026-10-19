import {immutableRows} from './immutable-reads.js';
import {publishEventNews,validateEventNews} from './event-news.js';
import {doc,getDoc,getDocs,collection,query,limit,orderBy,startAfter,runTransaction,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {revenueEffects,validateEffect,eventMutation,NEW_EFFECTS,currentEffect,remainingSettlements,requireProduction,adjustedRevenue,needsProduction} from './event-model.js';
import {effectiveConfig} from './business-policy.js';
import {initializeOperations} from './economy.js';
import {nextSettlement} from './settlement-time.js';
import {eventTargets} from './event-targets.js';
const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const fail=s=>{throw new Error(s);};
export function effectRecords(db,cid,options={}){
 return immutableRows(db,'companyEffects/'+cid+'/items',{field:'appliedAt',pageSize:100,...options});
}
export async function publishEvent(db,b){
 if(!valid(b.id)||!['random','choice'].includes(b.type))fail('이벤트 종류를 확인하세요.');
 const title=String(b.title||'').trim(),content=String(b.content||'').trim();
 if(!title||title.length>120||!content||content.length>5000)fail('제목과 상황 설명을 입력하세요.');
 const news=validateEventNews(b.news);
 const companies=(await getDocs(query(collection(db,'companies'),limit(100)))).docs;
 const targets=eventTargets(b,companies.map(s=>s.id));
 const deadline=Timestamp.fromDate(new Date(b.deadline));if(!Number.isFinite(deadline.toMillis())||deadline.toMillis()<=Date.now())fail('미래의 선택 마감 시간을 입력하세요.');
 const labels=b.type==='choice'?b.options?.map(o=>String(o.label||'').trim()):[];
 if(b.type==='choice'&&(labels?.length!==3||labels.some(l=>!l||l.length>200)))fail('선택지 3개를 각각 200자 이내로 입력하세요.');
 if(b.defaultOption!==undefined&&(b.type!=='choice'||!Number.isInteger(b.defaultOption)||b.defaultOption<0||b.defaultOption>2))fail('미선택 기본 선택지를 1~3번 중 하나로 지정하세요.');
 const effects=b.type==='choice'?b.options.map(o=>validateEffect(o.effect)):[validateEffect(b.effect)];
 const ref=doc(db,'events',b.id);if((await getDoc(ref)).exists())fail('이미 발행한 이벤트입니다. 적용 상태를 조회하세요.');
 const batch=writeBatch(db);
 batch.set(doc(db,'eventQueue',b.id),{endsAt:b.type==='choice'?deadline:serverTimestamp()});
 if(news)batch.set(doc(db,'eventNewsDrafts',b.id),news);
 batch.set(ref,{...(b.type==='choice'&&b.defaultOption!==undefined?{defaultOption:b.defaultOption}:{}),autoNews:!!news,...(news?{newsDraftRequired:true}:{}),type:b.type,title,content,companyId:b.type==='random'&&targets.length===1?targets[0]:'',targets,options:labels,startsAt:serverTimestamp(),endsAt:deadline});
 effects.forEach((effect,i)=>batch.set(doc(db,'eventOutcomes',b.id,'options',String(i)),{effect}));
 await batch.commit();return {id:b.id};
}
export async function chooseEvent(db,cid,eid,option){
 if(!valid(cid)||!valid(eid)||!Number.isInteger(option)||option<0||option>2)fail('기업과 선택지를 확인하세요.');
 await runTransaction(db,async t=>{const ref=doc(db,'companyChoices',cid,'items',eid),[old,os,event]=await Promise.all([t.get(ref),t.get(doc(db,'companyOperations',cid)),t.get(doc(db,'events',eid))]);if(old.exists()){if(old.data().option!==option)fail('이미 선택했습니다. 선택은 변경할 수 없습니다.');return;}if(!event.exists()||event.data().type!=='choice'||event.data().endsAt.toMillis()<=Date.now())fail('선택 기간이 마감되었습니다.');if(!os.exists())fail('회사 계좌를 먼저 준비하세요.');if(os.data().locked)fail('배당 정산 완료 후 선택하세요.');t.set(ref,{option,chosenAt:serverTimestamp()});});
 return {selected:true};
}
export async function applyEvent(db,cid,eid,option=0,{operator=true}={}){
 if(!valid(cid)||!valid(eid))fail('이벤트 주소를 확인하세요.');
 return runTransaction(db,async t=>{
  const receipt=doc(db,'companyEffects',cid,'items',eid),ops=doc(db,'companyOperations',cid);
  const [old,event,os]=await Promise.all([t.get(receipt),t.get(doc(db,'events',eid)),t.get(ops)]);
  if(old.exists())return {applied:true};if(!event.exists())fail('이벤트가 없습니다.');
  const n=event.data();if(n.type==='choice'&&n.endsAt.toMillis()>Date.now())fail('선택 마감 후 결과가 공개되고 적용됩니다.');if(!n.targets.includes(cid))fail('대상 기업이 아닙니다.');
  const selected=n.type==='choice'?await t.get(doc(db,'companyChoices',cid,'items',eid)):null;
  if(n.type==='choice'&&(!selected.exists()||selected.data().option!==option))fail('저장된 선택지와 일치하지 않습니다.');
  const outcome=await t.get(doc(db,'eventOutcomes',eid,'options',String(option)));const effect=outcome.data()?.effect;if(!effect)fail('이벤트 결과가 없습니다.');
  if(NEW_EFFECTS.includes(effect.kind)&&!operator)return {queued:true};
  const [config,book]=NEW_EFFECTS.includes(effect.kind)?await Promise.all([t.get(doc(db,'economyConfig','main')),t.get(doc(db,'sparkBooks',cid))]):[null,null];
  if(!os.exists()&&NEW_EFFECTS.includes(effect.kind))fail('회사 경영 계좌 준비 후 이벤트를 다시 적용하세요.');
  if(os.exists()&&['destroy','efficiency','grant'].includes(effect.kind))requireProduction(os.data());
  if(os.exists()&&os.data().locked)fail('배당 정산 완료 후 결과 적용을 다시 눌러 주세요. 선택은 저장되어 있습니다.');
  const patch=os.exists()?eventMutation(os.data(),effect,{config:config?effectiveConfig(config.data()):null,book:book?.data(),eventId:eid,effectiveAt:(n.type==='choice'?n.endsAt:n.startsAt).toMillis()}):{};
  const result=effect.kind==='cash'?{amount:patch.cash-(os.data().cash+(book?.data()?.issuerCash||0)-os.data().receivedIssuerCash)}:effect.kind==='workforce'?{count:patch.employees-(os.data().employees||0)}:effect.kind==='grant'?{count:patch[effect.asset]-os.data()[effect.asset]}:effect.kind==='destroy'?{count:os.data()[effect.asset]-patch[effect.asset]}:null;
  if(os.exists())t.update(ops,{...patch,lastEvent:eid,...(n.type==='choice'?{pendingEvent:''}:{})});
  t.set(receipt,{option,effect,...(Number.isInteger(effect.settlements)&&effect.settlements>0?{startsAfterSettlement:os.data()?.settlementCount||0}:{}),...(result?{result}:{}),appliedAt:serverTimestamp(),effectiveAt:n.type==='choice'?n.endsAt:n.startsAt});return {applied:true};
 });
}
export async function eventCompanyView(db,cid){
 if(!valid(cid))fail('기업을 선택하세요.');
 const opTask=getDoc(doc(db,'companyOperations',cid));
 const [eventRows,effects,os]=await Promise.all([immutableRows(db,'events',{field:'startsAt',pageSize:100,persistent:true}),opTask.then(s=>effectRecords(db,cid,{revision:s.data()?.lastEvent||'',persistent:true})),opTask]);
 const events={docs:eventRows.map(r=>({id:r.id,data:()=>r}))};
 const choices=await Promise.all(events.docs.filter(s=>s.data().type==='choice'&&s.data().targets.includes(cid)).map(async s=>{const c=await getDoc(doc(db,'companyChoices',cid,'items',s.id));return {id:s.id,...s.data(),choice:c.exists()?c.data():null};}));
 const projection=os.exists()&&needsProduction(os.data())?{base:0,revenue:null,needsProduction:true}:os.exists()?adjustedRevenue(os.data(),Math.floor((Date.now()+32400000)/86400000),effects):{base:0,revenue:0};
 const next=nextSettlement(os.data()),settlementProjection=projection.needsProduction?projection:os.exists()?adjustedRevenue(os.data(),next.day,effects,next.at):{base:0,revenue:0};
 return {choices,revenueEffects:projection.needsProduction?[]:revenueEffects(os.data()||{},effects,next.at),effects:effects.map(r=>({...r,active:currentEffect(os.data()||{},r),...(Number.isInteger(r.effect.settlements)&&r.effect.settlements>0?{remainingSettlements:remainingSettlements(os.data()||{},r)}:{}),title:events.docs.find(e=>e.id===r.id)?.data().title||r.id})),projection,settlementProjection,settlementAt:next.at};
}
export async function applyRandomEvent(db,eid){
 const s=await getDoc(doc(db,'events',eid));if(!s.exists()||s.data().type!=='random')fail('랜덤 이벤트를 선택하세요.');
 const failed=[];let applied=0;for(const cid of s.data().targets){try{await initializeOperations(db,cid);await applyEvent(db,cid,eid);applied++;}catch(e){failed.push({companyId:cid,message:e.message});}}
 try{await publishEventNews(db,eid);}catch(error){return {applied,failed,newsPending:true,newsError:error.message};}
 return {applied,failed};
}

// Only administrators/the trusted job may persist a default after the deadline.
// Existing selections win transaction conflicts; retries reuse the stored choice.
export async function ensureDefaultChoice(db,cid,eid){
 return runTransaction(db,async t=>{
  const ref=doc(db,'companyChoices',cid,'items',eid),old=await t.get(ref);
  if(old.exists())return old.data();
  const event=(await t.get(doc(db,'events',eid))).data();
  if(event?.type!=='choice'||!event.targets.includes(cid))fail('대상 선택형 이벤트가 아닙니다.');
  if(!Number.isInteger(event.defaultOption))return null; // Preserve historical events without a default.
  if(event.defaultOption<0||event.defaultOption>2)fail('기본 선택지 설정을 확인하세요.');
  if(event.endsAt.toMillis()>Date.now())fail('선택 마감 후 처리할 수 있습니다.');
  const choice={option:event.defaultOption,automatic:true,chosenAt:serverTimestamp()};t.set(ref,choice);return choice;
 });
}
// Apply due selections before manual settlement as well as the scheduled job.
export async function applyDueCompanyChoices(db,cid){let cursor=null;for(;;){const page=await getDocs(query(collection(db,'events'),orderBy('__name__'),limit(100),...(cursor?[startAfter(cursor)]:[])));for(const e of page.docs){const n=e.data();if(n.type!=='choice'||!n.targets.includes(cid)||n.endsAt.toMillis()>Date.now())continue;const selected=await ensureDefaultChoice(db,cid,e.id);if(selected)await applyEvent(db,cid,e.id,selected.option);}if(page.size<100)break;cursor=page.docs.at(-1);}}
export async function closeChoiceEvent(db,eid){
 const event=await getDoc(doc(db,'events',eid)),n=event.data();
 if(n?.type!=='choice'||n.endsAt.toMillis()>Date.now())fail('선택 마감 후 처리할 수 있습니다.');
 let applied=0;const failed=[];
 for(const cid of n.targets){try{const c=await ensureDefaultChoice(db,cid,eid);if(c){if(c.automatic)await initializeOperations(db,cid);await applyEvent(db,cid,eid,c.option);applied++;}}catch{failed.push(cid);}}
 try{await publishEventNews(db,eid);}catch(error){return {applied,failed,newsPending:true,newsError:error.message};}
 return {applied,failed};
}

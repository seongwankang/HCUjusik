import {postComment} from '../../client/news.js';
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {writeFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,getDocs,collection,query,limit,Timestamp,serverTimestamp} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';import {getFirestore} from 'firebase-admin/firestore';
import {publishEvent,applyRandomEvent,chooseEvent,ensureDefaultChoice,closeChoiceEvent} from '../../client/events.js';import {eventNewsId,publishEventNews} from '../../client/event-news.js';import {initialOperations} from '../../client/economy.js';import {buildJob} from '../../scripts/build-jobs.mjs';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,admin,president,other,student,app,trusted,job;const projectId='demo-event-news';
const effect={kind:'revenue',percent:-20,settlements:2},body=(id,type='random')=>({id,type,title:'뉴스 '+id,content:'에뮬레이터 전용 본문',news:{title:'직접 작성한 기사 '+id,content:'관리자가 별도로 작성한 뉴스 본문'},companyId:'',deadline:new Date(Date.now()+60000).toISOString(),effect,options:[{label:'유지',effect},{label:'지원',effect:{kind:'cash',amount:1000000,settlements:0}},{label:'대기',effect:{kind:'none',settlements:0}}]});
before(async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();for(const [uid,role]of [['admin','admin'],['president','president'],['other','president'],['student','student']])await setDoc(doc(db,'users',uid),{displayName:uid,active:true,role});await setDoc(doc(db,'assignments/president'),{companyIds:['one']});await setDoc(doc(db,'assignments/other'),{companyIds:['two']});for(const [cid,name]of [['one','기업 A'],['two','기업 B'],['three','기업 C']]){await setDoc(doc(db,'companies',cid),{name,status:'listed'});await setDoc(doc(db,'companyOperations',cid),{...initialOperations(),factory:1,revenue:10000,production:{factory:10000,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0}});await setDoc(doc(db,'sparkBooks',cid),{issuerCash:0,issuedShares:1000,treasuryShares:1000});}});
 const claims={email:'synthetic@hcu.hs.kr',email_verified:true};admin=env.authenticatedContext('admin',claims).firestore();president=env.authenticatedContext('president',claims).firestore();other=env.authenticatedContext('other',claims).firestore();student=env.authenticatedContext('student',claims).firestore();
 await writeFile('.generated-event-news-job-entry.mjs',"export {runDueChoiceEvents} from './server/choice-events.js';");await buildJob('.generated-event-news-job-entry.mjs','.generated-event-news-job.mjs');job=await import('../../.generated-event-news-job.mjs?test='+Date.now());app=initializeApp({projectId},'event-news-job');trusted=getFirestore(app);
});after(async()=>{await env?.cleanup();if(app)await deleteApp(app);});
test('random activation creates one normal event news article and retries preserve manual edits and publication time',async()=>{
 await publishEvent(admin,body('random-now'));assert.equal((await applyRandomEvent(admin,'random-now')).newsPending,undefined);const id=await eventNewsId('random-now'),ref=doc(admin,'news',id);let n=(await getDoc(doc(student,'news',id))).data();assert.equal(n.category,'이벤트');assert.equal(n.title,'직접 작성한 기사 random-now');assert.equal(n.content,'관리자가 별도로 작성한 뉴스 본문');assert.equal(n.eventSummary.groups[0].companies.length,3);assert.equal(n.eventSummary.groups[0].companies.every(c=>c.status==='applied'),true);
 await postComment(student,'student',id,'event-news-comment','자동 생성 뉴스에도 댓글 작성');assert.equal((await getDoc(doc(student,'news',id,'comments/event-news-comment'))).data().content,'자동 생성 뉴스에도 댓글 작성');
 const at=n.publishedAt.toMillis();await applyRandomEvent(admin,'random-now');assert.equal((await getDoc(ref)).data().publishedAt.toMillis(),at);assert.equal((await getDocs(query(collection(student,'news'),limit(30)))).size,1);
 await updateDoc(ref,{title:'관리자가 수정한 제목',content:'수정 본문',publishedAt:serverTimestamp()});n=(await getDoc(ref)).data();await applyRandomEvent(admin,'random-now');assert.equal((await getDoc(ref)).data().title,n.title);assert.equal((await getDoc(ref)).data().publishedAt.toMillis(),n.publishedAt.toMillis());await assertFails(updateDoc(doc(student,'news',id),{content:'forged'}));
});
test('choice news stays secret until deadline then trusted scheduled job publishes per-choice companies, effects and abstentions',async()=>{
 await publishEvent(admin,body('choice-result','choice'));await chooseEvent(president,'one','choice-result',0);await chooseEvent(other,'two','choice-result',1);const id=await eventNewsId('choice-result');await assertFails(getDoc(doc(student,'eventNewsDrafts/choice-result')));await assertFails(getDoc(doc(president,'eventNewsDrafts/choice-result')));assert.equal((await getDoc(doc(admin,'eventNewsDrafts/choice-result'))).data().content,'관리자가 별도로 작성한 뉴스 본문');await assert.rejects(publishEventNews(admin,'choice-result'),/마감/);await assertFails(getDoc(doc(student,'eventOutcomes/choice-result/options/1')));assert.equal((await getDoc(doc(student,'news',id))).exists(),false);
 const fake={title:'too early',content:'no',category:'이벤트',companyId:'',companyName:'',publishedAt:serverTimestamp(),eventId:'choice-result',eventSummary:{type:'choice',groups:[{},{},{}],unselected:[]}};await assertFails(setDoc(doc(admin,'news/early-result'),fake));
 await job.runDueChoiceEvents(trusted);assert.equal((await getDoc(doc(student,'news',id))).exists(),false);
 const deadline=Timestamp.fromMillis(Date.now()-1000);await env.withSecurityRulesDisabled(async ctx=>{await updateDoc(doc(ctx.firestore(),'events/choice-result'),{endsAt:deadline});await updateDoc(doc(ctx.firestore(),'eventQueue/choice-result'),{endsAt:deadline});});
 let run=await job.runDueChoiceEvents(trusted);assert.equal(run.failed,0);const n=(await getDoc(doc(student,'news',id))).data();assert.equal(n.title,'직접 작성한 기사 choice-result');assert.equal(n.content,'관리자가 별도로 작성한 뉴스 본문');assert.equal(n.eventSummary.groups[0].companies[0].name,'기업 A');assert.equal(n.eventSummary.groups[1].companies[0].name,'기업 B');assert.equal(n.eventSummary.groups[1].companies[0].result.amount,1000000);assert.deepEqual(n.eventSummary.unselected,['기업 C']);assert.equal((await getDoc(doc(admin,'companyOperations/two'))).data().cash,1000000);
 const at=n.publishedAt.toMillis();await job.runDueChoiceEvents(trusted);assert.equal((await getDoc(doc(admin,'news',id))).data().publishedAt.toMillis(),at);assert.equal((await getDoc(doc(admin,'companyOperations/two'))).data().cash,1000000);
 assert.equal(JSON.stringify(n.eventSummary).includes('president'),false);assert.equal(JSON.stringify(n.eventSummary).includes('email'),false);
});
test('partial application news updates pending rows on queue retry without duplicate money or a second article',async()=>{
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'companyOperations/two'),{locked:true}));await publishEvent(admin,{...body('partial-news'),companyIds:['one','two'],effect:{kind:'cash',amount:100,settlements:0}});let r=await applyRandomEvent(admin,'partial-news');assert.equal(r.failed.length,1);const id=await eventNewsId('partial-news');let n=(await getDoc(doc(student,'news',id))).data(),at=n.publishedAt.toMillis();assert.deepEqual(n.eventSummary.groups[0].companies.map(c=>c.status),['applied','pending']);const cash=(await getDoc(doc(admin,'companyOperations/one'))).data().cash;
 r=await job.runDueChoiceEvents(trusted);assert.equal(r.blocked.has('two'),true);await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'companyOperations/two'),{locked:false}));r=await job.runDueChoiceEvents(trusted);assert.equal(r.failed,0);n=(await getDoc(doc(student,'news',id))).data();assert.equal(n.publishedAt.toMillis(),at);assert.equal(n.eventSummary.groups[0].companies.every(c=>c.status==='applied'),true);assert.equal((await getDoc(doc(admin,'companyOperations/one'))).data().cash,cash);assert.equal((await getDoc(doc(admin,'companyOperations/two'))).data().cash,1000100);assert.equal((await getDocs(query(collection(student,'news'),limit(30)))).size,3);
});

test('destruction news reports actual clamped facility losses',async()=>{await publishEvent(admin,{...body('destruction-news'),companyId:'one',effect:{kind:'destroy',asset:'factory',count:1000,settlements:0}});const r=await applyRandomEvent(admin,'destruction-news');assert.deepEqual(r.failed,[]);const n=(await getDoc(doc(student,'news',await eventNewsId('destruction-news')))).data();assert.equal(n.eventSummary.groups[0].companies[0].result.count,1);});


test('drafts are immutable and never readable to participants; disabling linked news leaves standalone news intact',async()=>{
 await assertFails(updateDoc(doc(student,'eventNewsDrafts/choice-result'),{content:'forged'}));
 await assertFails(updateDoc(doc(admin,'eventNewsDrafts/choice-result'),{content:'changed after registration'}));
 await assertFails(getDocs(query(collection(admin,'eventNewsDrafts'),limit(30))));
 await assert.rejects(publishEvent(admin,{...body('blank-draft'),news:{title:'',content:'본문'}}),/뉴스/);
 assert.equal((await getDoc(doc(admin,'events/blank-draft'))).exists(),false);
 await publishEvent(admin,{...body('no-linked-news'),news:null});await applyRandomEvent(admin,'no-linked-news');
 assert.equal((await getDoc(doc(student,'news',await eventNewsId('no-linked-news')))).exists(),false);
 await setDoc(doc(admin,'news/standalone'),{title:'별도 기사',content:'기존 뉴스 등록',category:'공지',companyId:'',companyName:'',publishedAt:serverTimestamp()});
 assert.equal((await getDoc(doc(student,'news/standalone'))).data().content,'기존 뉴스 등록');
});


test('default option applies only after deadline, preserves explicit choices and retries without duplicate cash or news',async()=>{
 const eid='default-result';
 await assert.rejects(publishEvent(admin,{...body('invalid-default','choice'),defaultOption:3}),/기본 선택지/);
 await publishEvent(admin,{...body(eid,'choice'),defaultOption:2,options:[{label:'직접',effect:{kind:'cash',amount:100,settlements:0}},{label:'없음',effect:{kind:'none',settlements:0}},{label:'기본',effect:{kind:'cash',amount:300,settlements:0}}]});
 await chooseEvent(president,'one',eid,0);
 await assert.rejects(ensureDefaultChoice(admin,'two',eid),/마감/);
 const deadline=Timestamp.fromMillis(Date.now()-1000);
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await updateDoc(doc(db,'events',eid),{endsAt:deadline});await updateDoc(doc(db,'eventQueue',eid),{endsAt:deadline});await updateDoc(doc(db,'companyOperations/two'),{locked:true});});
 const choiceRef=doc(admin,'companyChoices/two/items',eid);
 await assertFails(setDoc(doc(other,'companyChoices/two/items',eid),{option:2,automatic:true,chosenAt:serverTimestamp()}));
 await assertFails(setDoc(choiceRef,{option:1,automatic:true,chosenAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(admin,'events',eid),{defaultOption:0}));
 const before=Object.fromEntries(await Promise.all(['one','two','three'].map(async cid=>[cid,(await getDoc(doc(admin,'companyOperations',cid))).data().cash])));
 const first=await closeChoiceEvent(admin,eid);assert.deepEqual(first.failed,['two']);
 const saved=(await getDoc(choiceRef)).data();assert.equal(saved.option,2);assert.equal(saved.automatic,true);
 assert.equal((await getDoc(doc(admin,'companyChoices/one/items',eid))).data().option,0);
 await assertFails(updateDoc(choiceRef,{option:0}));
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'companyOperations/two'),{locked:false}));
 const run=await job.runDueChoiceEvents(trusted);assert.equal(run.failed,0);
 const summary=(await getDoc(doc(student,'news',await eventNewsId(eid)))).data().eventSummary;
 assert.deepEqual(summary.unselected,[]);assert.equal(summary.groups[2].companies.length,2);assert.equal(summary.groups[2].companies.every(c=>c.automatic&&c.status==='applied'),true);
 for(const [cid,amount]of [['one',100],['two',300],['three',300]])assert.equal((await getDoc(doc(admin,'companyOperations',cid))).data().cash,before[cid]+amount);
 await closeChoiceEvent(admin,eid);await job.runDueChoiceEvents(trusted);
 assert.equal((await getDoc(choiceRef)).data().chosenAt.toMillis(),saved.chosenAt.toMillis());
 assert.equal((await getDoc(doc(admin,'companyOperations/two'))).data().cash,before.two+300);
});

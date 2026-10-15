import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,getDocs,collection,query,limit,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {createClientApi} from '../../client/data.js';
import {postComment,voteComment,readComments,removeComment} from '../../client/news.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,a,b,admin,api;const nid='news-discussion',claims={email:'synthetic@hcu.hs.kr',email_verified:true};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-news-comments',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{for(const [uid,role] of [['a','student'],['b','student'],['root','admin'],['inactive','student']])await setDoc(doc(c.firestore(),'users',uid),{displayName:uid==='root'?'운영자':'참가자 '+uid,active:uid!=='inactive',role});await setDoc(doc(c.firestore(),'news',nid),{title:'합성 뉴스',content:'뉴스 본문\n둘째 줄',companyId:'',companyName:'',publishedAt:Timestamp.now()});});
 a=env.authenticatedContext('a',claims).firestore();b=env.authenticatedContext('b',claims).firestore();admin=env.authenticatedContext('root',claims).firestore();api=createClientApi({db:a,getUser:async()=>({uid:'a',getIdTokenResult:async()=>({claims})})});});
after(async()=>env?.cleanup());
test('news detail is independently addressable; comments use verified author and server timestamps',async()=>{
 assert.equal((await api('/api/news-detail?id='+nid)).news.content,'뉴스 본문\n둘째 줄');
 await api('/api/news-comment',{method:'POST',body:JSON.stringify({newsId:nid,id:'comment-first',content:'  좋은 소식입니다.\n<img src=x onerror=alert(1)>  ',uid:'root',authorName:'위조 운영자'})});
 const c=(await readComments(b,'b',nid)).comments[0];assert.equal(c.authorName,'참가자 a');assert.equal(c.likes,0);assert.equal(c.content,'좋은 소식입니다.\n<img src=x onerror=alert(1)>');assert.ok(Date.parse(c.createdAt));assert.equal(c.myVote,0);
 await postComment(a,'a',nid,'comment-first','좋은 소식입니다.\n<img src=x onerror=alert(1)>');assert.equal((await readComments(a,'a',nid)).comments.length,1);
 await assert.rejects(postComment(a,'a',nid,'too-fast-comment','다음 댓글'),/3초/);await assert.rejects(postComment(a,'a',nid,'empty-comment','  '));await assert.rejects(postComment(a,'a','../users','bad-news-id','X'));
});
test('like/dislike are mutually exclusive, repeat-safe, cancellable and support concurrent voters',async()=>{
 let v=await voteComment(a,'a',nid,'comment-first',1);assert.deepEqual(v,{likes:1,dislikes:0,myVote:1});await voteComment(a,'a',nid,'comment-first',1);
 assert.equal((await getDoc(doc(a,'news',nid,'comments/comment-first'))).data().likes,1);
 await voteComment(a,'a',nid,'comment-first',-1);let c=(await getDoc(doc(a,'news',nid,'comments/comment-first'))).data();assert.equal(c.likes,0);assert.equal(c.dislikes,1);
 await voteComment(a,'a',nid,'comment-first',0);await Promise.all([voteComment(a,'a',nid,'comment-first',1),voteComment(b,'b',nid,'comment-first',1)]);
 c=(await getDoc(doc(a,'news',nid,'comments/comment-first'))).data();assert.equal(c.likes,2);assert.equal(c.dislikes,0);
 assert.equal((await readComments(a,'a',nid)).comments[0].myVote,1);assert.equal((await readComments(b,'b',nid)).comments[0].myVote,1);
});
test('forged author, counters, votes, edits, moderation and anonymous access are denied',async()=>{
 const ref=doc(a,'news',nid,'comments/comment-first');
 await assertFails(updateDoc(ref,{likes:999}));await assertFails(updateDoc(ref,{content:'changed'}));await assertFails(updateDoc(ref,{uid:'root'}));
 await assertFails(setDoc(doc(a,'news',nid,'comments/comment-first/votes/b'),{value:-1,updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(a,'news',nid,'comments/comment-first/votes/a'),{value:-1,updatedAt:serverTimestamp()}));
 await assertFails(getDocs(query(collection(a,'news',nid,'comments/comment-first/votes'),limit(30))));
 await assertFails(getDoc(doc(a,'news',nid,'comments/comment-first/votes/b')));
 await assertFails(getDocs(collection(a,'news',nid,'comments')));
 const forged=writeBatch(a);forged.set(doc(a,'news',nid,'comments/forged-comment'),{uid:'root',authorName:'운영자',content:'위조',createdAt:serverTimestamp(),likes:0,dislikes:0,deleted:false});forged.set(doc(a,'news',nid,'commentLimits/a'),{lastCommentId:'forged-comment',createdAt:serverTimestamp()});await assertFails(forged.commit());
 await assert.rejects(api('/api/news-comment-delete',{method:'POST',body:JSON.stringify({newsId:nid,id:'comment-first'})}),/관리자/);
 await assertFails(removeComment(a,nid,'comment-first'));
 const anon=env.unauthenticatedContext().firestore();await assertFails(getDoc(doc(anon,'news',nid)));await assertFails(readComments(anon,'a',nid));
 const inactive=env.authenticatedContext('inactive',claims).firestore();await assertFails(postComment(inactive,'inactive',nid,'inactive-comment','X'));
});
test('administrator deletion removes body and author name and permanently stops reactions',async()=>{
 await removeComment(admin,nid,'comment-first');await removeComment(admin,nid,'comment-first');
 const raw=(await getDoc(doc(a,'news',nid,'comments/comment-first'))).data();assert.equal(raw.content,'');assert.equal(raw.authorName,'');assert.equal(raw.deleted,true);assert.ok(raw.deletedAt);
 const c=(await readComments(a,'a',nid)).comments[0];assert.equal(c.deleted,true);assert.equal(c.content,'');assert.equal(c.myVote,0);
 await assert.rejects(voteComment(b,'b',nid,'comment-first',-1),/삭제/);
 await assertFails(updateDoc(doc(admin,'news',nid,'comments/comment-first'),{content:'restore',deleted:false}));
});
test('pagination preserves nanosecond ordering and contains no duplicate or missing comments',async()=>{
 const news='page-news';await env.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'news',news),{title:'paging',content:'C',companyName:'',companyId:'',publishedAt:Timestamp.now()});for(let i=0;i<35;i++)await setDoc(doc(c.firestore(),'news',news,'comments','comment-'+String(i).padStart(3,'0')),{uid:'b',authorName:'B',content:'C'+i,createdAt:new Timestamp(1792100000,i+1),likes:0,dislikes:0,deleted:false});});
 const first=await readComments(a,'a',news);assert.equal(first.comments.length,30);assert.ok(first.next);const second=await readComments(a,'a',news,first.next);assert.equal(second.comments.length,5);assert.equal(second.next,null);assert.equal(new Set([...first.comments,...second.comments].map(c=>c.id)).size,35);
});

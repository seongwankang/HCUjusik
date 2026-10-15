import {doc,getDoc,getDocs,collection,query,orderBy,documentId,limit,startAfter,Timestamp,runTransaction,serverTimestamp} from 'firebase/firestore';
export const newsId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const check=(...ids)=>{if(ids.some(id=>!newsId(id)))throw new Error('뉴스 또는 댓글 주소를 확인하세요.');};
export async function readComments(db,uid,nid,cursor){
 check(nid);const constraints=[orderBy('createdAt','desc'),orderBy(documentId(),'desc'),limit(30)];
 if(cursor){if(!newsId(cursor.id)||!Number.isSafeInteger(cursor.seconds)||!Number.isInteger(cursor.nanoseconds)||cursor.nanoseconds<0||cursor.nanoseconds>999999999)throw new Error('댓글 조회 위치를 확인하세요.');constraints.push(startAfter(new Timestamp(cursor.seconds,cursor.nanoseconds),cursor.id));}
 const page=await getDocs(query(collection(db,'news',nid,'comments'),...constraints));
 const comments=await Promise.all(page.docs.map(async s=>{const d=s.data();const v=d.deleted?null:await getDoc(doc(db,'news',nid,'comments',s.id,'votes',uid));return {id:s.id,content:d.deleted?'':d.content,authorName:d.deleted?'':d.authorName,createdAt:d.createdAt.toDate().toISOString(),deleted:d.deleted,likes:d.likes,dislikes:d.dislikes,myVote:v?.exists()?v.data().value:0};}));
 const end=page.docs.at(-1);return {comments,next:page.size===30?{id:end.id,seconds:end.data().createdAt.seconds,nanoseconds:end.data().createdAt.nanoseconds}:null};
}
export async function postComment(db,uid,nid,id,content){
 check(nid,id);if(typeof content!=='string'||!content.trim()||content.trim().length>1000)throw new Error('댓글은 1~1,000자로 입력하세요.');
 await runTransaction(db,async t=>{const ref=doc(db,'news',nid,'comments',id),stamp=doc(db,'news',nid,'commentLimits',uid);const [old,news,profile,previous]=await Promise.all([t.get(ref),t.get(doc(db,'news',nid)),t.get(doc(db,'users',uid)),t.get(stamp)]);
 if(old.exists()){if(old.data().uid===uid&&old.data().content===content.trim())return;throw new Error('같은 댓글 번호가 이미 사용됐습니다.');}if(!news.exists())throw new Error('뉴스가 없습니다.');
 if(previous.exists()&&Date.now()-previous.data().createdAt.toMillis()<3000)throw new Error('댓글은 3초 간격으로 작성할 수 있습니다.');
 t.set(ref,{uid,authorName:profile.data().displayName,content:content.trim(),createdAt:serverTimestamp(),likes:0,dislikes:0,deleted:false});t.set(stamp,{lastCommentId:id,createdAt:serverTimestamp()});
 });
}
export async function voteComment(db,uid,nid,cid,value){
 check(nid,cid);if(![-1,0,1].includes(value))throw new Error('좋아요·싫어요 값을 확인하세요.');
 for(let attempt=0;attempt<5;attempt++){let seen;try{return await runTransaction(db,async t=>{const ref=doc(db,'news',nid,'comments',cid),vote=doc(db,'news',nid,'comments',cid,'votes',uid);const [comment,old]=await Promise.all([t.get(ref),t.get(vote)]);if(!comment.exists()||comment.data().deleted)throw new Error('삭제되었거나 존재하지 않는 댓글입니다.');const previous=old.exists()?old.data().value:0;const c=comment.data();seen={likes:c.likes,dislikes:c.dislikes,value:previous};if(previous===value)return {likes:c.likes,dislikes:c.dislikes,myVote:value};t.set(vote,{value,updatedAt:serverTimestamp()});t.update(ref,{likes:c.likes+(value===1?1:0)-(previous===1?1:0),dislikes:c.dislikes+(value===-1?1:0)-(previous===-1?1:0)});return {likes:c.likes+(value===1?1:0)-(previous===1?1:0),dislikes:c.dislikes+(value===-1?1:0)-(previous===-1?1:0),myVote:value};});}catch(error){if(error.code!=='permission-denied'||!seen||attempt===4)throw error;const [latest,v]=await Promise.all([getDoc(doc(db,'news',nid,'comments',cid)),getDoc(doc(db,'news',nid,'comments',cid,'votes',uid))]);if(!latest.exists()||latest.data().deleted||(latest.data().likes===seen.likes&&latest.data().dislikes===seen.dislikes&&(v.exists()?v.data().value:0)===seen.value))throw error;}}
}
export async function removeComment(db,nid,cid){check(nid,cid);await runTransaction(db,async t=>{const ref=doc(db,'news',nid,'comments',cid),s=await t.get(ref);if(!s.exists()||s.data().deleted)return;t.update(ref,{content:'',authorName:'',deleted:true,deletedAt:serverTimestamp()});});}

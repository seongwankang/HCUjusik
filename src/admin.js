import {NEWS_CATEGORIES} from './news-category.js';
import {HttpError} from './errors.js';
const fail=()=>{throw new HttpError(400,'입력값 형식과 범위를 확인하세요.');};
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max?v.trim():fail();
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)?v:fail();
export function validateAdmin(kind,b){
  if(!b||typeof b!=='object'||Array.isArray(b))fail();
  const documentId=id(b.id);
  let data;
  if(kind==='companies'){
    if(!['draft','listed','paused'].includes(b.status))fail();
    data={name:text(b.name,80),ticker:text(b.ticker,20),description:text(b.description,2000),category:text(b.category,40),status:b.status};
    if(!/^[A-Z0-9_-]{1,20}$/.test(data.ticker))fail();
    // Economic fields are only initial demonstration values; existing values cannot be edited.
    if(b.initial===true){for(const k of ['referencePrice','issuedShares'])if(!Number.isSafeInteger(b[k])||b[k]<1||b[k]>1000000)fail();Object.assign(data,{referencePrice:b.referencePrice,issuedShares:b.issuedShares,companyCash:0,dailyRevenue:0});}
  } else if(kind==='news'){
    if(b.category!==undefined&&!NEWS_CATEGORIES.includes(b.category))fail();
    data={title:text(b.title,120),content:text(b.content,5000),category:b.category||'공지',companyId:b.companyId?id(b.companyId):'',publishedAt:new Date().toISOString()};
  } else if(kind==='events'){
    const start=new Date(b.startsAt),end=new Date(b.endsAt);
    if(!Number.isFinite(start.valueOf())||!Number.isFinite(end.valueOf())||end<=start)fail();
    data={title:text(b.title,120),content:text(b.content,5000),companyId:id(b.companyId),startsAt:start.toISOString(),endsAt:end.toISOString()};
  } else if(kind==='users'){
    if(!['student','president'].includes(b.role)||typeof b.active!=='boolean')fail();
    if(!Array.isArray(b.companyIds)||b.companyIds.length>5)fail();
    data={displayName:text(b.displayName,80),role:b.role,active:b.active};
    return {id:documentId,data,companyIds:[...new Set(b.companyIds.map(id))]};
  } else fail();
  return {id:documentId,data};
}
export async function adminRoute(request,db,profile,path){
  if(profile.role!=='admin')throw new HttpError(403,'관리자 계정만 사용할 수 있습니다.');
  const kind=path.split('/').at(-1);
  if(!['companies','news','events','users'].includes(kind))throw new HttpError(404,'관리 경로가 없습니다.');
  if(request.method==='GET'){
    const target=new URL(request.url).searchParams.get('id');
    if(kind==='users'&&target)return {companyIds:(await db.get(`assignments/${id(target)}`))?.companyIds||[]};
    return {[kind]:await db.list(kind,kind==='news'?30:100,kind==='companies'?'ticker':kind==='users'?'displayName':kind==='news'?'publishedAt desc':'startsAt desc')};
  }
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSON 요청이 필요합니다.');
  const raw=await request.text();if(raw.length>16000)throw new HttpError(413,'입력 내용이 너무 큽니다.');
  let b;try{b=JSON.parse(raw);}catch{fail();}
  const item=validateAdmin(kind,b);
  if(kind==='users'){
    const old=await db.get(`users/${item.id}`);
    if(!old)throw new HttpError(404,'회원가입한 참가자를 선택하세요.');
    if(old?.role==='admin')throw new HttpError(403,'관리자 계정 권한은 콘솔에서만 변경할 수 있습니다.');
    await db.commit([{path:`users/${item.id}`,data:item.data},{path:`assignments/${item.id}`,data:{companyIds:item.companyIds}}]);
  }else{
    if(kind==='companies'&&b.initial===true&&await db.get(`companies/${item.id}`))throw new HttpError(409,'이미 존재하는 기업입니다.');
    if(item.data.companyId){const c=await db.get(`companies/${item.data.companyId}`);if(!c)throw new HttpError(400,'대상 기업을 확인하세요.');if(kind==='news')item.data.companyName=c.name;}
    await db.commit([{path:`${kind}/${item.id}`,data:item.data,createOnly:kind==='companies'&&b.initial===true}]);
  }
  return {ok:true,id:item.id};
}

import {getDoc,getDocs,doc,collection,query,orderBy,limit,runTransaction,Timestamp,serverTimestamp} from 'firebase/firestore';
import {validateAdmin} from '../src/admin.js';
const school=c=>c.email_verified===true&&typeof c.email==='string'&&/^[^\s@]+@hcu\.hs\.kr$/i.test(c.email);
const message=s=>{throw new Error(s);};
function plain(v){if(v instanceof Timestamp)return v.toDate().toISOString();if(Array.isArray(v))return v.map(plain);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)]));return v;}
export function createClientApi({db,getUser}){
 const get=async path=>{const s=await getDoc(doc(db,path));return s.exists()?{...plain(s.data()),id:s.id}:null;};
 const list=async(kind,max,sort)=>{const [key,direction='asc']=sort.split(' ');return (await getDocs(query(collection(db,kind),orderBy(key,direction),limit(max)))).docs.map(s=>({...plain(s.data()),id:s.id}));};
 return async function api(path,options={}){
  const url=new URL(path,'https://local.invalid'),route=url.pathname,method=options.method||'GET';
  const user=await getUser();
  if(!user){if(route==='/api/me')return {authenticated:false,user:null};message('로그인이 필요합니다.');}
  const claims=(await user.getIdTokenResult()).claims;
  const profile=await get(`users/${user.uid}`);
  if(!(profile?.role==='admin'&&profile.active===true)&&!school(claims))message('학교 이메일(@hcu.hs.kr)의 이메일 인증을 완료하세요.');
  if(route==='/api/register'&&method==='POST'){
   const b=JSON.parse(options.body||'{}');if(typeof b.displayName!=='string'||!b.displayName.trim()||b.displayName.length>80)message('학생 이름은 1~80자로 입력하세요.');
   await runTransaction(db,async t=>{const u=doc(db,'users',user.uid),p=doc(db,'portfolios',user.uid);const old=await t.get(u);if(old.exists())return;t.set(u,{displayName:b.displayName.trim(),role:'student',active:true});t.set(p,{cash:1000000,holdings:[],version:0});});
   return {ok:true,registered:true};
  }
  if(profile?.active!==true)message('행사 참가 계정이 등록되지 않았거나 비활성화되었습니다.');
  if(route==='/api/me'&&method==='GET')return {authenticated:true,user:{id:user.uid,displayName:profile.displayName,role:profile.role}};
  if(['/api/test-portfolio','/api/test-orders'].includes(route))message('기준가격 즉시 매매는 종료됐습니다. 지정가 주문장을 사용하세요.');
  if(route==='/api/orders')message('공식 주문은 아직 비활성화 상태입니다. 테스트 주문을 사용하세요.');
  const kinds={companies:['ticker',100],news:['publishedAt desc',30],events:['startsAt desc',100]};
  if(method==='GET'&&route.startsWith('/api/admin/')){
   if(profile.role!=='admin')message('관리자만 사용할 수 있습니다.');const kind=route.split('/').at(-1);
   if(kind==='users'&&url.searchParams.has('id')){const id=url.searchParams.get('id');if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))message('잘못된 참가자입니다.');return {companyIds:(await get(`assignments/${id}`))?.companyIds||[]};}
   if(kind==='users')return {users:await list('users',100,'displayName')};
   if(kinds[kind])return {[kind]:await list(kind,kinds[kind][1],kinds[kind][0])};
  }
  if(method==='POST'&&route.startsWith('/api/admin/')){
   if(profile.role!=='admin')message('관리자만 사용할 수 있습니다.');const kind=route.split('/').at(-1),body=JSON.parse(options.body||'{}'),item=validateAdmin(kind,body);
   const data={...item.data};
   if(kind==='news')data.publishedAt=serverTimestamp();
   if(kind==='events'){data.startsAt=Timestamp.fromDate(new Date(data.startsAt));data.endsAt=Timestamp.fromDate(new Date(data.endsAt));}
   await runTransaction(db,async t=>{
    const ref=doc(db,kind,item.id),old=await t.get(ref);
    if(kind==='users'){
     if(!old.exists()||old.data().role==='admin')message('학생 계정을 선택하세요. 관리자 권한은 여기서 변경할 수 없습니다.');
     // Preserve identity; administrator changes role/status/assignment only.
     data.displayName=old.data().displayName;
     t.update(ref,data);t.set(doc(db,'assignments',item.id),{companyIds:item.companyIds});
    }else{
     if(data.companyId){const company=await t.get(doc(db,'companies',data.companyId));if(!company.exists())message('대상 기업을 확인하세요.');if(kind==='news')data.companyName=company.data().name;}
     if(kind==='companies'&&body.initial===true){if(old.exists())message('이미 존재하는 기업입니다.');t.set(ref,data);}else{if(kind==='companies'&&!old.exists())message('기업이 없습니다.');t.set(ref,data,{merge:true});}
    }
   });return {ok:true,id:item.id};
  }
  const kind=route.split('/').at(-1);
  if(method==='GET'&&kinds[kind])return {[kind]:await list(kind,kinds[kind][1],kinds[kind][0])};
  if(route==='/api/portfolio'&&method==='GET'){const p=await get(`portfolios/${user.uid}`);if(!p)message('자산이 아직 초기화되지 않았습니다.');if(!Number.isSafeInteger(p.cash)||p.cash<0||!Array.isArray(p.holdings)||!Number.isSafeInteger(p.version))message('자산 형식을 확인하세요.');return {cash:p.cash,holdings:p.holdings,version:p.version};}
  if(route==='/api/my-company'&&method==='GET'){const ids=(await get(`assignments/${user.uid}`))?.companyIds||[];if(ids.length>5||ids.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x)))message('담당 기업 설정을 확인하세요.');return {companies:(await Promise.all(ids.map(id=>get(`companies/${id}`)))).filter(Boolean)};}
  message('지원하지 않는 요청입니다.');
 };
}

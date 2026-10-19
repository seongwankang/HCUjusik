import {accountLedger} from './account-ledger.js';
import {spyView,hireSpy} from './spies.js';
import {spyPolicy} from './spy-model.js';
import {publishLeadership} from './leadership.js';
import {effectiveConfig} from './business-policy.js';
import {publishEvent,chooseEvent,applyEvent,closeChoiceEvent,applyRandomEvent,eventCompanyView,effectRecords} from './events.js';
import {investorSnapshot} from './investor.js';
import {accountAssets,allRows,marketRankings,publishCashRankings} from './rankings.js';
import {newsId,readComments,postComment,voteComment,removeComment} from './news.js';
import {operationsView,initializeOperations,invest,settleDay,validateConfig} from './economy.js';
import {tradingPortfolio} from './portfolio.js';
import {getDoc,getDocs,doc,collection,query,orderBy,limit,startAfter,runTransaction,updateDoc,Timestamp,serverTimestamp} from 'firebase/firestore';
import {validateAdmin} from '../src/admin.js';
import {initializeSpark,placeSpark,matchSpark,cancelSpark,sparkView,marketHistory} from './spark-exchange.js';
const school=c=>c.email_verified===true&&typeof c.email==='string'&&/^[^\s@]+@hcu\.hs\.kr$/i.test(c.email);
const message=s=>{throw new Error(s);};
function plain(v){if(v instanceof Timestamp)return v.toDate().toISOString();if(Array.isArray(v))return v.map(plain);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)]));return v;}
export function createClientApi({db,getUser}){
 const get=async path=>{const s=await getDoc(doc(db,path));return s.exists()?{...plain(s.data()),id:s.id}:null;};
 const list=async(kind,max,sort)=>{const [key,direction='asc']=sort.split(' ');return (await getDocs(query(collection(db,kind),orderBy(key,direction),limit(max)))).docs.map(s=>({...plain(s.data()),id:s.id}));};
 const investmentsFor=async cid=>{
  const rows=[];let cursor;
  for(;;){
   const page=await getDocs(query(collection(db,'companyOperations',cid,'investments'),orderBy('createdAt','desc'),limit(30),...(cursor?[startAfter(cursor)]:[])));
   rows.push(...page.docs.map(s=>({...plain(s.data()),id:s.id})));
   if(page.size<30)return rows;cursor=page.docs.at(-1);
  }
 };
 return async function api(path,options={}){
  const url=new URL(path,'https://local.invalid'),route=url.pathname,method=options.method||'GET';
  const user=await getUser();
  if(!user){if(route==='/api/me')return {authenticated:false,user:null};message('로그인이 필요합니다.');}
  const claims=(await user.getIdTokenResult()).claims;
  const profile=await get(`users/${user.uid}`);
  if(!(profile?.role==='admin'&&profile.active===true)&&!school(claims))message('학교 이메일(@hcu.hs.kr)의 이메일 인증을 완료하세요.');
  if(route==='/api/register'&&method==='POST'){
   const b=JSON.parse(options.body||'{}');if(typeof b.displayName!=='string'||!b.displayName.trim()||b.displayName.length>80)message('학생 이름은 1~80자로 입력하세요.');
   await runTransaction(db,async t=>{const u=doc(db,'users',user.uid),p=doc(db,'portfolios',user.uid);const old=await t.get(u);if(old.exists())return;t.set(u,{displayName:b.displayName.trim(),role:'student',active:true,email:claims.email.toLowerCase()});t.set(p,{cash:1000000,holdings:[],version:0});});
   return {ok:true,registered:true};
  }
  if(!profile){const error=new Error('학생 가입을 마무리해 주세요.');error.code='registration-required';throw error;}
  if(profile.active!==true)message('비활성화된 참가 계정입니다. 관리자에게 문의하세요.');
  if(route==='/api/rankings-publish'&&method==='POST'){if(profile.role!=='admin')message('관리자만 순위를 집계할 수 있습니다.');await publishCashRankings(db);return {ok:true};}
  if(route==='/api/rankings'&&method==='GET'){
   const [cash,account,companies]=await Promise.all([get('leaderboards/cash'),get('sparkAccounts/'+user.uid),allRows(db,'companies')]);
   const books=await Promise.all(companies.map(c=>get('sparkBooks/'+c.id)));
   const own=accountAssets(account,Object.fromEntries(companies.map(c=>[c.id,c])),Object.fromEntries(books.filter(Boolean).map(b=>[b.id,b])));
   return {cash,myCash:own.cash,myTotalValue:own.totalValue,...await marketRankings(db,companies,books.filter(Boolean))};
  }
  if(route==='/api/investor-profile'&&method==='GET'){
   const id=url.searchParams.get('id');if(!/^[a-f0-9]{64}$/.test(id||''))message('순위표에서 참가자를 선택하세요.');
   const snapshot=await get('investorSnapshots/'+id);if(!snapshot)message('집계된 보유 현황이 없습니다. 순위표를 새로고침하세요.');
   return {name:snapshot.name,cash:snapshot.cash,holdings:snapshot.holdings,updatedAt:snapshot.updatedAt};
  }
  if(route==='/api/news-detail'&&method==='GET'){const id=url.searchParams.get('id');if(!newsId(id))message('뉴스 주소를 확인하세요.');const news=await get((url.searchParams.get('kind')==='event'?'events/':'news/')+id);if(!news)message('뉴스가 없거나 삭제되었습니다.');return {news};}
  if(route==='/api/news-comments'&&method==='GET'){const cursor=url.searchParams.get('cursor');return readComments(db,user.uid,url.searchParams.get('id'),cursor?JSON.parse(cursor):null);}
  if(method==='POST'&&['/api/news-comment','/api/news-vote','/api/news-comment-delete'].includes(route)){
   const b=JSON.parse(options.body||'{}');if(route==='/api/news-comment')await postComment(db,user.uid,b.newsId,b.id,b.content);
   if(route==='/api/news-vote')return {ok:true,...await voteComment(db,user.uid,b.newsId,b.id,b.value)};
   if(route==='/api/news-comment-delete'){if(profile.role!=='admin')message('관리자만 댓글을 삭제할 수 있습니다.');await removeComment(db,b.newsId,b.id);}return {ok:true};
  }
  if(route==='/api/company-investor'&&method==='GET'){
   const cid=url.searchParams.get('companyId');if(!newsId(cid))message('기업을 선택하세요.');
   const [company,ops,book,account,effects,events,investments]=await Promise.all([get('companies/'+cid),get('companyOperations/'+cid),get('sparkBooks/'+cid),get('sparkAccounts/'+user.uid),effectRecords(db,cid),list('events',100,'startsAt desc'),investmentsFor(cid)]);
   if(!company)message('기업을 찾을 수 없습니다.');
   return investorSnapshot({companyId:cid,ops,book,account,effects,events,investments});
  }
  if(route==='/api/company-events'&&method==='GET')return plain(await eventCompanyView(db,url.searchParams.get('companyId')));
  if(method==='POST'&&['/api/event-publish','/api/event-random','/api/event-close','/api/event-choose','/api/event-apply'].includes(route)){
   const b=JSON.parse(options.body||'{}');
   if(route==='/api/event-publish'||route==='/api/event-random'||route==='/api/event-close'){
    if(profile.role!=='admin')message('관리자만 이벤트를 발행할 수 있습니다.');
    return route==='/api/event-publish'?publishEvent(db,b):route==='/api/event-close'?closeChoiceEvent(db,b.id):applyRandomEvent(db,b.id);
   }
   return route==='/api/event-choose'?chooseEvent(db,b.companyId,b.id,b.option):applyEvent(db,b.companyId,b.id,b.option,{operator:profile.role==='admin'});
  }
  if(route==='/api/economy-production'&&method==='POST'){
   if(profile.role!=='admin')message('관리자만 기존 매출을 분류할 수 있습니다.');const b=JSON.parse(options.body||'{}');
   if(!newsId(b.companyId))message('기업을 선택하세요.');
   await runTransaction(db,async t=>{const ref=doc(db,'companyOperations',b.companyId),s=await t.get(ref),o=s.data();if(!o||o.locked||o.production)message('분류가 완료됐거나 정산 중입니다.');
    for(const [key,total] of [['production',o.revenue],['pendingProduction',o.pendingRevenue]]){const p=b[key];if(!p||Object.keys(p).length!==3||['factory','equipment','research'].some(k=>!Number.isSafeInteger(p[k])||p[k]<0||(!o[k]&&p[k]>0))||p.factory+p.equipment+p.research!==total)message('종류별 매출 합계가 기존 매출과 일치해야 합니다.');}
    t.update(ref,{production:b.production,pendingProduction:b.pendingProduction});});return {ok:true};
  }
  if(route==='/api/economy'&&method==='GET'){
   const cid=url.searchParams.get('companyId');if(!newsId(cid))message('기업을 선택하세요.');
   const assigned=profile.role==='president'&&(await get('assignments/'+user.uid))?.companyIds?.includes(cid);
   if(profile.role==='admin'||assigned)await initializeOperations(db,cid);
   return operationsView(db,cid);
  }
  if(route==='/api/spies'&&method==='GET'){const cid=url.searchParams.get('companyId');if(!newsId(cid))message('기업을 선택하세요.');return spyView(db,cid);}
  if(route==='/api/spy-policy'&&method==='POST'){if(profile.role!=='admin')message('관리자만 설정할 수 있습니다.');const policy=spyPolicy(JSON.parse(options.body||'{}'));await runTransaction(db,async t=>t.set(doc(db,'spyPolicy/main'),policy));return {ok:true};}
  if(route==='/api/spy-hire'&&method==='POST'){const b=JSON.parse(options.body||'{}');const assigned=profile.role==='president'&&(await get('assignments/'+user.uid))?.companyIds?.includes(b.companyId);if(profile.role!=='admin'&&!assigned)message('담당 사장 또는 관리자만 고용할 수 있습니다.');return hireSpy(db,b.companyId,b.targetId);}
  if(route==='/api/economy-config'&&method==='GET')return {config:effectiveConfig(await get('economyConfig/main'))};
  if(method==='POST'&&['/api/economy-invest','/api/economy-prepare','/api/economy-rate','/api/economy-settle','/api/economy-config'].includes(route)){
   const b=JSON.parse(options.body||'{}');
   if(route==='/api/economy-config'){if(profile.role!=='admin')message('관리자만 설정할 수 있습니다.');const c=validateConfig(b);await runTransaction(db,async t=>t.set(doc(db,'economyConfig','main'),c));return {ok:true};}
   const cid=b.companyId;if(typeof cid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(cid))message('기업을 선택하세요.');
   const assigned=profile.role==='president'&&(await get('assignments/'+user.uid))?.companyIds?.includes(cid);
   if(profile.role!=='admin'&&!assigned)message('담당 사장 또는 관리자만 사용할 수 있습니다.');
   if(route==='/api/economy-prepare'){await initializeOperations(db,cid);return {ok:true};}
   if(route==='/api/economy-invest'){await invest(db,cid,b.asset);return {ok:true};}
   if(route==='/api/economy-settle'){if(profile.role!=='admin')message('일일 정산은 관리자만 실행할 수 있습니다.');const result=await settleDay(db,cid);return {...result,spies:{status:'scheduled'}};}
   if(!Number.isSafeInteger(b.dividendBps)||b.dividendBps<0||b.dividendBps>10000)message('배당률은 0~100%로 입력하세요.');
   await runTransaction(db,async t=>{const r=doc(db,'companyOperations',cid),o=await t.get(r);if(!o.exists()||o.data().locked)message('회사 계좌 준비 또는 진행 중인 정산 완료가 필요합니다.');t.update(r,{dividendBps:b.dividendBps});});return {ok:true};
  }
  if(route==='/api/exchange'&&method==='GET')return sparkView(db,user.uid,url.searchParams.get('companyId'),profile.role);
  if(route==='/api/limit-order'&&method==='POST'){
   const b=JSON.parse(options.body||'{}');await initializeSpark(db,user.uid,b.companyId);
   let result;
   try{result=await placeSpark(db,user.uid,b);}catch(error){
    // Deterministic rejection must unlock the form for a corrected order.
    if(!error.code||error.code==='invalid-argument'||error.code==='failed-precondition')error.status=400;
    if(error.code==='permission-denied')error.status=403;
    throw error;
   }
   const history=await marketHistory(db,b.companyId,1);
   try{for(let i=0;i<8;i++)if(!await matchSpark(db,user.uid,b.companyId,{recordPublic:history.available}))break;}catch(error){return {...result,order:await get(`sparkAccounts/${user.uid}/orders/${b.orderId}`),matchPending:true,matchError:error.code==='permission-denied'?'주문은 접수됐지만 체결 권한 확인에 실패했습니다. 호가 새로고침 후에도 계속되면 관리자에게 문의하세요.':'주문은 접수됐지만 체결 처리가 지연됐습니다. 호가 새로고침으로 결과를 확인하세요.'};}
   return {...result,order:await get(`sparkAccounts/${user.uid}/orders/${b.orderId}`)};
  }
  if(route==='/api/cancel-order'&&method==='POST'){
   const b=JSON.parse(options.body||'{}');
   if(b.ownerUid&&b.ownerUid!==user.uid&&profile.role!=='admin')message('본인 주문만 취소할 수 있습니다.');
   if(!b.companyId)b.companyId=(await get(`sparkAccounts/${user.uid}/orders/${b.orderId}`))?.companyId;
   return cancelSpark(db,user.uid,b);
  }
  if(route==='/api/me'&&method==='GET'){
   // Populate legacy profiles from this account's verified Auth identity only.
   // A delayed contact update must not prevent a successful sign-in.
   if(profile.role!=='admin'&&school(claims)&&profile.email!==claims.email.toLowerCase()){
    void updateDoc(doc(db,'users',user.uid),{email:claims.email.toLowerCase()}).catch(()=>{});
   }
   return {authenticated:true,user:{id:user.uid,displayName:profile.displayName,role:profile.role}};
  }
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
   if(kind==='news'){data.publishedAt=serverTimestamp();data.companyName='';}
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
   });if(kind==='users')await publishLeadership(db);return {ok:true,id:item.id};
  }
  const kind=route.split('/').at(-1);
  if(method==='GET'&&kind==='companies'){const [companies,leadership]=await Promise.all([list('companies',100,'ticker'),get('companyLeadership/main')]);return {companies:companies.map(c=>({...c,presidentNames:leadership?.companies?.[c.id]||[]}))};}
  if(method==='GET'&&kinds[kind])return {[kind]:await list(kind,kinds[kind][1],kinds[kind][0])};
  if(route==='/api/trading-portfolio'&&method==='GET'){
   const ledger=await accountLedger(db,user.uid),account=ledger.account;
   const ids=[...new Set([...Object.keys(account?.positions||{}),...Object.keys(account?.reservedPositions||{}),...ledger.fills.map(f=>f.companyId)])];if(ids.some(id=>!/^[A-Za-z0-9_-]{1,128}$/.test(id)))message('보유 기업 ID를 확인하세요.');const rows=await Promise.all(ids.map(async id=>({id,company:await get('companies/'+id),book:await get('sparkBooks/'+id)})));
   const portfolio=tradingPortfolio(account,Object.fromEntries(rows.map(r=>[r.id,r.company])),Object.fromEntries(rows.map(r=>[r.id,r.book])));
   return {...portfolio,holdings:portfolio.holdings.map(h=>({...h,...ledger.costBasis[h.companyId]})),transactions:ledger.fills.map(f=>({...plain(f),name:rows.find(r=>r.id===f.companyId)?.company?.name||f.companyId}))};
  }
  if(route==='/api/dividends'&&method==='GET')return {dividends:await list('sparkAccounts/'+user.uid+'/dividends',30,'createdAt desc')};
  if(route==='/api/portfolio'&&method==='GET'){const p=await get(`portfolios/${user.uid}`);if(!p)message('자산이 아직 초기화되지 않았습니다.');if(!Number.isSafeInteger(p.cash)||p.cash<0||!Array.isArray(p.holdings)||!Number.isSafeInteger(p.version))message('자산 형식을 확인하세요.');return {cash:p.cash,holdings:p.holdings,version:p.version};}
  if(route==='/api/my-company'&&method==='GET'){const ids=(await get(`assignments/${user.uid}`))?.companyIds||[];if(ids.length>5||ids.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x)))message('담당 기업 설정을 확인하세요.');return {companies:(await Promise.all(ids.map(id=>get(`companies/${id}`)))).filter(Boolean)};}
  message('지원하지 않는 요청입니다.');
 };
}

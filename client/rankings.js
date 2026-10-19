import {investorSnapshot} from './investor.js';
import {effectRecords} from './events.js';
import {tradingPortfolio} from './portfolio.js';
import {collection,getDoc,getDocs,query,orderBy,limit,startAfter,documentId,doc,writeBatch,serverTimestamp,where,Timestamp} from 'firebase/firestore';
import {koreaDayStart,dayChange} from './market-session.js';
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
// Calculate competition ranks before truncating; never publish account IDs/email.
function ranked(rows,key,ascending=false){const sorted=rows.sort((a,b)=>(ascending?a[key]-b[key]:b[key]-a[key])||a.name.localeCompare(b.name,'ko'));let previous,place=0;return sorted.map((r,i)=>{if(r[key]!==previous)place=i+1;previous=r[key];return {...r,rank:place};});}
export function accountAssets(account,companies,books){return tradingPortfolio(account?{reservedCash:0,positions:{},reservedPositions:{},version:0,...account}:null,companies,books);}
function assetRows(users,accounts,companies=[],books=[]){
 const companyMap=Object.fromEntries(companies.map(c=>[c.id,c])),bookMap=Object.fromEntries(books.map(b=>[b.id,b]));
 const map=new Map(accounts.map(a=>[a.id,a]));
 return users.filter(u=>u.active===true&&['student','president'].includes(u.role)).map(u=>{const a=accountAssets(map.get(u.id),companyMap,bookMap);if(!a.valuationComplete)throw Error('보유 주식의 현재 가격을 확인할 수 없어 자산 순위를 갱신하지 않았습니다.');return {uid:u.id,portfolio:a,name:String(u.displayName||'참가자').slice(0,80),cash:a.cash,stockValue:a.stockValue,totalValue:a.totalValue};});
}
export function cashRankings(users,accounts,companies=[],books=[]){
 const rows=assetRows(users,accounts,companies,books).map(({uid,portfolio,...row})=>row);
 return {entries:ranked(rows,'totalValue').slice(0,100),participants:rows.length};
}
export function priceRankings(companies,books,max=100){
 const map=new Map(books.map(b=>[b.id,b]));
 return ranked(companies.filter(c=>['listed','paused'].includes(c.status)).map(c=>{const last=map.get(c.id)?.lastPrice,initial=!(money(last)&&last>0),price=initial?c.referencePrice:last;if(!money(price)||price<1)throw Error('종목 가격을 확인하세요.');return {id:c.id,name:c.name,ticker:c.ticker,price,initial,paused:c.status==='paused'};}),'price').slice(0,max);
}
export async function allRows(db,path,reads){const readDocs=reads?.getDocs||getDocs;let cursor=null,rows=[];for(;;){const page=await readDocs(query(collection(db,path),orderBy(documentId()),limit(100),...(cursor?[startAfter(cursor)]:[])));rows.push(...page.docs.map(d=>({id:d.id,...d.data()})));if(page.size<100)return rows;cursor=page.docs.at(-1);}}
export async function investorSnapshots(users,accounts,companies=[],books=[]){
 const rows=assetRows(users,accounts,companies,books),generation=crypto.randomUUID();
 const profiles=await Promise.all(ranked(rows,'totalValue').slice(0,100).map(async ({uid,portfolio,...row})=>{
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('hcujusik-investor:'+uid));
  const key=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  return {key,entry:{...row,investorKey:key},profile:{name:row.name,cash:row.cash,generation,holdings:portfolio.holdings.map(({companyId,name,ticker,quantity})=>({companyId,name,ticker,quantity}))}};
 }));
 return {board:{entries:profiles.map(p=>p.entry),participants:rows.length,generation},profiles};
}
export async function publishCashRankings(db){
 const [users,accounts,companies]=await Promise.all([allRows(db,'users'),allRows(db,'sparkAccounts'),allRows(db,'companies')]);const books=await Promise.all(companies.map(async c=>{const s=await getDoc(doc(db,'sparkBooks',c.id));return {id:c.id,...s.data()};}));
 const {board,profiles}=await investorSnapshots(users,accounts,companies,books),batch=writeBatch(db);
 for(const p of profiles)batch.set(doc(db,'investorSnapshots',p.key),{...p.profile,updatedAt:serverTimestamp()});
 batch.set(doc(db,'leaderboards','cash'),{...board,updatedAt:serverTimestamp()});await batch.commit();return board;
}
export function marketRankingLists(prices,sessions){
 const rows=prices.map(p=>{const session=sessions[p.id];return {...p,volume:session?.volume??null,change:session?.change??null};});
 return {prices:rows.slice(0,100),volume:ranked(rows.filter(r=>r.volume!==null),'volume').slice(0,100),gainers:ranked(rows.filter(r=>r.change?.percent>0).map(r=>({...r,percent:r.change.percent})),'percent').slice(0,100),losers:ranked(rows.filter(r=>r.change?.percent<0).map(r=>({...r,percent:r.change.percent})),'percent',true).slice(0,100),unavailable:rows.filter(r=>r.volume===null||r.change===null).length};
}
const marketSessions=new WeakMap();
export async function marketRankings(db,companies,books,now=Date.now(),reads){
 let cache=marketSessions.get(db);if(!cache){cache=new Map();marketSessions.set(db,cache);}
 const prices=priceRankings(companies,books,Infinity),start=koreaDayStart(now),sessions={},revenueTask=companyRevenueRows(db,prices,now,reads);
 await Promise.all(prices.map(async p=>{try{
  const version=books.find(b=>b.id===p.id)?.version,key=JSON.stringify([start,version]),cached=cache.get(p.id);
  if(Number.isSafeInteger(version)&&cached?.key===key){sessions[p.id]={volume:cached.volume,change:dayChange(p.price,cached.close)};return;}
  const path=collection(db,'sparkBooks',p.id,'trades');let cursor=null,volume=0;
  for(;;){const page=await getDocs(query(path,where('createdAt','>=',Timestamp.fromMillis(start)),where('createdAt','<',Timestamp.fromMillis(start+86400000)),orderBy('createdAt'),limit(100),...(cursor?[startAfter(cursor)]:[])));for(const d of page.docs){const q=d.data().quantity;if(!Number.isSafeInteger(q)||q<=0)throw Error('체결 수량 오류');volume+=q;}if(page.size<100)break;cursor=page.docs.at(-1);}
  const previous=await getDocs(query(path,where('createdAt','<',Timestamp.fromMillis(start)),orderBy('createdAt','desc'),limit(1)));
  const close=previous.empty?companies.find(c=>c.id===p.id).referencePrice:previous.docs[0].data().price;
  sessions[p.id]={volume,change:dayChange(p.price,close)};if(Number.isSafeInteger(version))cache.set(p.id,{key,volume,close});
 }catch{sessions[p.id]={volume:null,change:null};}}));
 return {...marketRankingLists(prices,sessions),...revenueRankingLists(prices,await revenueTask),asOf:now,day:new Date(start+32400000).toISOString().slice(0,10)};
}

// Revenue excludes issuer proceeds, grants, spy transfers and dividend movements.
export function companyRevenueMetrics(ops,days,effects=[],now=Date.now()){
 let cumulativeRevenue=0;const seen=new Set();
 for(const d of days){if(!Number.isSafeInteger(d.day)||d.day<0)throw Error('정산 날짜를 확인하세요.');if(d.day>(ops?.lastSettledDay||0))continue;
  if(seen.has(d.day)||!money(d.revenue))throw Error('정산 매출 기록을 확인하세요.');seen.add(d.day);cumulativeRevenue+=d.revenue;if(!Number.isSafeInteger(cumulativeRevenue))throw Error('누적 매출 범위를 초과했습니다.');
 }
 const expectedRevenue=investorSnapshot({ops,effects},now).tomorrowRevenue;
 return {expectedRevenue,cumulativeRevenue};
}
export function revenueRankingLists(prices,revenues){
 const rows=prices.map(p=>({...p,expectedRevenue:revenues[p.id]?.expectedRevenue??null,cumulativeRevenue:revenues[p.id]?.cumulativeRevenue??null}));
 return {expectedRevenue:ranked(rows.filter(r=>r.expectedRevenue!==null),'expectedRevenue').slice(0,100),cumulativeRevenue:ranked(rows.filter(r=>r.cumulativeRevenue!==null),'cumulativeRevenue').slice(0,100),expectedRevenueUnavailable:rows.filter(r=>r.expectedRevenue===null).length,cumulativeRevenueUnavailable:rows.filter(r=>r.cumulativeRevenue===null).length};
}
const revenueTotals=new WeakMap();
async function completedRevenueTotal(db,cid,ops){
 const completed=ops?.lastSettledDay??0;if(!Number.isSafeInteger(completed)||completed<0||completed>1000000)throw Error('정산 완료 날짜를 확인하세요.');if(!completed)return 0;
 let cache=revenueTotals.get(db);if(!cache){cache=new Map();revenueTotals.set(db,cache);}const previous=cache.get(cid),base=previous&&previous.day<=completed?previous:{day:0,total:0};if(base.day===completed)return base.total;
 let cursor=null,total=base.total;const seen=new Set();
 for(;;){const page=await getDocs(query(collection(db,'companyOperations',cid,'days'),where('day','>',base.day),where('day','<=',completed),orderBy('day'),limit(30),...(cursor?[startAfter(cursor)]:[])));
  for(const doc of page.docs){const d=doc.data();if(!Number.isSafeInteger(d.day)||seen.has(d.day)||!money(d.revenue))throw Error('정산 매출 기록을 확인하세요.');seen.add(d.day);total+=d.revenue;if(!Number.isSafeInteger(total))throw Error('누적 매출 범위를 초과했습니다.');}
  if(page.size<30)break;cursor=page.docs.at(-1);
 }
 cache.set(cid,{day:completed,total});return total;
}
async function companyRevenueRows(db,prices,now,reads){
 const readDoc=reads?.getDoc||getDoc;
 return Object.fromEntries(await Promise.all(prices.map(async p=>{try{
  const ops=(await readDoc(doc(db,'companyOperations',p.id))).data(),[effects,days]=await Promise.allSettled([effectRecords(db,p.id,{revision:ops?.lastEvent||'',persistent:true}),completedRevenueTotal(db,p.id,ops)]);
  let expectedRevenue=null,cumulativeRevenue=null;
  if(effects.status==='fulfilled')try{expectedRevenue=companyRevenueMetrics(ops,[],effects.value,now).expectedRevenue;}catch{}
  if(days.status==='fulfilled')cumulativeRevenue=days.value;
  return [p.id,{expectedRevenue,cumulativeRevenue}];
 }catch{return [p.id,{expectedRevenue:null,cumulativeRevenue:null}];}})));
}

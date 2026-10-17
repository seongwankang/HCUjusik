import {tradingPortfolio} from './portfolio.js';
import {collection,getDoc,getDocs,query,orderBy,limit,startAfter,documentId,doc,setDoc,serverTimestamp} from 'firebase/firestore';
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
// Calculate competition ranks before truncating; never publish account IDs/email.
function ranked(rows,key){const sorted=rows.sort((a,b)=>b[key]-a[key]||a.name.localeCompare(b.name,'ko'));let previous,place=0;return sorted.map((r,i)=>{if(r[key]!==previous)place=i+1;previous=r[key];return {...r,rank:place};});}
export function accountAssets(account,companies,books){return tradingPortfolio(account?{reservedCash:0,positions:{},reservedPositions:{},version:0,...account}:null,companies,books);}
export function cashRankings(users,accounts,companies=[],books=[]){
 const companyMap=Object.fromEntries(companies.map(c=>[c.id,c])),bookMap=Object.fromEntries(books.map(b=>[b.id,b]));
 const map=new Map(accounts.map(a=>[a.id,a]));
 const rows=users.filter(u=>u.active===true&&['student','president'].includes(u.role)).map(u=>{const a=accountAssets(map.get(u.id),companyMap,bookMap);if(!a.valuationComplete)throw Error('보유 주식의 현재 가격을 확인할 수 없어 자산 순위를 갱신하지 않았습니다.');return {name:String(u.displayName||'참가자').slice(0,80),cash:a.cash,stockValue:a.stockValue,totalValue:a.totalValue};});
 return {entries:ranked(rows,'totalValue').slice(0,100),participants:rows.length};
}
export function priceRankings(companies,books){
 const map=new Map(books.map(b=>[b.id,b]));
 return ranked(companies.filter(c=>['listed','paused'].includes(c.status)).map(c=>{const last=map.get(c.id)?.lastPrice,initial=!(money(last)&&last>0),price=initial?c.referencePrice:last;if(!money(price)||price<1)throw Error('종목 가격을 확인하세요.');return {id:c.id,name:c.name,ticker:c.ticker,price,initial,paused:c.status==='paused'};}),'price').slice(0,100);
}
export async function allRows(db,path){let cursor=null,rows=[];for(;;){const page=await getDocs(query(collection(db,path),orderBy(documentId()),limit(100),...(cursor?[startAfter(cursor)]:[])));rows.push(...page.docs.map(d=>({id:d.id,...d.data()})));if(page.size<100)return rows;cursor=page.docs.at(-1);}}
export async function publishCashRankings(db){const [users,accounts,companies]=await Promise.all([allRows(db,'users'),allRows(db,'sparkAccounts'),allRows(db,'companies')]);const books=await Promise.all(companies.map(async c=>{const s=await getDoc(doc(db,'sparkBooks',c.id));return {id:c.id,...s.data()};}));const result=cashRankings(users,accounts,companies,books);await setDoc(doc(db,'leaderboards','cash'),{...result,updatedAt:serverTimestamp()});return result;}

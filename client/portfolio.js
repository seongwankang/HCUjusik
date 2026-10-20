import {INITIAL_CASH} from './initial-capital.js';
const integer=(v,max=1000000000000)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
export function tradingPortfolio(account,companies,books){
 const a=account||{cash:INITIAL_CASH,reservedCash:0,positions:{},reservedPositions:{},version:0};
 if(!integer(a.cash)||!integer(a.reservedCash,a.cash)||!integer(a.version)||!a.positions||typeof a.positions!=='object'||Array.isArray(a.positions)||!a.reservedPositions||typeof a.reservedPositions!=='object'||Array.isArray(a.reservedPositions))throw new Error('거래 계좌 형식을 확인하세요.');
 let stockValue=0,valuationComplete=true;
 const holdings=[];
 for(const id of new Set([...Object.keys(a.positions),...Object.keys(a.reservedPositions)])){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('보유 기업 ID를 확인하세요.');
  const quantity=a.positions[id]??0,reserved=a.reservedPositions[id]??0;
  if(!integer(quantity,1000000)||!integer(reserved,quantity))throw new Error('보유 주식 수량을 확인하세요.');
  if(!quantity)continue;
  const company=companies[id],last=books[id]?.lastPrice,reference=company?.referencePrice;
  const price=integer(last,1000000)&&last>0?last:integer(reference,1000000)&&reference>0?reference:null;
  if(price===null)valuationComplete=false;else stockValue+=quantity*price;
  holdings.push({companyId:id,name:company?.name||id,ticker:company?.ticker||id,quantity,reserved,available:quantity-reserved,price,priceSource:last===price?'last':'initial',value:price===null?null:quantity*price});
 }
 return {initialized:!!account,cash:a.cash,reservedCash:a.reservedCash,availableCash:a.cash-a.reservedCash,holdings,valuationComplete,stockValue:valuationComplete?stockValue:null,totalValue:valuationComplete?a.cash+stockValue:null,version:a.version};
}

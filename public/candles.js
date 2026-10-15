export const INTERVALS={minute:60000,five:300000,day:86400000};
const KST=9*3600000;
export function tradeTime(value){
 try{
  const n=typeof value?.toMillis==='function'?value.toMillis():
   value instanceof Date?value.getTime():typeof value==='number'?value:
   typeof value==='string'?Date.parse(value):
   Number.isFinite(value?.seconds)?value.seconds*1000+(value.nanoseconds||0)/1e6:NaN;
  return Number.isFinite(n)&&n>=0&&n<=8640000000000000?n:NaN;
 }catch{return NaN;}
}
// Input is a bounded recent-trade window; never invent prices for empty buckets.
export function aggregateCandles(trades,interval='minute'){
 const step=INTERVALS[interval];if(!step)throw new Error('지원하지 않는 차트 주기입니다.');
 const valid=trades.filter(t=>Number.isSafeInteger(t.price)&&t.price>0&&t.price<=1000000&&Number.isSafeInteger(t.quantity)&&t.quantity>0&&t.quantity<=1000000&&Number.isFinite(tradeTime(t.createdAt)))
  .sort((a,b)=>(b.marketVersion||0)-(a.marketVersion||0)).slice(0,100)
  .sort((a,b)=>tradeTime(a.createdAt)-tradeTime(b.createdAt)||(a.marketVersion||0)-(b.marketVersion||0));
 const buckets=new Map();
 for(const t of valid){
  const time=tradeTime(t.createdAt),offset=interval==='day'?KST:0,start=Math.floor((time+offset)/step)*step-offset;
  let bar=buckets.get(start);
  if(!bar){bar={time:start,open:t.price,high:t.price,low:t.price,close:t.price,volume:0,count:0};buckets.set(start,bar);}
  bar.high=Math.max(bar.high,t.price);bar.low=Math.min(bar.low,t.price);bar.close=t.price;bar.volume+=t.quantity;bar.count++;
 }
 return [...buckets.values()];
}

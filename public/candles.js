export const INTERVALS={minute:60000,five:300000,halfHour:1800000,twoHours:7200000,sixHours:21600000,day:86400000};
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

export const CHART_RANGES={
 '1d':{label:'1일',duration:24*3600000,interval:'halfHour'},
 '3d':{label:'3일',duration:3*86400000,interval:'twoHours'},
 '7d':{label:'7일',duration:7*86400000,interval:'sixHours'}
};
export function rangeCandles(trades,key='1d',now=Date.now(),zoom=1){
 const range=CHART_RANGES[key];if(!range||!Number.isFinite(now)||!Number.isFinite(zoom)||zoom<1||zoom>8)throw new Error('지원하지 않는 차트 기간입니다.');
 const from=now-range.duration/zoom;
 const recent=trades.slice().sort((a,b)=>(b.marketVersion||0)-(a.marketVersion||0)).slice(0,100);
 const filtered=recent.filter(t=>tradeTime(t.createdAt)>=from&&tradeTime(t.createdAt)<=now);
 return {bars:aggregateCandles(filtered,range.interval),interval:range.interval,from,to:now,label:range.label,count:filtered.length};
}

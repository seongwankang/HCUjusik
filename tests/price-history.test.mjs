import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateCandles,tradeTime,rangeCandles,CHART_RANGES} from '../public/candles.js';
import {priceHistory} from '../public/price-history.js';
const trade=(price,quantity,time,marketVersion)=>({price,quantity,createdAt:time,marketVersion});
test('unordered market fills form correct OHLC and sum quantities, never prices',()=>{
 const rows=[trade(110,2,'2026-10-15T00:00:30Z',3),trade(100,3,'2026-10-15T00:00:01Z',1),trade(90,5,'2026-10-15T00:00:10Z',2),trade(105,1,'2026-10-15T00:00:45Z',4)];
 const [bar]=aggregateCandles(rows);
 assert.deepEqual(bar,{time:Date.parse('2026-10-15T00:00:00Z'),open:100,high:110,low:90,close:105,volume:11,count:4});
 assert.equal(rows[0].price,110);
});
test('minute/five-minute boundaries and Korean midnight buckets preserve real gaps',()=>{
 const rows=[trade(100,1,'2026-10-15T14:59:59Z',1),trade(120,2,'2026-10-15T15:00:00Z',2),trade(110,3,'2026-10-15T15:04:59Z',3),trade(130,4,'2026-10-15T15:10:00Z',4)];
 assert.equal(aggregateCandles(rows).length,4);
 const five=aggregateCandles(rows,'five');assert.equal(five.length,3);assert.equal(five[1].volume,5);assert.equal(five[1].close,110);
 const day=aggregateCandles(rows,'day');assert.equal(day.length,2);assert.equal(day[1].time,Date.parse('2026-10-15T15:00:00Z'));assert.equal(day[1].volume,9);
});
test('timestamp representations, same-time ordering, bounded input and invalid fields',()=>{
 const time=Date.parse('2026-10-15T00:00:00Z');
 assert.equal(tradeTime({seconds:time/1000,nanoseconds:0}),time);assert.equal(tradeTime({toMillis:()=>time}),time);assert.equal(tradeTime(new Date(time)),time);
 assert.deepEqual(aggregateCandles([trade('<script>',1,time,1),trade(100,-1,time,2),trade(100,1,'invalid',3)]),[]);
 const rows=Array.from({length:145},(_,i)=>trade(100+i,1,time,i+1)).reverse();
 const [bar]=aggregateCandles(rows);assert.equal(bar.count,100);assert.equal(bar.open,145);assert.equal(bar.close,244);assert.equal(bar.volume,100);
 assert.throws(()=>aggregateCandles(rows,'unknown'));
});
test('empty/single-trade candles are honest and flat trades render without invented volatility',()=>{
 assert.match(priceHistory([]),/첫 체결/);
 const one=priceHistory([trade(11000,2,'2026-10-15T00:00:00Z',1)]);
 assert.match(one,/종목 전체 1분봉 1개/);assert.match(one,/거래량 2주/);assert.doesNotMatch(one,/NaN|Infinity|<script>/);
});
test('candles display real wicks and rising/falling colors with volume and Korean time labels',()=>{
 const rows=[trade(100,2,'2026-10-15T00:00:00Z',1),trade(120,3,'2026-10-15T00:00:05Z',2),trade(110,1,'2026-10-15T00:00:10Z',3),trade(110,1,'2026-10-15T00:01:00Z',4),trade(90,1,'2026-10-15T00:01:05Z',5)];
 const html=priceHistory(rows);assert.match(html,/#d95f72/);assert.match(html,/#507fc8/);assert.match(html,/시가 100 · 고가 120 · 저가 100 · 종가 110 · 거래량 6주/);assert.match(html,/09:00/);
});

test('period buttons filter real elapsed time and exclude future trades',()=>{
 const now=Date.parse('2026-10-15T06:00:00Z'),hour=3600000;
 const rows=[trade(100,1,now-8*24*hour,1),trade(110,1,now-4*24*hour,2),trade(120,1,now-2*24*hour,3),trade(130,1,now-12*hour,4),trade(140,1,now-5*hour,5),trade(150,1,now-2*hour,6),trade(160,1,now,7),trade(170,1,now+1,8)];
 assert.deepEqual(Object.keys(CHART_RANGES),['1d','3d','7d']);assert.equal(rangeCandles(rows,undefined,now).count,4);
 assert.equal(rangeCandles(rows,'1d',now).count,4);
 assert.equal(rangeCandles(rows,'3d',now).count,5);
 assert.equal(rangeCandles(rows,'7d',now).count,6);
 for(const key of Object.keys(CHART_RANGES)){const view=rangeCandles(rows,key,now);assert.equal(view.from,now-CHART_RANGES[key].duration);assert.equal(view.to,now);assert.ok(!view.bars.some(b=>b.close===170));}
});
test('automatic candle density stays manageable and zoom narrows the selected range',()=>{
 const now=Date.parse('2026-10-15T06:00:00Z');
 for(const key of Object.keys(CHART_RANGES)){
  const range=CHART_RANGES[key],rows=Array.from({length:100},(_,i)=>trade(100+i,1,now-range.duration+i*range.duration/99,i));
  const full=rangeCandles(rows,key,now),zoom=rangeCandles(rows,key,now,2);
  assert.ok(full.bars.length<=65);assert.equal(full.count,100);assert.ok(zoom.count<full.count);assert.ok(zoom.from>full.from);
 }
 assert.throws(()=>rangeCandles([],'bogus',now));assert.throws(()=>rangeCandles([],'1d',now,0));
});

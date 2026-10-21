import {companyFinancialsMarkup} from '../public/company-financials.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {batchPaint} from '../public/render-batch.js';

test('twenty-one quote notifications share one paint and the next frame still renders new prices',()=>{
 const frames=[];let paints=0,value=0,shown;
 const update=batchPaint(()=>{paints++;shown=value;},fn=>frames.push(fn));
 for(let n=0;n<21;n++){value=n;update();}
 assert.equal(frames.length,1);frames.shift()();assert.equal(paints,1);assert.equal(shown,20);
 value=30;update();frames.shift()();assert.equal(paints,2);assert.equal(shown,30);
});

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const initial=source.slice(source.indexOf('async function initialLoad('),source.indexOf("$('button[data-page]')",source.indexOf('async function initialLoad(')));
function fixture(){
 let resolveNews,rejectNews,generation=1,rendered=0,routed=0;
 const news=new Promise((a,b)=>{resolveNews=a;rejectNews=b;}),state={user:{id:'student'},news:[],companies:[]},notice={};
 const context={state,newsRead:0,sessionVersion:()=>generation,getJSON:path=>path==='/api/news'?news:Promise.resolve({companies:[{id:'one'}]}),refreshSession:async()=>{},renderCompanies:()=>{},renderNews:()=>rendered++,startQuotes:async()=>{},applyRoute:()=>routed++,$:()=>notice};
 runInNewContext(initial+';this.load=initialLoad;',context);
 return {context,state,notice,resolveNews,rejectNews,advance:()=>generation++,renders:()=>rendered,routes:()=>routed};
}
test('slow news does not hold the first usable screen; news appears when it arrives',async()=>{
 const f=fixture();await f.context.load();assert.equal(f.routes(),1);assert.equal(f.state.companies[0].id,'one');assert.equal(f.state.news.length,0);
 f.resolveNews({news:[{title:'Later'}]});await new Promise(r=>setImmediate(r));assert.equal(f.state.news[0].title,'Later');assert.equal(f.renders(),2);
});
test('a deferred news result cannot reappear after account changes; network failure is handled',async()=>{
 const f=fixture();await f.context.load();f.advance();f.resolveNews({news:[{title:'Old account'}]});await new Promise(r=>setImmediate(r));assert.equal(f.state.news.length,0);
 const g=fixture();await g.context.load();g.rejectNews(Error('offline'));await new Promise(r=>setImmediate(r));assert.equal(g.routes(),1);assert.match(g.notice.textContent,/불러오지 못했습니다/);
});
const exchangeSource=readFileSync(new URL('../public/exchange.js',import.meta.url),'utf8');
const refreshSource=exchangeSource.slice(exchangeSource.indexOf(' function refreshInvestor(){'),exchangeSource.indexOf(" form.addEventListener('submit'"));
test('order refresh finishes before management history and ignores an older history response',async()=>{
 const pending=[];let rendered=0,lastInfo;
 const elements=new Map(),node=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',querySelector:()=>null});return elements.get(key);};
 const data={account:{cash:1000,reservedCash:0,positions:{},reservedPositions:{}},orders:[],fills:[],market:{lastPrice:10000},book:{},costBasis:{}};
 const context={companyFinancialsMarkup,c:{id:'one',referencePrice:10000},box:{querySelector:node},document:{querySelector:node},form:{elements:{price:{value:10000}}},alive:()=>true,request:path=>path.startsWith('/api/company-investor')?new Promise(resolve=>pending.push(resolve)):Promise.resolve(data),captureScroll:()=>[],restoreScroll:()=>{},setHTMLKeepingScroll:(host,html)=>host.innerHTML=html,won:String,renderDayChange:()=>{},renderOrderBook:()=>'',priceChart:{update:()=>{}},lock:()=>{},renderInvestor:(host,info)=>{rendered++;lastInfo=info;}};
 runInNewContext('let investorRead=0,investorLoading=false,investorQueued=false;'+refreshSource+';this.refresh=refresh;',context);
 await context.refresh();assert.equal(pending.length,1);assert.equal(rendered,0);assert.equal(context.connected,true);
 await context.refresh();await context.refresh();assert.equal(pending.length,1);pending[0]({version:1});await new Promise(r=>setImmediate(r));assert.equal(rendered,0);assert.equal(pending.length,2);
 pending[1]({version:2});await new Promise(r=>setImmediate(r));assert.equal(rendered,1);assert.equal(lastInfo.version,2);
});

test('touch candle selection survives lifting the finger, while native scroll cancellation hides it',()=>{
 const source=readFileSync(new URL('../public/price-history.js',import.meta.url),'utf8');
 const bindings=source.slice(source.indexOf("svg.addEventListener('pointerenter'"),source.indexOf("svg.addEventListener('keydown'"));
 const handlers={};let inspected=0,hidden=0;
 runInNewContext(bindings,{svg:{addEventListener:(name,fn)=>handlers[name]=fn},inspect:()=>inspected++,hide:()=>hidden++});
 handlers.pointerenter({pointerType:'touch'});handlers.pointermove({pointerType:'touch'});assert.equal(inspected,0);
 handlers.pointerdown({pointerType:'touch'});handlers.pointerleave({pointerType:'touch'});assert.equal(inspected,1);assert.equal(hidden,0);
 handlers.pointercancel({pointerType:'touch'});assert.equal(hidden,1);
 handlers.pointerenter({pointerType:'mouse'});handlers.pointerleave({pointerType:'mouse'});assert.equal(inspected,2);assert.equal(hidden,2);
});

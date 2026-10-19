import {aggregateCandles,CHART_RANGES,rangeCandles,INTERVALS} from './candles.js';
const n=value=>Number(value).toLocaleString('ko-KR');
const dateFormats=new Map();
const stamp=(time,day=false)=>{
 let formatter=dateFormats.get(day);if(!formatter){formatter=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',...(day?{}:{hour:'2-digit',minute:'2-digit',hour12:false})});dateFormats.set(day,formatter);}return formatter.format(time);
};
const period={minute:'1분봉',five:'5분봉',day:'일봉',halfHour:'자동 봉',twoHours:'자동 봉',sixHours:'자동 봉'};
const UP='#d95f72',DOWN='#507fc8',FLAT='#858b9a';
function geometry(bars,slots,window){
 const low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high)),pad=Math.max((high-low)*.12,low*.006,1),min=Math.max(0,low-pad),max=high+pad;
 let slot=720/(Math.max(10,slots??Math.max(30,bars.length))+4);
 const x=window?i=>28+720*Math.max(0,Math.min(1,(bars[i].time-window.from)/(window.to-window.from))):i=>28+720-slot*(bars.length-i+3);
 if(window)slot=720*INTERVALS[window.interval]/(window.to-window.from);
 const y=p=>30+(max-p)/(max-min)*195;
 return {low,high,min,max,slot,x,y};
}
export function candleMarkup(bars,interval,slots,window){
 if(!bars.length)return '<div class="chart-empty candle-empty"><span aria-hidden="true">▥</span><strong>첫 체결을 기다리고 있어요</strong><p>이 종목의 전체 체결이 쌓이면 봉과 거래량이 표시됩니다.</p></div>';
 const g=geometry(bars,slots,window),width=Math.max(2,Math.min(18,g.slot*.62)),volumeMax=Math.max(1,...bars.map(b=>b.volume));
 const latest=bars.at(-1),color=b=>b.close>b.open?UP:b.close<b.open?DOWN:FLAT;
 const grid=[0,1,2,3,4].map(i=>{const p=g.max-(g.max-g.min)*i/4,y=g.y(p);return `<line x1="20" x2="756" y1="${y}" y2="${y}" class="candle-grid"/><text x="770" y="${y+4}" class="candle-axis">${n(Math.round(p))}</text>`}).join('');
 const marks=bars.map((b,i)=>{const x=g.x(i),y=g.y(Math.max(b.open,b.close)),height=Math.max(1.5,Math.abs(g.y(b.open)-g.y(b.close))),v=b.volume/volumeMax*54;return `<g class="candle-mark" aria-label="${stamp(b.time,interval==='day')} · 시가 ${n(b.open)} · 고가 ${n(b.high)} · 저가 ${n(b.low)} · 종가 ${n(b.close)} · 거래량 ${n(b.volume)}주"><line x1="${x}" x2="${x}" y1="${g.y(b.high)}" y2="${g.y(b.low)}" stroke="${color(b)}" stroke-width="1.4"/><rect x="${x-width/2}" y="${y}" width="${width}" height="${height}" fill="${color(b)}"/><rect x="${x-width/2}" y="${315-v}" width="${width}" height="${v}" fill="${color(b)}" opacity=".65"/></g>`}).join('');
 const ma=bars.map((b,i)=>i<4?null:[g.x(i),g.y(bars.slice(i-4,i+1).reduce((s,x)=>s+x.close,0)/5)]).filter(Boolean);
 const ticks=window?[0,.5,1].map(p=>`<text x="${28+720*p}" y="342" text-anchor="${p===0?'start':p===1?'end':'middle'}" class="candle-axis">${stamp(window.from+(window.to-window.from)*p,window.to-window.from>2*86400000)}</text>`).join(''):[...new Set([0,Math.floor((bars.length-1)/2),bars.length-1])].map(i=>`<text x="${g.x(i)}" y="342" text-anchor="middle" class="candle-axis">${stamp(bars[i].time,interval==='day')}</text>`).join('');
 return `<svg class="candle-svg" viewBox="0 0 850 360" role="img" tabindex="0" aria-label="종목 전체 ${window?window.label:period[interval]} ${bars.length}개. 빨강은 양봉, 파랑은 음봉. 아래 막대는 거래량. 좌우 방향키로 봉 정보를 확인하세요.">${grid}<line x1="20" x2="756" y1="248" y2="248" class="candle-grid"/><text x="25" y="267" class="candle-axis">거래량</text><text x="770" y="280" class="candle-axis">${n(volumeMax)}주</text>${marks}${ma.length>1?`<polyline points="${ma.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#aa8dca" stroke-width="1.4"/>`:''}<line x1="20" x2="756" y1="${g.y(latest.close)}" y2="${g.y(latest.close)}" stroke="${color(latest)}" opacity=".5" stroke-dasharray="4 4"/><rect x="762" y="${g.y(latest.close)-9}" width="80" height="19" rx="2" fill="${color(latest)}"/><text x="802" y="${g.y(latest.close)+4}" text-anchor="middle" fill="white" font-size="11">${n(latest.close)}</text>${ticks}<g class="candle-crosshair" hidden><line data-cross-x y1="20" y2="320"/><line data-cross-y x1="20" x2="756"/></g></svg>`;
}
export function priceHistory(trades,interval='minute'){
 return candleMarkup(aggregateCandles(trades,interval),interval);
}
export function createPriceChart(container){
 let trades=[],range='5h',interval='five',available=null,zoom=1,bars=[],selected=-1,view;
 container.innerHTML=`<div class="candle-controls"><div role="group" aria-label="차트 기간">${Object.entries(CHART_RANGES).map(([key,{label}])=>`<button type="button" data-range="${key}" aria-pressed="${key===range}">${label}</button>`).join('')}</div><div role="group" aria-label="차트 확대 축소"><button type="button" data-zoom="in" aria-label="차트 확대">＋</button><button type="button" data-zoom="out" aria-label="차트 축소">−</button></div><span>전체 참가자 · 최근 100건</span></div><div class="candle-info" aria-live="off"></div><div class="candle-plot"><div class="chart-empty">종목 체결을 불러오는 중…</div></div><div class="candle-caption"><span><i class="candle-up"></i>양봉 <i class="candle-down"></i>음봉 <i class="candle-ma"></i>MA 5</span><span class="candle-touch-hint">봉을 가볍게 누르면 상세 가격이 표시됩니다.</span><span>한국시간</span></div>`;
 const plot=container.querySelector('.candle-plot'),info=container.querySelector('.candle-info');
 function show(index){
  const b=bars[index];if(!b||selected===index)return;selected=index;
  info.innerHTML=`<time>${stamp(b.time,interval==='day')}</time>${[['시',b.open],['고',b.high],['저',b.low],['종',b.close],['거래량',b.volume]].map(([label,value])=>`<span>${label} <b>${n(value)}${label==='거래량'?'주':''}</b></span>`).join('')}`;
 }
 function render(){
  container.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.range===range)));
  container.querySelector('[data-zoom="in"]').disabled=zoom>=8;container.querySelector('[data-zoom="out"]').disabled=zoom<=1;
  view=rangeCandles(available?trades:[],range,Date.now(),zoom);bars=view.bars;interval=view.interval;
  info.textContent='';selected=-1;
  plot.innerHTML=available===false?'<div class="chart-empty"><strong>종목 차트 연결 준비 중</strong><p>전체 체결 기록용 Firestore 규칙을 게시하면 활성화됩니다.</p></div>':bars.length?candleMarkup(bars,interval,undefined,view):'<div class="chart-empty candle-empty"><span aria-hidden="true">▥</span><strong>선택한 기간에 체결이 없습니다</strong><p>다른 기간을 선택하거나 새로운 체결을 기다려 주세요.</p></div>';
  if(!bars.length)return;show(bars.length-1);
  plot.insertAdjacentHTML('beforeend','<div class="candle-tooltip" role="tooltip" hidden></div>');
  const tooltip=plot.querySelector('.candle-tooltip');let tipIndex=-1;
  const svg=plot.querySelector('svg'),g=geometry(bars,undefined,view),cross=svg.querySelector('.candle-crosshair');
  function popup(index,clientX,clientY){
   const b=bars[index];if(tipIndex!==index){tooltip.innerHTML=`<strong>${stamp(b.time)}</strong><dl>${[['시가',b.open],['고가',b.high],['저가',b.low],['종가',b.close],['거래량',b.volume]].map(([label,v])=>`<div><dt>${label}</dt><dd>${n(v)}${label==='거래량'?'주':'원'}</dd></div>`).join('')}</dl>`;tipIndex=index;}
   tooltip.hidden=false;const rect=plot.getBoundingClientRect(),w=tooltip.offsetWidth,h=tooltip.offsetHeight;
   let x=clientX-rect.left+14,y=clientY-rect.top-h-12;
   if(x+w>rect.width-8)x=clientX-rect.left-w-14;if(y<8)y=clientY-rect.top+14;
   tooltip.style.left=Math.max(8,Math.min(rect.width-w-8,x))+'px';tooltip.style.top=Math.max(8,Math.min(rect.height-h-8,y))+'px';
  }
  function hide(){tooltip.hidden=true;cross.setAttribute('hidden','');selected=-1;show(bars.length-1);}

  function track(index,y){index=Math.max(0,Math.min(bars.length-1,index));show(index);cross.removeAttribute('hidden');cross.querySelector('[data-cross-x]').setAttribute('x1',g.x(index));cross.querySelector('[data-cross-x]').setAttribute('x2',g.x(index));cross.querySelector('[data-cross-y]').setAttribute('y1',y??g.y(bars[index].close));cross.querySelector('[data-cross-y]').setAttribute('y2',y??g.y(bars[index].close));}
  function inspect(e){
   const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const matrix=svg.getScreenCTM();if(!matrix)return;
   const pos=p.matrixTransform(matrix.inverse());let index=0;bars.forEach((b,i)=>{if(Math.abs(g.x(i)-pos.x)<Math.abs(g.x(index)-pos.x))index=i;});
   track(index,Math.max(20,Math.min(320,pos.y)));popup(index,e.clientX,e.clientY);
  }
  svg.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')inspect(e);});svg.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')inspect(e);});
  svg.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')inspect(e);});
  svg.addEventListener('pointercancel',hide);svg.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')hide();});svg.addEventListener('blur',hide);
  svg.addEventListener('keydown',e=>{
   if(e.key==='Escape'){hide();return;}
   if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){
    e.preventDefault();track(e.key==='Home'?0:e.key==='End'?bars.length-1:selected+(e.key==='ArrowLeft'?-1:1));
    const point=svg.createSVGPoint();point.x=g.x(selected);point.y=g.y(bars[selected].close);const position=point.matrixTransform(svg.getScreenCTM());popup(selected,position.x,position.y);
   }
  });
 }
 container.addEventListener('click',e=>{
  const mode=e.target.closest('[data-range]'),zoomButton=e.target.closest('[data-zoom]');
  if(mode){range=mode.dataset.range;zoom=1;render();}
  if(zoomButton){zoom=Math.max(1,Math.min(8,zoom*(zoomButton.dataset.zoom==='in'?2:.5)));render();}
 });
 return {update(next,options={available:true}){trades=next;available=options.available;render();}};
}

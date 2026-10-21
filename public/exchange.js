import {withinPriceLimits,currentPriceLimits} from '../client/daily-price-limits.js';
import {companyFinancialsMarkup} from './company-financials.js';
import {setHTMLKeepingScroll,captureScroll,restoreScroll} from './scroll-state.js';
import {mountManagementHistory} from './history-feed.js';
import {PRICE_TICK,orderPrice,validOrderPrice} from '../client/price-tick.js';
import {renderOrderBook} from './order-book.js';
import {marketSession,koreaDayStart,marketPaused} from '../client/market-session.js';
import {renderDayChange} from './quote-change.js';
import {renderInvestor} from './investor.js';
import {createPriceChart} from './price-history.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';
let generation=0,disposeTrading=()=>{};
export function closeTrading(){generation++;disposeTrading();disposeTrading=()=>{};}
export async function showTrading(c,request,container){
 disposeTrading();let stopHistory=()=>{};
 let token=++generation;const box=container||document.querySelector('#test-trade');
 box.innerHTML=`<nav class="trade-section-nav" aria-label="종목 화면 바로가기"><button type="button" data-trade-jump="market-view">차트·호가</button><button type="button" data-trade-jump="limit-form">주문하기</button><button type="button" data-trade-jump="record-orders">내 주문</button><button type="button" data-trade-jump="company-investor">기업 현황·배당 ↓</button></nav><div class="trade-statusbar"><p id="limit-status" role="status">주문장을 불러오는 중…</p><button type="button" id="limit-refresh" class="refresh-market">새로고침</button></div><section id="company-financials" class="trading-account company-financials" aria-label="회사 매출과 현금">${companyFinancialsMarkup(null)}</section><div id="limit-account" class="trading-account"></div><div class="transfer-desk"><div class="market-view" id="market-view"><div class="market-view-tabs" role="tablist" aria-label="거래 화면 선택"><button type="button" role="tab" id="tab-market-chart" aria-controls="market-chart" aria-selected="true" data-market-view="chart">캔들차트</button><button type="button" role="tab" id="tab-market-book" aria-controls="market-book" aria-selected="false" tabindex="-1" data-market-view="book">호가표</button></div><section class="chart-panel panel" id="market-chart" role="tabpanel" aria-labelledby="tab-market-chart"><div class="panel-title"><h2>종목 캔들차트</h2></div><div id="limit-chart"><div class="chart-empty">체결 기록을 불러오는 중…</div></div></section><section class="quote-panel panel" id="market-book" role="tabpanel" aria-labelledby="tab-market-book" hidden><div class="panel-title"><h2>가격별 거래 현황</h2><span>수량 선택 → 주문 가격·방향 입력</span></div><div id="limit-book"><p class="placeholder">호가를 불러오는 중…</p></div></section></div><section class="order-entry panel"><div class="panel-title"><h2>지정가 주문</h2><span>현금 주문</span></div><form id="limit-form" data-side="buy"><fieldset class="order-side"><legend class="sr-only">주문 구분</legend><label><input type="radio" name="side" value="buy" checked><span>매수</span></label><label><input type="radio" name="side" value="sell"><span>매도</span></label></fieldset><label class="order-field">지정가격 <span><input name="price" aria-label="지정가격(원)" type="number" value="${orderPrice(c.currentPrice||c.referencePrice)}" min="100" max="1000000000" step="100" inputmode="numeric" required><b>원</b></span><span class="price-step-buttons"><button type="button" data-price-step="-1" aria-label="주문 가격 100원 내리기">−100원</button><button type="button" data-price-step="1" aria-label="주문 가격 100원 올리기">+100원</button></span></label><label class="order-field">주문수량 <span><input name="quantity" aria-label="주문수량(주)" type="number" value="1" min="1" max="1000000" step="1" inputmode="numeric" required><b>주</b></span></label><div id="price-limit-range" class="price-limit-range" aria-live="polite">가격 범위 확인 중…</div><p id="limit-total" class="order-total"></p><button type="submit" id="limit-submit" disabled>매수 주문 접수</button><p class="order-help">100원 단위 · 미체결 주문 취소 가능</p></form></section></div><div class="execution-layout"><div class="execution-main"><section class="records-dock"><div class="record-tabs" role="tablist" aria-label="거래 내역"><button type="button" role="tab" aria-selected="true" aria-controls="record-orders" id="tab-orders" data-record="orders">미체결 · 주문</button><button type="button" role="tab" aria-selected="false" aria-controls="record-fills" id="tab-fills" data-record="fills" tabindex="-1">체결 내역</button></div><div class="trading-records"><section class="panel" id="record-orders" role="tabpanel" aria-labelledby="tab-orders"><div class="panel-title"><h2>내 주문 · 미체결</h2><span>이 종목의 최근 주문</span></div><div id="limit-orders"></div></section><section class="panel" id="record-fills" role="tabpanel" aria-labelledby="tab-fills" hidden><div class="panel-title"><h2>내 체결 내역</h2><span>최근 체결</span></div><div id="limit-fills"></div></section></div></section></div></div><section id="company-investor" class="panel investor-panel" aria-label="기업 경영과 예상 배당"><p class="placeholder">경영·배당 정보를 불러오는 중…</p></section><section id="limit-admin" class="panel" hidden></section><details class="inline-help"><summary>거래 기준</summary><p>08:00~21:00 · 수수료 없음</p></details>`;
 box.querySelectorAll('[data-record]').forEach(tab=>{
  const select=()=>{box.querySelectorAll('[data-record]').forEach(t=>{const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;box.querySelector('#record-'+t.dataset.record).hidden=!selected;});};
  tab.addEventListener('click',select);
  tab.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=[...box.querySelectorAll('[data-record]')];const next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs.find(t=>t!==tab);next.click();next.focus();}});
 });
 const priceChart=createPriceChart(box.querySelector('#limit-chart'));
 const marketTabs=[...box.querySelectorAll('[data-market-view]')];
 function selectMarketView(tab){
  marketTabs.forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;box.querySelector('#market-'+t.dataset.marketView).hidden=!active;});
 }
 marketTabs.forEach(tab=>{
  tab.addEventListener('click',()=>selectMarketView(tab));
  tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?marketTabs[0]:event.key==='End'?marketTabs.at(-1):marketTabs.find(t=>t!==tab);selectMarketView(next);next.focus();});
 });
 const form=box.querySelector('form'),status=box.querySelector('#limit-status'),button=box.querySelector('#limit-submit');
 const controls=[...form.querySelectorAll('input,select,[data-price-step]')];let dailyLimits=null,pending=null,busy=false,connected=false,lastMatchError=null,settlementLocked=false,matchingPending=false,investorRead=0,investorLoading=false,investorQueued=false;
 const alive=()=>token===generation;
 const lock=()=>{const open=marketSession().open;button.disabled=busy||!connected||!open||!currentPriceLimits({priceLimits:dailyLimits});controls.forEach(e=>e.disabled=busy||!!pending||settlementLocked||!open||!currentPriceLimits({priceLimits:dailyLimits}));if(!open&&!busy){status.textContent=marketPaused(Date.now())?'시장 준비 중 · 10월 21일(수) 오전 8시 거래 재개':'장 마감 · 매일 08:00~21:00(한국 시간) 거래 가능 · 미체결 취소 가능';}box.querySelector('#limit-refresh').disabled=busy;box.querySelectorAll('[data-cancel-order]').forEach(e=>e.disabled=busy||settlementLocked);};
 const total=()=>{const price=Number(form.elements.price.value);form.elements.price.setCustomValidity(!validOrderPrice(price)?'가격은 100원 단위로 입력하세요.':dailyLimits&&!withinPriceLimits(price,dailyLimits)?`오늘 주문 가능 가격은 ${won(dailyLimits.lower)}~${won(dailyLimits.upper)}입니다.`:'');box.querySelectorAll('.transfer-book-row').forEach(row=>row.dataset.selected=String(Number(row.dataset.price)===price));form.dataset.side=form.elements.side.value;box.querySelector('#limit-total').innerHTML=`<span>예상 주문금액</span><strong>${won(Number(form.elements.price.value)*Number(form.elements.quantity.value))}</strong>`;if(!pending)button.textContent=form.elements.side.value==='buy'?'매수 주문 접수':'매도 주문 접수';};controls.forEach(e=>e.addEventListener('input',total));total();
 function refreshInvestor(){
  ++investorRead;
  if(investorLoading){investorQueued=true;return;}
  const read=investorRead;investorLoading=true;
  // A long management history must not keep order controls locked.
  void request('/api/company-investor?companyId='+encodeURIComponent(c.id)).then(info=>{
   if(!alive()||read!==investorRead)return;
   const host=box.querySelector('#company-investor'),previous=host.querySelector('.investor-history');
   const keep=info.historyPending&&previous&&previous.dataset.historyVersion===info.historyVersion;
   const historyScroll=keep?captureScroll(previous):[];
   const historyList=previous?.querySelector('.investor-history-list'),historyOffset={top:historyList?.scrollTop||0,left:historyList?.scrollLeft||0};
   setHTMLKeepingScroll(box.querySelector('#company-financials'),companyFinancialsMarkup(info));
   renderInvestor(host,info);
   if(info.historyPending){
    const section=host.querySelector('.investor-history');
    if(keep){section.replaceWith(previous);restoreScroll(previous,historyScroll);}
    else{stopHistory();section.dataset.historyVersion=info.historyVersion;stopHistory=mountManagementHistory(section,request,c.id,{isCurrent:alive,initialScroll:historyOffset});}
   }
  },()=>{if(alive()&&read===investorRead)box.querySelector('#company-investor').innerHTML='<p class="trade-empty">경영·배당 정보를 조회하지 못했습니다. 새로고침으로 다시 조회하세요.</p>';}).finally(()=>{
   investorLoading=false;
   if(investorQueued&&alive()){investorQueued=false;refreshInvestor();}
  });
 }
 async function refresh(){
  const data=await request('/api/exchange?companyId='+c.id);if(!alive())return;
  dailyLimits=data.priceLimits||null;
  const range=box.querySelector('#price-limit-range');range.innerHTML=dailyLimits?`<span>기준가<strong>${won(dailyLimits.referencePrice)}</strong></span><span>하한가<strong>${won(dailyLimits.lower)}</strong></span><span>상한가<strong>${won(dailyLimits.upper)}</strong></span>`:'오늘 가격 범위 준비 중';
  form.elements.price.min=String(dailyLimits?.lower||100);form.elements.price.max=String(dailyLimits?.upper||1000000000);total();
  const a=data.account;lastMatchError=data.matchError;settlementLocked=!!data.settlementLocked;matchingPending=!!data.matchPending;
  box.querySelector('#limit-account').innerHTML=`<div><span>주문 가능 현금</span><strong>${won(a.cash-a.reservedCash)}</strong></div><div><span>매수 대기금액</span><strong>${won(a.reservedCash)}</strong></div><div><span>보유 수량</span><strong>${a.positions[c.id]||0}<small>주</small></strong></div><div><span>내 평균 매입가</span><strong>${data.costBasis?.averagePrice==null?'—':Number(data.costBasis.averagePrice).toLocaleString('ko-KR',{maximumFractionDigits:2})+'원'}</strong></div><div><span>매도 가능</span><strong>${(a.positions[c.id]||0)-(a.reservedPositions[c.id]||0)}<small>주</small></strong></div>`;
  const displayPrice=Number.isSafeInteger(c.currentPrice)?c.currentPrice:data.market?.lastPrice||c.referencePrice;
  c.previousClose=data.market?.previousClose;c.closeKind=data.market?.closeKind;renderDayChange(c,displayPrice);
  const quote=document.querySelector('#company-current-price'),quoteLabel=document.querySelector('#company-price-label');if(quote){quote.textContent=won(displayPrice);quoteLabel.textContent=c.quoteKind==='initial'?'첫 거래 전':'현재가';}
  setHTMLKeepingScroll(box.querySelector('#limit-book'),`<div class="book-summary"><span>초기 판매 잔여 <b>${data.market?.treasuryShares??c.issuedShares}주</b></span><span>${settlementLocked?'배당 정산 중':'가격별 대기 주문'}</span></div>`+renderOrderBook(data.book,data.market?.lastPrice||c.referencePrice,form.elements.price.value,dailyLimits));

  const orders=data.orders.filter(o=>o.companyId===c.id),fills=data.fills.filter(f=>f.companyId===c.id);
  priceChart.update(data.marketTrades||[],{available:data.marketHistoryAvailable===true});
  setHTMLKeepingScroll(box.querySelector('#limit-orders'),orders.length?`<div class="trade-table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"><table class="trade-table"><thead><tr><th>구분</th><th>지정가격</th><th>주문</th><th>체결</th><th>잔량</th><th>상태 / 취소</th></tr></thead><tbody>${orders.map(o=>`<tr><td class="side-${o.side}">${o.side==='buy'?'매수':'매도'}</td><td>${won(o.price)}</td><td>${o.quantity}주</td><td>${o.filled}주</td><td>${o.remaining}주</td><td>${o.status==='open'?`<button type="button" class="cancel-order" data-cancel-order="${esc(o.orderId)}" data-company-id="${esc(o.companyId)}">잔량 취소</button>`:o.status==='filled'?'체결 완료':'취소 완료'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="trade-empty">이 기업의 주문 내역이 없습니다.</p>');
  setHTMLKeepingScroll(box.querySelector('#limit-fills'),fills.length?`<div class="trade-table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"><table class="trade-table"><thead><tr><th>구분</th><th>체결가격</th><th>수량</th><th>체결금액</th></tr></thead><tbody>${fills.map(f=>`<tr><td class="side-${f.side}">${f.side==='buy'?'매수':'매도'}</td><td>${won(f.price)}</td><td>${f.quantity}주</td><td>${won(f.price*f.quantity)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="trade-empty">아직 체결된 주문이 없습니다.</p>');
  const admin=box.querySelector('#limit-admin');admin.hidden=!data.adminOrders?.length;if(!admin.hidden)setHTMLKeepingScroll(admin,`<div class="panel-title"><h2>관리자 · 전체 대기 주문</h2></div><div class="admin-book">${data.adminOrders.map(o=>`<div class="asset-row"><span>${o.side==='buy'?'매수':'매도'} ${won(o.price)} · ${o.remaining}주</span><button type="button" data-cancel-order="${esc(o.id)}" data-owner-uid="${esc(o.uid)}" data-company-id="${esc(c.id)}">관리자 취소</button></div>`).join('')}</div>`);
  connected=!settlementLocked&&!!dailyLimits;lock();
  refreshInvestor();
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!connected||!marketSession().open){lock();return;}
  total();if(!withinPriceLimits(Number(form.elements.price.value),dailyLimits)){form.reportValidity();return;}
  if(!pending)pending={orderId:crypto.randomUUID(),companyId:c.id,side:form.elements.side.value,price:Number(form.elements.price.value),quantity:Number(form.elements.quantity.value)};
  busy=true;lock();
  try{const result=await request('/api/limit-order',{method:'POST',body:JSON.stringify(pending)});if(!alive())return;pending=null;total();await refresh();status.textContent=result.matchError||lastMatchError||`주문 ${result.duplicate?'기존 접수 확인':'접수 완료'} · 체결 ${result.order.filled}주 / 대기 ${result.order.remaining}주${result.order.remaining?' · 매수가는 판매 대기 가격 이상, 매도가는 구매 대기 가격 이하여야 체결됩니다.':''}`;}
  catch(error){if(!alive())return;status.textContent=error.code==='permission-denied'?'주문이 거절됐습니다. 최신 거래 규칙과 계정 권한을 확인하세요.':error.message;if(error.status&&error.status<500){pending=null;total();}else button.textContent='같은 주문 다시 확인';}
  finally{busy=false;if(alive())lock();}
 });
 box.addEventListener('click',async e=>{
  const jump=e.target.closest('[data-trade-jump]');if(jump){if(jump.dataset.tradeJump==='record-orders')box.querySelector('#tab-orders').click();box.querySelector('#'+jump.dataset.tradeJump)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const step=e.target.closest('[data-price-step]');if(step&&!busy&&!pending&&!form.elements.price.disabled){form.elements.price.value=Math.max(dailyLimits?.lower||100,Math.min(dailyLimits?.upper||1000000000,orderPrice(Number(form.elements.price.value)+Number(step.dataset.priceStep)*PRICE_TICK)));total();return;}
  const level=e.target.closest('[data-limit-price]');if(level&&!busy&&!pending&&!form.elements.price.disabled&&validOrderPrice(Number(level.dataset.limitPrice))){form.elements.price.value=level.dataset.limitPrice;if(level.dataset.limitSide)form.querySelector('input[name=side][value='+level.dataset.limitSide+']').checked=true;total();form.elements.quantity.focus();return;}
  const cancel=e.target.closest('[data-cancel-order]');if(!cancel||busy||settlementLocked)return;busy=true;lock();cancel.disabled=true;
  try{await request('/api/cancel-order',{method:'POST',body:JSON.stringify({orderId:cancel.dataset.cancelOrder,companyId:cancel.dataset.companyId,...(cancel.dataset.ownerUid?{ownerUid:cancel.dataset.ownerUid}:{})})});if(!alive())return;status.textContent='남은 주문을 취소하고 예약 자산을 반환했습니다.';await refresh();}catch(error){if(alive())status.textContent=error.code==='permission-denied'?'최신 Firestore 거래 규칙 게시와 계정 권한을 확인하세요.':error.message;}
  finally{busy=false;if(alive()){cancel.disabled=false;lock();}}
 });
 box.querySelector('#limit-refresh').addEventListener('click',async()=>{if(busy)return;busy=true;lock();try{await request.refresh?.();await refresh();if(alive())status.textContent=lastMatchError||'호가와 체결 내역을 갱신했습니다.';}catch(e){if(alive())status.textContent=e.message;}finally{busy=false;if(alive())lock();}});
 let queuedRefresh=false,lastSessionOpen=marketSession().open,quoteDay=koreaDayStart();
 let sessionClock;const tick=()=>{if(!alive())return;if(queuedRefresh&&!busy){queuedRefresh=false;busy=true;refresh().catch(()=>{}).finally(()=>{busy=false;if(alive())lock();});}const open=marketSession().open;if(open!==lastSessionOpen){lastSessionOpen=open;if(!busy&&open)status.textContent=settlementLocked?'배당 정산 중':'주문 가능 · 08:00~21:00';}if(matchingPending&&!busy&&open){busy=true;status.textContent='대기 주문을 체결 중입니다…';refresh().then(()=>{if(alive())status.textContent=lastMatchError||(matchingPending?'대기 주문을 체결 중입니다…':'체결 내역을 갱신했습니다.');}).catch(e=>{matchingPending=false;if(alive())status.textContent=e.message;}).finally(()=>{busy=false;if(alive())lock();});}if(quoteDay!==koreaDayStart()&&!busy){quoteDay=koreaDayStart();c.previousClose=null;renderDayChange(c);busy=true;refresh().catch(()=>{}).finally(()=>{busy=false;if(alive())lock();});}lock();};
 const pause=()=>{clearInterval(sessionClock);};disposeTrading=pause;
 const resume=()=>{disposeTrading=pause;token=++generation;clearInterval(sessionClock);sessionClock=setInterval(tick,1000);stopHistory.resume?.();lock();};
 resume();
 busy=true;lock();
 try{await refresh();if(alive())status.textContent=lastMatchError||(marketSession().open?'주문 가능 · 08:00~21:00':'장 마감 · 08:00~21:00 거래 가능');}catch(error){if(alive())status.textContent=error.code==='permission-denied'?'최신 Firestore 거래 규칙을 게시한 뒤 다시 열어 주세요.':error.message;}finally{busy=false;if(alive())lock();}
 return {pause, resume:()=>{resume();},refresh:async()=>{resume();if(busy){queuedRefresh=true;return;}if(!busy){busy=true;lock();try{await refresh();}catch(e){if(alive())status.textContent=e.message;}finally{busy=false;if(alive())lock();}}},dispose:()=>{pause();stopHistory();}};
}

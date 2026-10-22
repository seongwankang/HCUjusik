import {PREVIOUS_PRICE_WEIGHT,EXECUTION_PRICE_WEIGHT} from '../client/smoothed-price.js';
import {PERSONAL_RANKINGS,personalRankingMarkup} from './personal-rankings.js';
import {setHTMLKeepingScroll,captureScroll,restoreScroll} from './scroll-state.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=v=>Number(v||0).toLocaleString('ko-KR')+'원';
const time=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
const percent=v=>(v>0?'+':'')+v.toFixed(2)+'%';
export async function showRankings(host,api,user,isCurrent,{preserveOnError=false}={}){
 let selectedPersonal=host.querySelector('[data-personal-ranking][aria-pressed="true"]')?.dataset.personalRanking||'totalValue';
 let selected=host.querySelector('[data-ranking][aria-pressed="true"]')?.dataset.ranking||'prices';
 if(!host.hasChildNodes())setHTMLKeepingScroll(host,'<p class="placeholder">순위를 불러오는 중…</p>');
 try{const data=await api('/api/rankings');if(!isCurrent())return;
 selectedPersonal=host.querySelector('[data-personal-ranking][aria-pressed="true"]')?.dataset.personalRanking||selectedPersonal;selected=host.querySelector('[data-ranking][aria-pressed="true"]')?.dataset.ranking||selected;
 const savedScroll=captureScroll(host);
 const board=data.cash?.entries?.every(r=>Number.isSafeInteger(r.totalValue))?data.cash:null;
 if(!host.querySelector('#rankings-refresh'))setHTMLKeepingScroll(host,`<div class="rankings-toolbar"><p>내 순위 산정액 <strong id="rankings-my-value">${data.myRankingValue===null?'평가 불가':won(data.myRankingValue)}</strong></p><button class="ghost" id="rankings-refresh">새로고침</button>${user.role==='admin'?'<button class="account-btn" id="rankings-publish">자산 순위 갱신</button>':''}</div><p id="rankings-message" role="status"></p><div class="rankings-grid"><section class="panel"><div class="panel-title"><h2>개인 자산 순위</h2><span>상위 100명</span></div><div class="market-ranking-tabs" aria-label="개인 순위 기준">${Object.entries(PERSONAL_RANKINGS).map(([key,label])=>`<button type="button" data-personal-ranking="${key}" aria-pressed="${key===selectedPersonal}">${label}</button>`).join('')}</div><p class="ranking-note">총순위: 현금 + 주식 기준가 평가액의 80%</p><p id="personal-ranking-status" class="ranking-note">${board?.updatedAt?'집계 '+esc(time(board.updatedAt))+' · 전체 '+board.participants+'명':'아직 자산 순위가 집계되지 않았습니다.'}</p><div id="personal-ranking-table" class="trade-table-wrap" tabindex="0" role="region" aria-label="개인 투자자 순위"></div></section><section class="panel"><div class="panel-title"><h2>종목 순위</h2><span id="market-ranking-day">${esc(data.day||'오늘')} · 한국 시간</span></div><div class="market-ranking-tabs" aria-label="종목 순위 기준">${[['prices','주가'],['volume','거래량'],['gainers','상승률'],['losers','하락률'],['expectedRevenue','예상 일매출'],['expectedDividendPerShare','예상 1주당 배당'],['cumulativeRevenue','누적 매출']].map(([key,label],i)=>`<button type="button" data-ranking="${key}" aria-pressed="${i===0}">${label}</button>`).join('')}</div><p id="market-ranking-note" class="ranking-note"></p><div id="market-ranking-table" class="trade-table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"></div><p id="market-ranking-status" class="ranking-note">${data.asOf?'조회 '+esc(time(data.asOf)):''}${data.unavailable?' · '+data.unavailable+'개 종목의 일부 데이터를 확인하지 못했습니다.':''}</p></section></div><dialog class="investor-dialog"><div class="investor-dialog-heading"><h2>투자자 보유 현황</h2><button type="button" class="close" aria-label="보유 현황 닫기">×</button></div><div class="investor-dialog-content"></div></dialog>`);
 host.querySelector('#rankings-my-value').textContent=data.myRankingValue===null?'평가 불가':won(data.myRankingValue);
 host.querySelector('#personal-ranking-status').textContent=board?.updatedAt?'집계 '+time(board.updatedAt)+' · 전체 '+board.participants+'명':'아직 자산 순위가 집계되지 않았습니다.';
 host.querySelector('#market-ranking-day').textContent=(data.day||'오늘')+' · 한국 시간';
 host.querySelector('#market-ranking-status').textContent=(data.asOf?'조회 '+time(data.asOf):'')+(data.unavailable?' · '+data.unavailable+'개 종목의 일부 데이터를 확인하지 못했습니다.':'');
 const dialog=host.querySelector('dialog');dialog.querySelector('button').onclick=()=>dialog.close();let investorRead=0;
 host.onclick=async event=>{const button=event.target.closest('[data-investor]');if(!button||!host.contains(button))return;
  const read=++investorRead;dialog.querySelector('.investor-dialog-content').textContent='보유 현황을 불러오는 중…';if(!dialog.open)dialog.showModal();
  try{const p=await api('/api/investor-profile?id='+encodeURIComponent(button.dataset.investor));if(!isCurrent()||read!==investorRead||!dialog.open)return;
   dialog.querySelector('.investor-dialog-content').innerHTML=`<h3>${esc(p.name)}</h3><div class="investor-public-cash"><span>보유 현금</span><strong>${won(p.cash)}</strong><small>주문 예약금 포함</small></div><h4>보유 주식</h4>${p.holdings.length?'<div class="trade-table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"><table><thead><tr><th>종목</th><th>보유 수량</th></tr></thead><tbody>'+p.holdings.map(h=>'<tr><td>'+esc(h.name)+'<small>'+esc(h.ticker)+'</small></td><td>'+Number(h.quantity).toLocaleString('ko-KR')+'주</td></tr>').join('')+'</tbody></table></div>':'<p class="ranking-note">보유 주식이 없습니다.</p>'}<p class="ranking-note">집계 ${esc(time(p.updatedAt))} · 매도 대기 주식 포함</p>`;
  }catch(e){if(isCurrent()&&read===investorRead&&dialog.open)dialog.querySelector('.investor-dialog-content').textContent='보유 현황을 불러오지 못했습니다. 순위표를 새로고침해 주세요.';}
 };
 function personalTable(key){host.querySelectorAll('[data-personal-ranking]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.personalRanking===key)));setHTMLKeepingScroll(host.querySelector('#personal-ranking-table'),personalRankingMarkup(board,key));}
 host.querySelectorAll('[data-personal-ranking]').forEach(b=>b.onclick=()=>personalTable(b.dataset.personalRanking));personalTable(selectedPersonal);
 function marketTable(key){
  host.querySelector('#market-ranking-table').dataset.ranking=key;
  const notes={prices:`체결 수량 반영 기준가 · 기존 ${Math.round(PREVIOUS_PRICE_WEIGHT*100)}% + 체결가 ${Math.round(EXECUTION_PRICE_WEIGHT*100)}%`,volume:'오늘 체결 수량',gainers:'전일 종가 대비',losers:'전일 종가 대비',expectedRevenue:'다음 정산 예상 매출 · 공동순위 다음 순위는 건너뜀',expectedDividendPerShare:'예상 매출 순위 계수 × 배당률(%)',cumulativeRevenue:'정산 완료 매출 누계'};
  host.querySelectorAll('[data-ranking]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ranking===key)));
  host.querySelector('#market-ranking-note').textContent=notes[key]+(['gainers','losers'].includes(key)?' · 전일 거래가 없으면 초기 판매가 기준':'')+(data[key+'Unavailable']?' · '+data[key+'Unavailable']+'개 종목 집계 불가':'');
  const rows=data[key]||[],label={prices:'기준가',volume:'거래량',gainers:'상승률',losers:'하락률',expectedRevenue:'예상 일매출',expectedDividendPerShare:'예상 1주당 배당',cumulativeRevenue:'누적 매출'}[key];
  setHTMLKeepingScroll(host.querySelector('#market-ranking-table'),'<table><thead><tr><th>순위</th><th>종목</th><th>'+label+'</th>'+(['expectedRevenue','expectedDividendPerShare'].includes(key)?'<th>배당률 1%당</th>':'')+'<th></th></tr></thead><tbody>'+ (rows.map(r=>`<tr><td><b>${r.rank}</b></td><td><strong>${esc(r.name)}</strong><small>${esc(r.ticker)}${r.paused?' · 거래 정지':''}</small></td><td class="${r.change?.direction==='up'?'quote-up':r.change?.direction==='down'?'quote-down':''}">${['expectedRevenue','cumulativeRevenue','expectedDividendPerShare'].includes(key)?won(r[key]):key==='prices'?won(r.price):key==='volume'?r.volume.toLocaleString('ko-KR')+'주':percent(r.change.percent)}${key!=='prices'?'<small>'+won(r.price)+'</small>':''}</td>${['expectedRevenue','expectedDividendPerShare'].includes(key)?`<td>${Number.isSafeInteger(r.rankBase)?`<strong>${r.rankBase}원</strong><small>매출 ${r.revenueRank}위 · 배당률 ${r.dividendBps/100}%</small>`:'집계 중'}</td>`:''}<td><button class="row-button" data-company="${esc(r.id)}">종목 보기</button></td></tr>`).join('')||'<tr><td colspan="4" class="table-empty">해당 순위에 표시할 종목이 없습니다.</td></tr>')+'</tbody></table>');
 }
 host.querySelectorAll('[data-ranking]').forEach(b=>b.onclick=()=>marketTable(b.dataset.ranking));marketTable(selected);restoreScroll(host,savedScroll);
 host.querySelector('#rankings-refresh').onclick=async()=>{
  const button=host.querySelector('#rankings-refresh');if(button.disabled)return;
  button.disabled=true;button.textContent='갱신 중…';host.setAttribute('aria-busy','true');host.querySelector('#rankings-message').textContent='최신 순위를 불러오는 중…';
  try{await api.refresh?.(['leaderboards','investorSnapshots','sparkAccounts','companies','sparkBooks','companyOperations','companyEffects']);await showRankings(host,api,user,isCurrent,{preserveOnError:true});if(isCurrent())host.querySelector('#rankings-message').textContent='새로고침 완료 · '+new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'});}
  catch(e){if(isCurrent())host.querySelector('#rankings-message').textContent='새로고침 실패 · '+e.message;}
  finally{host.removeAttribute('aria-busy');const currentButton=host.querySelector('#rankings-refresh');if(currentButton){currentButton.disabled=false;currentButton.textContent='새로고침';}}
 };
 const publish=host.querySelector('#rankings-publish');if(publish)publish.onclick=async()=>{
  if(publish.disabled)return;publish.disabled=true;publish.textContent='집계 중…';host.setAttribute('aria-busy','true');host.querySelector('#rankings-message').textContent='자산 순위를 집계하는 중…';
  try{await api('/api/rankings-publish',{method:'POST'});if(isCurrent()){await showRankings(host,api,user,isCurrent,{preserveOnError:true});host.querySelector('#rankings-message').textContent='자산 순위 갱신 완료';}}
  catch(e){if(isCurrent())host.querySelector('#rankings-message').textContent='집계 실패 · '+e.message;}
  finally{host.removeAttribute('aria-busy');const button=host.querySelector('#rankings-publish');if(button){button.disabled=false;button.textContent='자산 순위 갱신';}}
 };
 }catch(e){if(preserveOnError)throw e;if(isCurrent()){const status=host.querySelector('#rankings-message');if(status)status.textContent='순위를 갱신하지 못했습니다. '+e.message;else host.innerHTML='<p class="placeholder">'+esc(e.message)+'</p>';}}
}

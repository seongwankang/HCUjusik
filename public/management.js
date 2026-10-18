import {revenueEffectBadges} from './revenue-effects.js';
import {showSpies} from './spies.js';
import {nextSettlement} from '../client/settlement-time.js';
import {INCOME_MULTIPLIER,BASE_CAPACITY,FACTORY_CAPACITY,EQUIPMENT_CAPACITY,DEFAULT_CONFIG,researchBps,staffCapacity,hasPending} from '../client/business-policy.js';
import {previewPurchase,startupExample} from '../client/investment-preview.js';
import {adjustedRevenue,needsProduction,investmentCost,effectiveDividendBps,termActive} from '../client/event-model.js';
import {showCompanyEvents} from './events.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const assets={factory:'공장',equipment:'생산 설비',research:'R&D센터'};
const choices={...assets,employee:'직원'};
const dayNow=()=>Math.floor((Date.now()+32400000)/86400000);
export async function showManagement(host,api,user,isCurrent=()=>true){
 let alive=true,selected='',companies=[],view=null,tab='investments';
 const current=()=>alive&&isCurrent()&&document.querySelector('#page-management')?.classList.contains('active');
 const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
 host.classList.remove('empty-state');host.innerHTML='<p class="placeholder">경영 현황을 불러오는 중…</p>';
 try{
  companies=(await api(user.role==='admin'?'/api/companies':'/api/my-company')).companies;if(!current())return;
  if(!companies.length){host.innerHTML='<div class="blank-state"><h2>담당 기업이 없습니다</h2><p>관리자가 기업과 사장을 연결하면 경영을 시작할 수 있습니다.</p></div>';return;}
  selected=companies[0].id;
  host.innerHTML=`<div class="management-toolbar"><label>운영 기업<select id="business-company">${companies.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><button id="business-refresh" class="ghost">새로고침</button></div><p role="status" id="business-message"></p><div id="business-body"></div>`;
  const message=s=>host.querySelector('#business-message').textContent=s;
  function setTab(next,focus=false){
   tab=next;host.querySelectorAll('[role="tab"][data-management-tab]').forEach(b=>{const active=b.dataset.managementTab===tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active&&focus)b.focus();});
   host.querySelectorAll('[data-management-panel]').forEach(p=>p.hidden=p.dataset.managementPanel!==tab);
  }
  async function load(){
   const id=selected;
   try{
    const data=await api('/api/economy?companyId='+encodeURIComponent(id));if(!current()||selected!==id)return;
    view=data;render();
    await showSpies(host.querySelector('#business-spies'),api,id,companies,user,view,load,()=>current()&&selected===id);if(!current()||selected!==id)return;
    await showCompanyEvents(host.querySelector('#company-events'),api,id,load,()=>current()&&selected===id,summary=>{
     if(!current()||selected!==id)return;
     const badge=host.querySelector('#business-event-count');badge.textContent=summary.pendingCount||'';badge.hidden=!summary.pendingCount;
     const projection=summary.settlementProjection||summary.projection;host.querySelector('#business-next-income').textContent=projection.needsProduction?'분류 필요':won(projection.revenue);host.querySelector('#business-income-effects').innerHTML=projection.needsProduction?'':revenueEffectBadges(summary.revenueEffects||[]);
    });
   }catch(e){if(current()&&selected===id)message(e.message);}
  }
  function render(){
   const {ops:o,book,config:c,available,days}=view,day=dayNow(),needs=needsProduction(o),costs=Object.fromEntries(Object.keys(choices).map(asset=>[asset,investmentCost(o,c,asset)]));
   const settlement=nextSettlement(o),tomorrow=needs?null:adjustedRevenue(o,settlement.day,[],settlement.at).revenue,settlementLabel=new Date(settlement.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'});
   const employees=o.employees||0,capacity=staffCapacity(o),vacancies=Math.max(0,capacity-employees),idle=Math.max(0,employees-capacity);
   const blocked=o.locked||!!o.pendingEvent||hasPending(o)&&o.pendingDay<settlement.day;
   const bonus=Math.min(3000,researchBps(o)+(o.pendingResearchBps||0))/100,example=startupExample(c);
   host.querySelector('#business-body').innerHTML=`
    <section class="business-overview" aria-label="경영 요약">
     <div class="business-finances"><article><span>투자 가능 자금</span><strong>${won(available)}</strong></article><article><span>다음 정산 예상 영업수익</span><div class="revenue-value"><strong id="business-next-income">${tomorrow===null?'분류 필요':won(tomorrow)}</strong><span id="business-income-effects" class="revenue-effects"></span></div><small>${settlementLabel} 정산 기준</small></article></div>
     <p class="compact-note">오전 9시 전 투자·채용은 당일 정산부터, 9시 이후에는 다음 날 정산부터 반영됩니다.</p>
    </section>
    ${o.locked?'<p class="business-lock">배당 지급 중입니다. 거래·투자는 정산 완료 후 재개됩니다.</p>':''}
    ${o.pendingEvent?'<p class="business-lock">선택한 이벤트의 결과 적용을 완료해 주세요. <button class="text-link" data-management-tab="events">이벤트 확인</button></p>':''}
    <div class="management-tabs" role="tablist" aria-label="기업 경영 메뉴">${[['investments','시설·채용'],['events','이벤트'],['spies','산업스파이'],['settlement','회계·배당']].map(([id,label])=>`<button id="business-tab-${id}" type="button" role="tab" data-management-tab="${id}" aria-controls="business-panel-${id}">${label}${id==='events'?'<span id="business-event-count" class="tab-count" hidden></span>':''}</button>`).join('')}</div>
    <section id="business-panel-investments" role="tabpanel" aria-labelledby="business-tab-investments" data-management-panel="investments">
     <section class="business-inventory">     <div class="business-section-heading"><h2>시설·인력 현황</h2><span>보유 수량</span></div>
     <div class="inventory-overview">${Object.entries(choices).map(([id,name])=>`<article class="inventory-tile ${id==='employee'?'inventory-staff':''}"><span>${name}</span><strong>${id==='employee'?employees:o[id]}<small>${id==='employee'?'명':'개'}</small></strong><small>${id==='factory'?'수용 인원 '+o.factory*FACTORY_CAPACITY+'명':id==='equipment'?'수용 인원 '+o.equipment*EQUIPMENT_CAPACITY+'명':id==='research'?'수익 보너스 +'+bonus+'%':'배치 '+Math.min(employees,capacity)+'명'+(idle?' · 유휴 '+idle+'명':'')}</small></article>`).join('')}</div>
     <div class="staff-capacity staff-capacity-single"><div class="staff-capacity-detail"><div><span>직원 정원 · 기본 ${BASE_CAPACITY}명 포함</span><b>${employees} / ${capacity}명</b></div><meter min="0" max="${Math.max(capacity,1)}" value="${Math.min(employees,capacity)}" aria-label="직원 정원 사용량"></meter><div class="staff-capacity-meta"><span>정원 여유 <b>${vacancies}명</b></span><span>채용비 <b>${won(costs.employee)}/명</b></span></div>${idle?`<p class="inline-warning">시설 부족으로 ${idle}명 유휴 중</p>`:''}</div></div>
</section>
     ${needs?`<div class="business-lock"><h3>기존 설비 매출 분류가 필요합니다</h3>${user.role==='admin'?`<form id="production-form" class="admin-form">${['production','pendingProduction'].map(key=>Object.entries(assets).map(([asset,label])=>`<label>${label} · ${key==='production'?'가동':'대기'} 수익<input type="number" name="${key}-${asset}" min="0" step="1" value="0" required></label>`).join('')).join('')}<p>기존 합계 · 가동 ${won(o.revenue)} / 대기 ${won(o.pendingRevenue)}</p><button class="account-btn">분류 저장</button></form>`:'<p>관리자가 기존 수익을 분류하면 추가 투자할 수 있습니다.</p>'}</div>`:''}
     <div class="business-section-heading"><h2>추가 투자</h2><span>다음 오전 9시 정산부터 반영</span></div>
     <div class="facility-grid">${Object.entries(choices).map(([id,name])=>{
      const p=needs?{gain:0,payback:null,allowed:false}:previewPurchase(o,c,id,day,settlement.day),count=id==='employee'?employees:o[id],rd=id==='research';
      const disabled=blocked||available<costs[id]||!p.allowed||needs;
      const reason=blocked?'처리 완료 후 투자 가능':needs?'매출 분류 필요':!p.allowed?(id==='employee'?'직원 정원 도달':'R&D 상한 도달'):available<costs[id]?'투자 자금 부족':'';
      return `<article class="facility-card ${rd?'research-card':''}"><header><h3>${id==='employee'?'직원 채용':name}</h3><span class="holding-chip">${id==='employee'?'재직':'보유'} ${count}${id==='employee'?'명':'개'}</span></header><strong class="investment-cost">${won(costs[id])}<small>/${id==='employee'?'명':'개'}</small></strong><dl><div><dt>${rd?'기본 수익 보너스':'기본 일수익'}</dt><dd>${rd?'+'+c.researchBoostBps/100+'%':'+'+won(c[id+'Revenue']*INCOME_MULTIPLIER)}</dd></div><div><dt>투자 후 일수익 증가</dt><dd>${needs?'분류 후 계산':'+'+won(Math.max(0,p.gain))}</dd></div></dl><p class="facility-caption">${id==='factory'?'직원 정원 +25명':id==='equipment'?'직원 정원 +10명':rd?'최대 6개 · 보너스 합계 최대 30%':'직원 정원 '+capacity+'명'}</p><button class="account-btn" data-business="invest" data-asset="${id}" ${disabled?'disabled':''}>${id==='employee'?'1명 고용하기':name+' 1개 건설'}</button><small class="action-hint">${reason}</small></article>`;
     }).join('')}</div>
     <details class="business-guide"><summary>투자 수익 비교·운영 안내</summary><p>기본 정원 10명에 공장당 25명·생산 설비당 10명이 추가됩니다. 수익은 운영비·급여 차감 후 원장 기여액에 운영 수익 배수 2배를 한 번 적용하며 오전 9시 전에 구매하면 당일 9시 정산부터 반영됩니다. R&D는 설비·직원 수익에 비율로 적용됩니다.</p><div class="table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"><table><thead><tr><th>투자</th><th>예상 일수익 증가</th><th>단순 회수 기간</th></tr></thead><tbody>${Object.keys(choices).map(id=>{const p=needs?null:previewPurchase(o,c,id,day,settlement.day);return `<tr><td>${choices[id]}</td><td>${p?won(Math.max(0,p.gain)):'—'}</td><td>${p?.payback?p.payback+'일':'—'}</td></tr>`;}).join('')}</tbody></table></div><p>회수 기간은 배당·이벤트가 없다는 단순 비교입니다. 회사 자금에는 최초 발행 주식의 실제 판매금만 들어옵니다.</p><h3>1,000만 원 투자 예시</h3><p>공장 2개 · 설비 3개 · 직원 25명 · R&D 1개<br>투자 ${won(example.cost)} / 남는 현금 ${won(example.remaining)} / 정산 시 기본 일수익 ${won(example.revenue)}</p></details>
    </section>
    <section id="business-panel-spies" role="tabpanel" aria-labelledby="business-tab-spies" data-management-panel="spies" hidden><div id="business-spies"></div></section>
    <section id="business-panel-events" role="tabpanel" aria-labelledby="business-tab-events" data-management-panel="events" hidden><div id="company-events"></div></section>
    <section id="business-panel-settlement" role="tabpanel" aria-labelledby="business-tab-settlement" data-management-panel="settlement" hidden>
     ${termActive(o.dividendLimit,Date.now(),o)?`<p class="inline-warning">배당 상한 ${o.dividendLimit.percent}% 적용 중 · 설정 배당률 ${o.dividendBps/100}% · ${Number.isInteger(o.dividendLimit.settlements)?'남은 정산 '+Math.max(0,o.dividendLimit.startsAfterSettlement+o.dividendLimit.settlements-(o.settlementCount||0))+'회':new Date(o.dividendLimit.endsAt).toLocaleString('ko-KR')+' 종료'}</p>`:''}<div class="settlement-overview"><div><span>배당률</span><strong>${effectiveDividendBps(o)/100}%</strong></div><div><span>최초 주식 판매 누적</span><strong>${won(book?.issuerCash)}</strong></div></div>
     <div class="settlement-actions"><form id="dividend-form"><label>배당률 (%)<input name="rate" type="number" min="0" max="100" step="0.01" value="${o.dividendBps/100}" ${o.locked?'disabled':''} required></label><button class="ghost" ${o.locked?'disabled':''}>배당률 저장</button></form>${user.role==='admin'?`<button class="account-btn" data-business="settle" ${!o.locked&&(o.lastSettledDay>=day||Date.now()<day*86400000)?'disabled':''}>${!o.locked&&o.lastSettledDay>=day?'오늘 정산 완료':o.locked?'정산 이어하기':Date.now()<day*86400000?'오전 9시 정산 예정':'오늘 수익·배당 정산'}</button>`:''}</div><p class="compact-note">${o.locked?'정산 중에는 배당률을 변경할 수 없습니다.':'저장한 배당률은 다음 정산부터 적용됩니다. 이벤트 배당 상한이 있으면 기간 중 상한까지 지급합니다.'}</p>
     <div class="business-section-heading"><h2>정산 내역</h2><span>최근 30건</span></div><div class="portfolio-table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"><table><thead><tr><th>정산일</th><th>영업수익</th><th>1주당 배당</th><th>배당 합계</th><th>회사 유보</th></tr></thead><tbody>${days.map(d=>`<tr><td>${new Date(d.day*86400000).toISOString().slice(0,10)}${o.currentDay===d.id?' · 지급 중':''}</td><td>${won(d.revenue)}</td><td>${won(d.perShare)}</td><td>${won(d.dividend)}</td><td>${won(d.retained)}</td></tr>`).join('')||'<tr><td colspan="5" class="table-empty">정산 내역이 없습니다.</td></tr>'}</tbody></table></div>
     <details class="business-guide"><summary>배당 기준</summary><p>한국 시간 하루 1회, 정산 시점의 보유 주식 수에 비례해 지급합니다. 미판매 주식은 제외하고 원 단위 나머지는 회사가 보유합니다. 지난 날짜를 소급해 자동 정산하지 않습니다.</p></details>
     ${user.role==='admin'?`<details class="economy-settings"><summary>설비·채용 가격 및 수익 정책</summary><p>가격·수익 정책은 새 구매부터 적용됩니다. 기존 구매 수익은 유지합니다.</p><form id="economy-config-form" class="admin-form">${Object.keys(DEFAULT_CONFIG).filter(k=>k!=='version').map(k=>`<label>${k==='researchBoostBps'?'R&D 수익 증가율 (%)':choices[k.replace(/Cost|Revenue/,'')]+' '+(k.endsWith('Cost')?'투자 비용':'원장 일수익 (정산 시 ×2)')}<input name="${k}" type="number" min="${k==='researchBoostBps'?0.01:1}" max="${k==='researchBoostBps'?10:100000000}" step="${k==='researchBoostBps'?0.01:1}" value="${k==='researchBoostBps'?c[k]/100:c[k]}" required></label>`).join('')}<button class="account-btn">정책 저장</button></form></details>`:''}
    </section>`;
   setTab(tab);
  }
  host.querySelector('#business-company').onchange=async e=>{selected=e.target.value;message('');await load();};
  host.querySelector('#business-refresh').onclick=load;
  host.onclick=async e=>{
   const nav=e.target.closest('[data-management-tab]');if(nav){setTab(nav.dataset.managementTab);return;}
   const button=e.target.closest('[data-business]');if(!button||button.disabled)return;
   const action=button.dataset.business,cid=selected;button.disabled=true;host.querySelector('#business-company').disabled=true;message(action==='settle'?'배당 정산 중…':'처리 중…');
   try{await post('/api/economy-'+({invest:'invest',settle:'settle'}[action]),{companyId:cid,asset:button.dataset.asset});await load();if(current()&&selected===cid)message(action==='settle'?'정산을 완료했습니다.':'반영했습니다.');}catch(err){await load();if(current())message(err.message);}finally{if(current())host.querySelector('#business-company').disabled=false;}
  };
  host.onkeydown=e=>{const nav=e.target.closest('[role="tab"][data-management-tab]');if(!nav||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['investments','events','spies','settlement'],index=tabs.indexOf(tab);setTab(e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length],true);};
  host.onsubmit=async e=>{
   if(!['dividend-form','economy-config-form','production-form'].includes(e.target.id))return;e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
   try{const b=Object.fromEntries(new FormData(e.target));if(e.target.id==='production-form')await post('/api/economy-production',{companyId:selected,...Object.fromEntries(['production','pendingProduction'].map(key=>[key,Object.fromEntries(Object.keys(assets).map(asset=>[asset,Number(b[key+'-'+asset])]))]))});else if(e.target.id==='dividend-form')await post('/api/economy-rate',{companyId:selected,dividendBps:Math.round(Number(b.rate)*100)});else await post('/api/economy-config',Object.fromEntries(Object.entries(b).map(([k,v])=>[k,k==='researchBoostBps'?Math.round(Number(v)*100):Number(v)])));await load();if(current())message('설정을 저장했습니다.');}catch(err){if(current())message(err.message);button.disabled=false;}
  };
  await load();
 }catch(e){if(current())host.textContent=e.message;}
 return ()=>{alive=false;};
}

import {activeSpies,MAX_SPIES} from '../client/spy-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const date=day=>new Date(day*86400000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
export async function showSpies(host,api,cid,companies,user,view,onChange,current){
 try{
  const [info,market]=await Promise.all([api('/api/spies?companyId='+encodeURIComponent(cid)),api('/api/companies')]);if(!current())return;const {policy:p,contract:s,history}=info;companies=market.companies;
  const name=id=>companies.find(c=>c.id===id)?.name||id;
  const agents=activeSpies(s),count=agents.length,targets=companies.filter(c=>c.id!==cid&&c.status==='listed');
  host.innerHTML=`<div class="business-section-heading"><h2>산업스파이</h2><span>활동 중 ${count} / ${MAX_SPIES}명</span></div>
   <div class="spy-overview"><article class="spy-contract"><span class="holding-chip">추가 고용 ${MAX_SPIES-count}명 가능</span><h3>1명당 일매출 0.5% 확보</h3>
   <p class="spy-price">${won(p.cost)} <small>/명 · 기간 제한 없음</small></p>
   <form id="spy-hire-form"><label>잠입할 기업<select name="targetId" required><option value="">대상 기업 선택</option>${targets.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><button class="account-btn" ${count>=MAX_SPIES||!targets.length||view.available<p.cost||view.ops.locked||view.ops.pendingEvent?'disabled':''}>1명 고용 · 100만 원</button></form>
   ${count>=MAX_SPIES?'<p class="inline-warning">고용 한도 10명에 도달했습니다.</p>':view.available<p.cost?'<p class="inline-warning">고용할 회사 자금이 부족합니다.</p>':''}
   <h3>활동 인원 ${count}명 · 합계 ${count*0.5}%</h3><div class="table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"><table><thead><tr><th>대상 기업</th><th>비율</th><th>활동</th><th>활동 시작</th></tr></thead><tbody>${agents.map(a=>`<tr><td>${esc(name(a.targetId))}</td><td>0.5%</td><td>계속 활동</td><td>${date(a.activeFromDay)}</td></tr>`).join('')||'<tr><td colspan="4" class="table-empty">활동 중인 스파이가 없습니다.</td></tr>'}</tbody></table></div>
   <p class="compact-note">같은 기업에 10명을 보내면 그 기업 일매출의 5%를 확보합니다. 고용하면 기간 제한 없이 계속 활동합니다. 오전 9시 전 고용은 당일, 이후에는 다음 날 정산부터 시작합니다.</p>
   <p class="compact-note">배당 뒤 회사 자금끼리 이체하며, 훔친 돈은 다시 훔치거나 당일 배당하지 않습니다. 동일 기업의 총 피해는 일매출의 10%와 보유 자금 중 작은 금액 이내입니다.</p></article>
   <article class="spy-ledger"><h3>스파이 정산 내역</h3><div class="table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"><table><thead><tr><th>정산일</th><th>확보</th><th>피해</th><th>순이체</th></tr></thead><tbody>${history.map(r=>`<tr><td>${date(r.day)}</td><td>${won(r.stolen)}</td><td>${won(r.lost)}</td><td>${r.net>0?'+':''}${won(r.net)}</td></tr>`).join('')||'<tr><td colspan="4" class="table-empty">정산 내역이 없습니다.</td></tr>'}</tbody></table></div><p class="compact-note">관련 기업의 영업수익·배당 정산이 모두 끝나면 한 번에 처리됩니다.</p></article></div>
   <p class="inline-warning" role="status" id="spy-message"></p>`;
  host.onsubmit=async e=>{e.preventDefault();e.stopPropagation();const button=e.target.querySelector('button'),form=new FormData(e.target);button.disabled=true;const status=host.querySelector('#spy-message');status.textContent='처리 중…';try{
   const hiring=e.target.id==='spy-hire-form',body=hiring?{companyId:cid,targetId:form.get('targetId')}:{cost:1000000,bps:50,settlements:0};
   await api(hiring?'/api/spy-hire':'/api/spy-policy',{method:'POST',body:JSON.stringify(body)});if(current())await onChange();
  }catch(error){if(current()){status.textContent=error.message;button.disabled=false;}}};
 }catch(error){if(current())host.textContent='산업스파이 정보를 불러오지 못했습니다: '+error.message;}
}

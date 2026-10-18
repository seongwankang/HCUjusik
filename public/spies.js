const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const date=day=>new Date(day*86400000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'});
export async function showSpies(host,api,cid,companies,user,view,onChange,current){
 try{
  const [info,market]=await Promise.all([api('/api/spies?companyId='+encodeURIComponent(cid)),api('/api/companies')]);if(!current())return;const {policy:p,contract:s,history}=info;companies=market.companies;
  const name=id=>companies.find(c=>c.id===id)?.name||id;
  const active=s?.remaining>0,targets=companies.filter(c=>c.id!==cid&&c.status==='listed');
  host.innerHTML=`<div class="business-section-heading"><h2>산업스파이</h2><span>회사당 1명</span></div>
   <div class="spy-overview"><article class="spy-contract"><span class="holding-chip">${active?'활동 중':'고용 가능'}</span><h3>${active?esc(name(s.targetId))+' 잠입':'경쟁사의 영업수익 일부 확보'}</h3>
   ${active?`<dl><div><dt>가져오는 비율</dt><dd>${s.bps/100}%</dd></div><div><dt>남은 활동</dt><dd>정산 ${s.remaining}회</dd></div><div><dt>활동 시작</dt><dd>${date(s.activeFromDay)} 오전 9시</dd></div></dl><p class="compact-note">활동이 끝나면 새 대상을 지정해 다시 고용할 수 있습니다.</p>`:`<p class="spy-price">${won(p.cost)} <small>· 일매출 ${p.bps/100}% · 정산 ${p.settlements}회</small></p><form id="spy-hire-form"><label>잠입할 기업<select name="targetId" required><option value="">대상 기업 선택</option>${targets.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><button class="account-btn" ${!targets.length||view.available<p.cost||view.ops.locked||view.ops.pendingEvent?'disabled':''}>산업스파이 고용</button></form>${view.available<p.cost?'<p class="inline-warning">고용할 회사 자금이 부족합니다.</p>':''}`}
   <p class="compact-note">일매출은 이벤트 반영 후 영업수익 기준입니다. 배당 뒤 회사 자금끼리 이체하며, 훔친 돈은 다시 훔치거나 당일 배당하지 않습니다. 동일 기업의 총 피해는 일매출의 10%와 보유 자금 중 작은 금액 이내입니다.</p></article>
   <article class="spy-ledger"><h3>스파이 정산 내역</h3><div class="table-wrap"><table><thead><tr><th>정산일</th><th>확보</th><th>피해</th><th>순이체</th></tr></thead><tbody>${history.map(r=>`<tr><td>${date(r.day)}</td><td>${won(r.stolen)}</td><td>${won(r.lost)}</td><td>${r.net>0?'+':''}${won(r.net)}</td></tr>`).join('')||'<tr><td colspan="4" class="table-empty">정산 내역이 없습니다.</td></tr>'}</tbody></table></div><p class="compact-note">관련 기업의 영업수익·배당 정산이 모두 끝나면 한 번에 처리됩니다.</p></article></div>
   ${user.role==='admin'?`<details class="business-guide"><summary>산업스파이 고용 정책</summary><form id="spy-policy-form" class="admin-form"><label>고용비 (원)<input name="cost" type="number" min="1000000" max="100000000" step="1" value="${p.cost}" required></label><label>가져오는 비율 (%)<input name="percent" type="number" min="0.01" max="5" step="0.01" value="${p.bps/100}" required></label><label>활동 정산 횟수<input name="settlements" type="number" min="1" max="30" value="${p.settlements}" required></label><button class="ghost">고용 정책 저장</button></form><p>변경한 정책은 새 고용부터 적용됩니다.</p></details>`:''}<p class="inline-warning" role="status" id="spy-message"></p>`;
  host.onsubmit=async e=>{e.preventDefault();e.stopPropagation();const button=e.target.querySelector('button'),form=new FormData(e.target);button.disabled=true;const status=host.querySelector('#spy-message');status.textContent='처리 중…';try{
   const hiring=e.target.id==='spy-hire-form',body=hiring?{companyId:cid,targetId:form.get('targetId')}:{cost:Number(form.get('cost')),bps:Math.round(Number(form.get('percent'))*100),settlements:Number(form.get('settlements'))};
   await api(hiring?'/api/spy-hire':'/api/spy-policy',{method:'POST',body:JSON.stringify(body)});if(current())await onChange();
  }catch(error){if(current()){status.textContent=error.message;button.disabled=false;}}};
 }catch(error){if(current())host.textContent='산업스파이 정보를 불러오지 못했습니다: '+error.message;}
}

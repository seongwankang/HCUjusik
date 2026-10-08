const state = {page:'dashboard',companies:[],news:[],user:null};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const won = value => Number(value || 0).toLocaleString('ko-KR') + '원';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function getJSON(url,options={}) {
  const response = await fetch(url,{credentials:'same-origin',...options});
  let data = {};
  try {data = await response.json();}catch{}
  if (!response.ok) throw new Error(data.error || `서버 응답 오류 (${response.status})`);
  return data;
}

function navigate(page) {
  if (!['dashboard','market','news','portfolio','management'].includes(page)) return;
  state.page = page;
  $$('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  $$('button[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('#current-title').textContent = {dashboard:'대시보드',market:'주식시장',news:'시장 뉴스',portfolio:'내 자산',management:'기업 경영'}[page];
  if(page==='portfolio') loadPortfolio();
  if(page==='management') loadManagement();
  window.scrollTo({top:0,behavior:'instant'});
}

function companyMark(name) {return esc(name.slice(0,1));}
function companyRow(c) {
  return `<button class="company-mini-row" data-company="${esc(c.id)}"><span class="company-badge">${companyMark(c.name)}</span><span><div class="company-name">${esc(c.name)}</div><div class="company-code">${esc(c.ticker)}</div></span><span class="right">기업 정보 →</span></button>`;
}
function renderCompanies() {
  $('#featured-companies').innerHTML = state.companies.slice(0,5).map(companyRow).join('') || '<div class="placeholder">등록된 기업이 없습니다.</div>';
  const search = ($('#company-search').value || '').trim().toLocaleLowerCase();
  const rows = state.companies.filter(c=>(c.name+' '+c.ticker).toLocaleLowerCase().includes(search));
  $('#market-count').textContent = rows.length;
  $('#market-rows').innerHTML = rows.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td class="muted">${esc(c.ticker)}</td><td>${won(c.referencePrice)}</td><td><span class="state-tag ${c.status==='listed'?'listed':''}">${c.status==='listed'?'상장':'준비 중'}</span></td><td><button class="row-button" data-company="${esc(c.id)}">보기 →</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">검색 결과가 없습니다.</td></tr>';
}
function newsCard(n,compact=false) {
  return compact ? `<div class="news-item"><small>공지사항</small><h4>${esc(n.title)}</h4><p>${esc(n.content)}</p></div>`:
  `<article class="news-card"><small>${n.companyName?'기업 뉴스 · '+esc(n.companyName):'운영 공지'}</small><h3>${esc(n.title)}</h3><p>${esc(n.content)}</p></article>`;
}
function renderNews() {
  $('#featured-news').innerHTML = state.news.slice(0,3).map(n=>newsCard(n,true)).join('') || '<div class="placeholder">등록된 공지가 없습니다.</div>';
  $('#all-news').innerHTML = state.news.map(n=>newsCard(n)).join('') || '<div class="panel empty-state">등록된 뉴스가 없습니다.</div>';
}
function showCompany(id) {
  const c = state.companies.find(c=>c.id===id);
  if (!c) return;
  $('#detail-title').textContent=c.name;
  $('#company-detail').innerHTML=`<p>${esc(c.description||'기업 소개가 아직 등록되지 않았습니다.')}</p><div class="detail-list"><div><span>기업 코드</span><strong>${esc(c.ticker)}</strong></div><div><span>상장 상태</span><strong>${c.status==='listed'?'상장':'준비 중'}</strong></div><div><span>시연용 기준가격</span><strong>${won(c.referencePrice)}</strong></div><div><span>발행 주식</span><strong>${Number(c.issuedShares).toLocaleString('ko-KR')}주</strong></div></div><div class="info-note">실제 기업 실적과 거래 가격은 행사 규칙을 확정한 후 적용됩니다.</div>`;
  $('#company-dialog').showModal();
}
function loginPrompt(message) {
  return `<div>${esc(message)}<div><button class="login-prompt" id="prompt-login">로그인하기 →</button></div></div>`;
}
async function loadPortfolio() {
  const target = $('#portfolio-content');
  if(!state.user){target.innerHTML=loginPrompt('로그인하면 현재 가상 자산을 조회할 수 있습니다.');return;}
  target.innerHTML='<div class="placeholder">자산을 불러오는 중…</div>';
  try {
    const data=await getJSON('/api/portfolio');
    const holdings=(data.holdings||[]);
    const positions=holdings.reduce((sum,h)=>sum+h.quantity*h.referencePrice,0);
    target.innerHTML=`<div class="asset-summary"><div><span>보유 현금</span><strong>${won(data.cash)}</strong></div><div><span>주식 평가액(참고)</span><strong>${won(positions)}</strong></div><div><span>총 평가 자산(참고)</span><strong>${won(data.cash+positions)}</strong></div></div><div class="list-title">보유 주식</div>${holdings.length?holdings.map(h=>`<div class="asset-row"><span>${esc(h.name)} (${esc(h.ticker)})</span><strong>${h.quantity}주</strong></div>`).join(''):'<div class="placeholder">보유 주식이 없습니다.</div>'}<div class="info-note">주식 평가액은 임시 기준가격을 사용한 참고값입니다. 행사 공식 순위 점수가 아닙니다.</div>`;
  }catch(e){target.textContent=e.message;}
}
async function loadManagement() {
  const target=$('#management-content');
  if(!state.user){target.innerHTML=loginPrompt('동아리장 계정으로 로그인하면 담당 기업을 확인할 수 있습니다.');return;}
  target.innerHTML='<div class="placeholder">기업 정보를 불러오는 중…</div>';
  try {
    const {companies}=await getJSON('/api/my-company');
    if(!companies.length){target.innerHTML='<div>현재 계정에는 담당 기업이 지정되어 있지 않습니다.</div>';return;}
    target.innerHTML=companies.map(c=>`<div class="asset-row"><strong>${esc(c.name)} (${esc(c.ticker)})</strong><span>${esc(c.status==='listed'?'상장':'준비 중')}</span></div>`).join('')+'<div class="info-note">공장 건설·부지 확장·이벤트 응답 등 경영 기능은 향후 구현합니다.</div>';
  }catch(e){target.textContent=e.message;}
}
function updateAccountButton() {
  const btn=$('#account-button');
  btn.textContent=state.user?`${state.user.displayName} · 로그아웃`:'로그인';
  btn.title=state.user?'로그아웃':'로그인';
}
async function refreshSession() {
  try{const data=await getJSON('/api/me');state.user=data.user;}catch{state.user=null;}
  updateAccountButton();
}
async function initialLoad() {
  const results=await Promise.allSettled([getJSON('/api/companies'),getJSON('/api/news'),refreshSession()]);
  if(results[0].status==='fulfilled')state.companies=results[0].value.companies;
  else $('#featured-companies').textContent='기업 정보를 불러오지 못했습니다. 데이터베이스 설정을 확인하세요.';
  if(results[1].status==='fulfilled')state.news=results[1].value.news;
  else $('#featured-news').textContent='공지 정보를 불러오지 못했습니다.';
  if(results[0].status==='fulfilled')renderCompanies();
  if(results[1].status==='fulfilled')renderNews();
}

$$('button[data-page]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
document.addEventListener('click',event=>{
  const go=event.target.closest('button[data-goto]');
  if(go)navigate(go.dataset.goto);
  const company=event.target.closest('button[data-company]');
  if(company)showCompany(company.dataset.company);
  const prompt=event.target.closest('#prompt-login');
  if(prompt)$('#login-dialog').showModal();
});
$('#company-search').addEventListener('input',renderCompanies);
$('#account-button').addEventListener('click',async()=>{
  if(!state.user){$('#login-dialog').showModal();return;}
  try {await getJSON('/api/logout',{method:'POST'});}catch(e){alert(e.message);return;}
  state.user=null;updateAccountButton();
  if(state.page==='portfolio')loadPortfolio();
  if(state.page==='management')loadManagement();
});
$('#close-login').addEventListener('click',()=>$('#login-dialog').close());
$('#close-detail').addEventListener('click',()=>$('#company-dialog').close());
$('#detail-close').addEventListener('click',()=>$('#company-dialog').close());
$('#login-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  $('#login-error').textContent='';
  const username=$('#username').value;
  const password=$('#password').value;
  try{
    const data=await getJSON('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    state.user=data.user;
    $('#password').value='';
    $('#login-dialog').close();updateAccountButton();
    if(state.page==='portfolio')loadPortfolio();
    if(state.page==='management')loadManagement();
  }catch(error){$('#login-error').textContent=error.message;}
});
initialLoad();

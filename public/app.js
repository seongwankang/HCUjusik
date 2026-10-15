import {setupAdmin} from './admin.js';
import {dataRequest, login, signup, logout, sessionVersion, verificationStatus, sendVerification} from './auth.bundle.js';
const state = {page:'dashboard',companies:[],news:[],events:[],user:null,companyError:null};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const won = value => Number(value || 0).toLocaleString('ko-KR') + '원';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function getJSON(url,options={}) {
  const generation = sessionVersion();
  const data=await dataRequest(url,options);
  if (generation !== sessionVersion()) throw new Error('로그인 상태가 변경되었습니다.');
  return data;
}

function navigate(page) {
  if (!['dashboard','market','news','portfolio','management','admin'].includes(page)) return;
  if(page==='admin' && state.user?.role!=='admin')return;
  state.page = page;
  $$('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  $$('button[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('#current-title').textContent = {dashboard:'대시보드',market:'주식시장',news:'시장 뉴스',portfolio:'내 자산',management:'기업 경영',admin:'관리자'}[page];
  if(page==='portfolio') loadPortfolio();
  if(page==='management') loadManagement();
  window.scrollTo({top:0,behavior:'instant'});
}

function companyMark(name) {return esc(name.slice(0,1));}
function companyRow(c) {
  return `<button class="company-mini-row" data-company="${esc(c.id)}"><span class="company-badge">${companyMark(c.name)}</span><span><div class="company-name">${esc(c.name)}</div><div class="company-code">${esc(c.ticker)}</div></span><span class="right">기업 정보 →</span></button>`;
}
function renderCompanies() {
  if(state.companyError) {
    const message=esc(state.companyError);
    $('#featured-companies').innerHTML=`<div class="placeholder">${message}</div>`;
    $('#market-count').textContent='—';
    $('#market-rows').innerHTML=`<tr><td colspan="5" class="muted">${message}</td></tr>`;
    return;
  }
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
  $('#all-news').innerHTML = state.news.map(n=>newsCard(n)).join('') + state.events.map(e=>newsCard({title:`기업 이벤트 · ${e.title}`,content:`${e.content}\n기간: ${new Date(e.startsAt).toLocaleString('ko-KR')} ~ ${new Date(e.endsAt).toLocaleString('ko-KR')} (게시용)`,companyName:e.companyId})).join('') || '<div class="panel empty-state">등록된 뉴스·이벤트가 없습니다.</div>';
}
function showCompany(id) {
  const c = state.companies.find(c=>c.id===id);
  if (!c) return;
  $('#detail-title').textContent=c.name;
  $('#company-detail').innerHTML=`<p>${esc(c.description||'기업 소개가 아직 등록되지 않았습니다.')}</p><div class="detail-list"><div><span>기업 코드</span><strong>${esc(c.ticker)}</strong></div><div><span>상장 상태</span><strong>${c.status==='listed'?'상장':'준비 중'}</strong></div><div><span>시연용 기준가격</span><strong>${won(c.referencePrice)}</strong></div><div><span>발행 주식</span><strong>${Number(c.issuedShares).toLocaleString('ko-KR')}주</strong></div></div><div class="info-note">실제 기업 실적과 거래 가격은 행사 규칙을 확정한 후 적용됩니다.</div>`;
  $('#company-dialog').showModal();
  setupTrade(c);
}
let pendingOrder=null;
async function setupTrade(c){
 const box=$('#test-trade');pendingOrder=null;
 if(!['test-a','test-b'].includes(c.id)||c.status!=='listed'){box.textContent='현재는 두 테스트 기업만 거래할 수 있습니다.';return;}
 box.innerHTML=`<h3>테스트 매매</h3><p class="info-note">별도 테스트 자금 100만 원 · 기준가격 즉시 체결 · 수수료 없음 · 공식 자산에 영향 없음</p><p id="test-balance">계좌 조회 중…</p><form id="test-order-form"><label>주문 구분 <select id="test-side"><option value="buy">매수</option><option value="sell">매도</option></select></label><label>수량(주) <input id="test-quantity" type="number" min="1" max="1000000" step="1" value="1" required></label><p id="test-total"></p><button type="submit" id="test-submit" disabled>테스트 주문 실행</button><p id="test-message" role="status"></p></form>`;
 const total=()=>{$('#test-total').textContent=`예상 주문금액 ${won(Number($('#test-quantity').value)*c.referencePrice)}`;pendingOrder=null;};
 $('#test-quantity').addEventListener('input',total);$('#test-side').addEventListener('change',total);total();
 async function balance(){const a=await getJSON('/api/test-portfolio');if(!box.querySelector('#test-balance'))return;$('#test-balance').textContent=`테스트 현금 ${won(a.cash)} · 이 종목 보유 ${a.positions[c.id]||0}주`;$('#test-submit').disabled=false;}
 $('#test-order-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('#test-submit');button.disabled=true;
  const quantity=Number($('#test-quantity').value),side=$('#test-side').value;
  if(!Number.isSafeInteger(quantity)||quantity<1){$('#test-message').textContent='수량을 정수로 입력하세요.';button.disabled=false;return;}
  if(!pendingOrder)pendingOrder={companyId:c.id,side,quantity,price:c.referencePrice,orderId:crypto.randomUUID()};
  try{const result=await getJSON('/api/test-orders',{method:'POST',body:JSON.stringify(pendingOrder)});pendingOrder=null;$('#test-message').textContent=result.duplicate?'이미 처리된 주문입니다. 중복 체결하지 않았습니다.':'테스트 주문이 체결되었습니다.';await balance();if(state.page==='portfolio')loadPortfolio();}
  catch(error){$('#test-message').textContent=error.code==='permission-denied'?'테스트 거래 규칙이 아직 게시되지 않았거나 거래 권한이 없습니다.':error.message;}
  finally{button.disabled=false;}
 });
 try{await balance();}catch{$('#test-balance').textContent='테스트 계좌를 열지 못했습니다. 로그인 및 최신 Firestore 규칙 게시 여부를 확인하세요.';}
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
    const a=await getJSON('/api/test-portfolio');
    target.insertAdjacentHTML('beforeend',`<h3>테스트 매매 계좌 (공식 자산과 별도)</h3><p>테스트 현금 ${won(a.cash)}</p>${Object.entries(a.positions).map(([id,q])=>`<div class="asset-row"><span>${esc(state.companies.find(c=>c.id===id)?.name||id)}</span><strong>${q}주</strong></div>`).join('')}<h4>최근 테스트 체결 (20건)</h4>${a.orders.map(o=>`<div class="asset-row"><span>${esc(o.companyId)} · ${o.side==='buy'?'매수':'매도'} ${o.quantity}주</span><strong>${won(o.total)}</strong></div>`).join('')||'<p>체결 내역이 없습니다.</p>'}`);
  }catch(e){target.insertAdjacentHTML('beforeend',`<p>${esc(e.message)}</p>`);}
}
async function loadManagement() {
  const target=$('#management-content');
  if(!state.user){target.innerHTML=loginPrompt('사장 계정으로 로그인하면 담당 기업을 확인할 수 있습니다.');return;}
  target.innerHTML='<div class="placeholder">기업 정보를 불러오는 중…</div>';
  try {
    const {companies}=await getJSON('/api/my-company');
    if(!companies.length){target.innerHTML='<div>현재 계정에는 담당 기업이 지정되어 있지 않습니다.</div>';return;}
    target.innerHTML=companies.map(c=>`<div class="asset-row"><strong>${esc(c.name)} (${esc(c.ticker)})</strong><span>${esc(c.status==='listed'?'상장':'준비 중')}</span></div>`).join('')+'<div class="info-note">공장 건설·부지 확장·이벤트 응답 등 경영 기능은 향후 구현합니다.</div>';
  }catch(e){target.textContent=e.message;}
}
function updateAccountButton() {
  adminUI.session(state.user);
  if(state.page==='admin' && state.user?.role!=='admin')navigate('dashboard');
  const btn=$('#account-button');
  btn.textContent=state.user?`${state.user.displayName} · 로그아웃`:'로그인';
  btn.title=state.user?'로그아웃':'로그인';
}
async function refreshSession() {
  try{const data=await getJSON('/api/me');state.user=data.user;}catch{state.user=null;}
  updateAccountButton();
}
async function initialLoad() {
  const results=await Promise.allSettled([getJSON('/api/companies'),getJSON('/api/news'),refreshSession(),getJSON('/api/events')]);
  if(results[0].status==='fulfilled') {
    state.companies=results[0].value.companies;
    state.companyError=null;
  } else {
    state.companies=[];
    state.companyError=state.user
      ? `기업 정보를 불러오지 못했습니다. ${results[0].reason.message}`
      : '상단 로그인 버튼으로 로그인하면 테스트 기업을 조회할 수 있습니다.';
  }
  if(results[1].status==='fulfilled')state.news=results[1].value.news;
  else $('#featured-news').textContent='공지 정보를 불러오지 못했습니다.';
  state.events=results[3].status==='fulfilled'?results[3].value.events:[];
  renderCompanies();
  if(results[1].status==='fulfilled' || results[3].status==='fulfilled')renderNews();
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
  try {await logout();}catch(e){alert(e.message);return;}
  state.user=null;state.companies=[];state.companyError='상단 로그인 버튼으로 로그인하면 테스트 기업을 조회할 수 있습니다.';state.news=[];state.events=[];renderCompanies();renderNews();updateAccountButton();
  if(state.page==='portfolio')loadPortfolio();
  if(state.page==='management')loadManagement();
});
$('#close-login').addEventListener('click',()=>$('#login-dialog').close());
$('#close-detail').addEventListener('click',()=>$('#company-dialog').close());
$('#detail-close').addEventListener('click',()=>$('#company-dialog').close());
let signupMode=false;
function verificationPanel(show){
  $('#verification-panel').hidden=!show;
  for(const selector of ['#username','#password','label[for="username"]','label[for="password"]','#auth-submit','#auth-toggle'])$(selector).hidden=show;
  $('#signup-name-label').hidden=show||!signupMode;
  $('#signup-warning').hidden=show||!signupMode;
}
async function finishLogin(){
  let data;
  try{data=await getJSON('/api/me');}
  catch(error){
    const status=await verificationStatus();
    if(!status||!status.verified||!/^[^\s@]+@hcu\.hs\.kr$/i.test(status.email||''))throw error;
    const name=$('#verification-name').value.trim()||$('#signup-name').value.trim();
    if(!name)throw new Error('이메일 인증 후 학생 이름을 입력해 주세요.');
    await getJSON('/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:name})});
    data=await getJSON('/api/me');
  }
  state.user=data.user;await initialLoad();$('#password').value='';
  verificationPanel(false);$('#login-dialog').close();updateAccountButton();
  if(state.page==='portfolio')loadPortfolio();if(state.page==='management')loadManagement();
}
$('#verification-resend').addEventListener('click',async()=>{
  const b=$('#verification-resend');b.disabled=true;
  try{await sendVerification();$('#verification-message').textContent='인증 메일을 다시 보냈습니다. 스팸메일함도 확인하세요.';}
  catch{$('#verification-message').textContent='메일을 보내지 못했습니다. 잠시 후 다시 시도하세요.';}
  finally{setTimeout(()=>{b.disabled=false;},60000);}
});
$('#verification-check').addEventListener('click',async()=>{
  const b=$('#verification-check');b.disabled=true;
  try{const status=await verificationStatus(true);if(!status?.verified){$('#verification-message').textContent='아직 인증되지 않았습니다. 메일의 인증 링크를 눌러 주세요.';return;}await finishLogin();}
  catch(e){$('#verification-message').textContent=e.message;}
  finally{b.disabled=false;}
});
$('#auth-toggle').addEventListener('click',()=>{
  signupMode=!signupMode;
  $('#auth-title').textContent=signupMode?'학생 회원가입':'로그인';
  $('#auth-submit').textContent=signupMode?'회원가입':'로그인';
  $('#auth-toggle').textContent=signupMode?'이미 가입했나요? 로그인':'처음 오셨나요? 회원가입';
  $('#auth-description').textContent=signupMode?'학생 계정으로 가입합니다. 사장 역할은 관리자가 지정합니다.':'이메일과 비밀번호로 로그인하세요.';
  $('#signup-name-label').hidden=!signupMode;
  $('#signup-name').disabled=!signupMode;
  $('#signup-name').required=signupMode;
  $('#signup-warning').hidden=!signupMode;
  $('#password').minLength=signupMode?6:0;
  $('#password').autocomplete=signupMode?'new-password':'current-password';
  $('#login-error').textContent='';
});
$('#login-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  $('#login-error').textContent='';
  const username=$('#username').value.trim().toLowerCase();
  const password=$('#password').value;
  const submit=$('#auth-submit');submit.disabled=true;
  try{
    if(signupMode){
      if(!/^[^\s@]+@hcu\.hs\.kr$/i.test(username)){throw new Error('학교 이메일(@hcu.hs.kr)로만 가입할 수 있습니다.');}
      try{await signup(username,password);}catch(error){if(error.code==='auth/email-already-in-use')await login(username,password);else throw error;}
    }else await login(username,password);
    // Existing active admin profiles are exempt; the server decides that exemption.
    try{await finishLogin();}catch(error){
      const status=await verificationStatus();
      if(!status||!/^[^\s@]+@hcu\.hs\.kr$/i.test(status.email||''))throw error;
      verificationPanel(true);$('#password').value='';$('#auth-title').textContent='이메일 인증';
      $('#verification-address').textContent=status.email;$('#verification-name').value=$('#signup-name').value;
      $('#verification-message').textContent=status.verified?error.message:'메일의 인증 링크를 누른 뒤 인증 완료 확인을 눌러 주세요.';
      if(signupMode&&!status.verified){try{await sendVerification();$('#verification-message').textContent='인증 메일을 보냈습니다. 스팸메일함도 꼭 확인하세요.';}catch{$('#verification-message').textContent='인증 메일을 보내지 못했습니다. 잠시 후 재발송 버튼을 눌러 주세요.';}}
    }
  }catch(error){await logout().catch(()=>{});$('#login-error').textContent=signupMode&&error.message.includes('학교 이메일')?error.message:'로그인 또는 가입을 완료하지 못했습니다. 이메일·비밀번호와 참가 상태를 확인하세요.';}
  finally{submit.disabled=false;}
});
const adminUI=setupAdmin(getJSON);
initialLoad();

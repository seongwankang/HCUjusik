import {showManagement} from './management.js';
import {parseRoute,companyRoute} from './routes.js';
import {installUpdateNotice} from './updates.js';
import {showTrading,closeTrading} from './exchange.js';
import {setupAdmin} from './admin.js';
import {dataRequest, login, signup, logout, sessionVersion, verificationStatus, sendVerification} from './auth.bundle.js';
const state = {page:'dashboard',companies:[],news:[],events:[],user:null,companyError:null,companyId:null};
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

function navigate(page,writeRoute=true) {
  if (!['dashboard','market','news','portfolio','management','admin','company'].includes(page)) return;
  if(page==='admin' && state.user?.role!=='admin')return;
  if(page==='dashboard'&&state.companies.length){showCompany(state.companyId||state.companies[0].id,writeRoute);return;}
  closeTrading();
  state.page = page;
  if(writeRoute&&location.hash!=='#/'+page)history.pushState(null,'','#/'+page);
  $$('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));
  $$('button[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===(page==='company'?'market':page)));
  document.querySelectorAll('.workspace-tabs button').forEach(el=>el.classList.toggle('selected',el.dataset.goto===(page==='company'?'market':page)));
  $('#current-title').textContent = {dashboard:'종합화면',market:'주식시장',news:'시장 뉴스',portfolio:'내 자산',management:'기업 경영',admin:'관리자',company:'종목 거래'}[page];
  document.title=$('#current-title').textContent+' | 청운증권HTS';
  if(page==='portfolio') loadPortfolio();
  if(page==='management') loadManagement();
  if(page==='news')refreshNews();
  window.scrollTo({top:0,behavior:'instant'});
}

function companyMark(name) {return esc(name.slice(0,1));}
function companyRow(c) {
  return `<button class="company-mini-row" data-company="${esc(c.id)}"><span class="company-badge">${companyMark(c.name)}</span><span><div class="company-name">${esc(c.name)}</div><div class="company-code">${esc(c.ticker)}</div></span><span class="right"><strong>${won(c.referencePrice)}</strong><small>종목 거래 ↗</small></span></button>`;
}
function renderWatchlist(){
 const search=($('#watch-search').value||'').trim().toLocaleLowerCase();
 const companies=state.companies.filter(c=>(c.name+' '+c.ticker).toLocaleLowerCase().includes(search));
 $('#featured-companies').innerHTML=companies.map(c=>companyRow(c).replace('company-mini-row','company-mini-row'+(c.id===state.companyId?' selected':''))).join('')||'<div class="placeholder">검색 결과가 없습니다.</div>';
}
$('#watch-search').addEventListener('input',renderWatchlist);
function renderCompanies() {
  $('#desk-company-count').textContent=state.companyError?'—':state.companies.length.toLocaleString('ko-KR');
  $('#desk-listed-count').textContent=state.companyError?'—':state.companies.filter(c=>c.status==='listed').length.toLocaleString('ko-KR');
  if(state.companyError) {
    const message=esc(state.companyError);
    $('#featured-companies').innerHTML=`<div class="placeholder">${message}</div>`;
    $('#market-count').textContent='—';
    $('#market-rows').innerHTML=`<tr><td colspan="5" class="muted">${message}</td></tr>`;
    return;
  }
  renderWatchlist();
  const search = ($('#company-search').value || '').trim().toLocaleLowerCase();
  const rows = state.companies.filter(c=>(c.name+' '+c.ticker).toLocaleLowerCase().includes(search));
  $('#market-count').textContent = rows.length;
  $('#market-rows').innerHTML = rows.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td class="muted">${esc(c.ticker)}</td><td>${won(c.referencePrice)}</td><td><span class="state-tag ${c.status==='listed'?'listed':''}">${c.status==='listed'?'상장':'준비 중'}</span></td><td><button class="row-button" data-company="${esc(c.id)}">보기 →</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">검색 결과가 없습니다.</td></tr>';
}
function newsCard(n,compact=false) {
  return compact ? `<div class="news-item"><small>공지사항</small><h4>${esc(n.title)}</h4><p>${esc(n.content)}</p></div>`:
  `<article class="news-card"><small>${n.companyName?'기업 뉴스 · '+esc(n.companyName):'운영 공지'}</small>${n.publishedAt?'<time>'+esc(new Date(n.publishedAt).toLocaleString('ko-KR'))+'</time>':''}<h3>${esc(n.title)}</h3><p>${esc(n.content)}</p></article>`;
}
let newsRead=0;
async function refreshNews(){const read=++newsRead,uid=state.user?.id;if(!uid)return;try{const [n,e]=await Promise.all([getJSON('/api/news'),getJSON('/api/events')]);if(read!==newsRead||uid!==state.user?.id)return;state.news=n.news;state.events=e.events;renderNews();}catch(e){if(state.page==='news')$('#all-news').textContent=e.message;}}
window.addEventListener('admin-saved',e=>{if(e.detail?.kind==='companies')initialLoad();else refreshNews();});
function renderNews() {
  $('#featured-news').innerHTML = state.news.slice(0,3).map(n=>newsCard(n,true)).join('') || '<div class="placeholder">등록된 공지가 없습니다.</div>';
  $('#all-news').innerHTML = state.news.map(n=>newsCard(n)).join('') + state.events.map(e=>newsCard({title:`기업 이벤트 · ${e.title}`,content:`${e.content}\n기간: ${new Date(e.startsAt).toLocaleString('ko-KR')} ~ ${new Date(e.endsAt).toLocaleString('ko-KR')} (게시용)`,companyName:e.companyId})).join('') || '<div class="panel empty-state">등록된 뉴스·이벤트가 없습니다.</div>';
}
function showCompany(id,writeRoute=true) {
  navigate('company',false);state.companyId=id;
  if(writeRoute&&location.hash!==companyRoute(id))history.pushState(null,'',companyRoute(id));
  const c=state.companies.find(c=>c.id===id);
  renderWatchlist();
  $('#detail-title').textContent=c?.name||'종목 거래';$('#current-title').textContent=c?.name||'종목 거래';
  document.title=(c?.name||'종목 거래')+' | 청운증권HTS';
  $('#company-symbol').textContent=c?.ticker||'';$('#company-category').textContent=c?.category||'';
  $('#company-price-label').textContent='초기 기준가격';$('#company-current-price').textContent=c?won(c.referencePrice):'—';
  $('#company-listing').textContent=c?(c.status==='listed'?'거래 가능':'거래 준비 / 정지'):'';
  if(!c){$('#company-detail').textContent='';$('#test-trade').innerHTML=state.user?'<div class="placeholder">기업을 찾을 수 없습니다. 전체 종목에서 다시 선택하세요.</div>':loginPrompt('로그인하면 이 기업의 호가와 주문 화면을 사용할 수 있습니다.');return;}
  $('#company-detail').innerHTML=`<p>${esc(c.description||'기업 소개가 아직 등록되지 않았습니다.')}</p><dl><div><dt>기업 코드</dt><dd>${esc(c.ticker)}</dd></div><div><dt>발행 주식</dt><dd>${Number(c.issuedShares).toLocaleString('ko-KR')}주</dd></div><div><dt>초기 판매가</dt><dd>${won(c.referencePrice)}</dd></div></dl>`;
  showTrading(c,getJSON);
}
function applyRoute(){const r=parseRoute(location.hash);if(r.page==='company')showCompany(r.companyId,false);else navigate(r.page,false);}
window.addEventListener('hashchange',applyRoute);
function loginPrompt(message) {
  return `<div>${esc(message)}<div><button class="login-prompt" id="prompt-login">로그인하기 →</button></div></div>`;
}
let portfolioRead=0;
async function loadPortfolio() {
 const target=$('#portfolio-content'),uid=state.user?.id,read=++portfolioRead;
 if(!uid){target.innerHTML=loginPrompt('로그인하면 현재 가상 자산을 조회할 수 있습니다.');return;}
 const current=()=>read===portfolioRead&&state.page==='portfolio'&&state.user?.id===uid;
 target.classList.remove('empty-state');target.innerHTML='<div class="placeholder portfolio-loading">거래 계좌를 조회하는 중…</div>';
 try{
  const p=await getJSON('/api/trading-portfolio');if(!current())return;
  const value=n=>n===null?'—':won(n);
  target.innerHTML=`<div class="panel-title"><h2>나의 거래 계좌</h2><button type="button" class="text-link" id="portfolio-refresh">↻ 새로고침</button></div><div class="portfolio-totals"><div class="portfolio-total"><span>총 평가 자산</span><strong>${value(p.totalValue)}</strong><small>보유 현금 + 주식 평가액</small></div><div><span>보유 현금</span><strong>${won(p.cash)}</strong><small>주문 예약금 포함</small></div><div><span>주식 평가액</span><strong>${value(p.stockValue)}</strong><small>최근 체결가 기준</small></div></div><div class="portfolio-reserves"><span>주문 가능 현금 <b>${won(p.availableCash)}</b></span><span>미체결 주문 예약금 <b>${won(p.reservedCash)}</b></span></div><div class="panel-title"><h2>보유 주식 <span class="count">${p.holdings.length}</span></h2><span>매도 예약 수량도 보유 주식에 포함됩니다</span></div>${p.holdings.length?`<div class="trade-table-wrap"><table class="portfolio-table"><thead><tr><th>종목</th><th>보유 수량</th><th>매도 가능</th><th>매도 예약</th><th>평가 가격</th><th>평가 금액</th><th></th></tr></thead><tbody>${p.holdings.map(h=>`<tr><td><strong>${esc(h.name)}</strong><small>${esc(h.ticker)}</small></td><td>${h.quantity.toLocaleString('ko-KR')}주</td><td>${h.available.toLocaleString('ko-KR')}주</td><td>${h.reserved.toLocaleString('ko-KR')}주</td><td>${value(h.price)}${h.priceSource==='initial'?'<small>초기 기준가</small>':''}</td><td>${value(h.value)}</td><td><button class="row-button" data-company="${esc(h.companyId)}">거래 ↗</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="portfolio-empty">현재 보유한 주식이 없습니다. 종목 화면에서 매수한 주식이 여기에 표시됩니다.</div>'}<p class="portfolio-note">미체결 매수 주문은 체결 전까지 보유 주식에 반영되지 않습니다.${!p.initialized?' 첫 거래 전의 시작 자금입니다.':''}${!p.valuationComplete?' 가격을 확인할 수 없는 종목이 있어 평가 금액은 표시하지 않았습니다.':''}</p>`;
  try{const {dividends}=await getJSON('/api/dividends');if(current())target.insertAdjacentHTML('beforeend','<div class="panel-title"><h2>받은 배당 · 최근 30건</h2></div>'+ (dividends.length?'<div class="trade-table-wrap"><table><thead><tr><th>정산일</th><th>기업</th><th>보유 주식</th><th>받은 배당</th></tr></thead><tbody>'+dividends.map(d=>'<tr><td>'+new Date(d.day*86400000).toISOString().slice(0,10)+'</td><td>'+esc(state.companies.find(c=>c.id===d.companyId)?.name||d.companyId)+'</td><td>'+d.shares+'주</td><td>'+won(d.amount)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="muted">아직 받은 배당이 없습니다.</p>'));}catch(e){if(current())target.insertAdjacentHTML('beforeend','<p class="muted">배당 내역: '+esc(e.message)+'</p>');}
 }catch(e){if(current())target.innerHTML=`<div class="portfolio-empty">${esc(e.message)}<br><button type="button" class="text-link" id="portfolio-refresh">다시 조회</button></div>`;}
}
let managementRead=0;
async function loadManagement() {
 const target=$('#management-content'),user=state.user,read=++managementRead;
 if(!user){target.innerHTML=loginPrompt('사장 계정으로 로그인하면 담당 기업을 확인할 수 있습니다.');return;}
 if(!['admin','president'].includes(user.role)){target.textContent='담당 사장 또는 관리자 계정으로 이용할 수 있습니다.';return;}
 await showManagement(target,getJSON,user,()=>read===managementRead&&state.user?.id===user.id&&state.page==='management');
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
  applyRoute();
}

$$('button[data-page]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
document.addEventListener('click',event=>{
  if(event.target.closest('#portfolio-refresh')){loadPortfolio();return;}
  const go=event.target.closest('button[data-goto]');
  if(go)navigate(go.dataset.goto);
  const company=event.target.closest('button[data-company]');
  if(company)showCompany(company.dataset.company);
  const prompt=event.target.closest('#prompt-login,[data-open-login]');
  if(prompt)$('#login-dialog').showModal();
});
$('#company-search').addEventListener('input',renderCompanies);
$('#account-button').addEventListener('click',async()=>{
  if(!state.user){$('#login-dialog').showModal();return;}
  closeTrading();
  try {await logout();}catch(e){alert(e.message);return;}
  state.user=null;state.companies=[];state.companyError='상단 로그인 버튼으로 로그인하면 테스트 기업을 조회할 수 있습니다.';state.news=[];state.events=[];renderCompanies();renderNews();updateAccountButton();
  if(state.page==='portfolio')loadPortfolio();
  if(state.page==='management')loadManagement();
  if(state.page==='company')showCompany(state.companyId,false);
});
$('#close-login').addEventListener('click',()=>$('#login-dialog').close());
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
installUpdateNotice(typeof __APP_BUILD__==='string'?__APP_BUILD__:'dev');
initialLoad();

import {setHTMLKeepingScroll} from './scroll-state.js';
import {NEWS_CATEGORIES,newsCategory} from '../src/news-category.js';
import {showEventAdmin} from './events.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupAdmin(api){
 const host=document.querySelector('#admin-content'),nav=document.querySelector('#admin-nav');
 let kind='companies',items=[],editing=false,companies=[],requestVersion=0;
 const fields={companies:['name','ticker','category','description','status','referencePrice','issuedShares'],news:['category','title','content','companyId'],events:['title','content','companyId','startsAt','endsAt'],users:['role','active','companyIds']};
 const labels={id:'문서 ID / 참가자 UID',name:'기업명',ticker:'종목 코드',category:'분류',description:'기업 소개 (선택)',status:'상장 상태',referencePrice:'초기 기준가격 (가상)',issuedShares:'초기 발행 주식',title:'제목',content:'내용',companyId:'대상 기업',startsAt:'시작 시간',endsAt:'종료 시간',displayName:'참가자 이름',role:'참가자 역할',active:'참가 상태',companyIds:'담당 기업 (최대 5개 선택)'};
 const options={status:[['draft','준비 중'],['listed','상장'],['paused','중지']],role:[['student','학생'],['president','사장']],active:[['true','활성'],['false','비활성']]};
 function form(item={}){
 editing=!!item.id;
 if(kind==='users' && (!editing || item.role==='admin')){document.querySelector('#admin-editor').innerHTML='<p class="info-note">목록에서 학생을 선택하세요. 관리자 계정은 여기서 변경할 수 없습니다.</p>';return;}
 const controls=fields[kind].map(k=>{
 const value=item[k]??(k==='status'?'draft':k==='role'?'student':k==='active'?'true':k==='referencePrice'?10000:k==='issuedShares'?1000:'');
 const disabled=editing&&(k==='id'||kind==='companies'&&['referencePrice','issuedShares'].includes(k));
 const attrs=`name="${k}" ${disabled?'disabled':''}`;
 let control;
 if(kind==='news'&&k==='category')control=`<select ${attrs}>${NEWS_CATEGORIES.map(v=>`<option ${newsCategory(item)===v?'selected':''}>${escape(v)}</option>`).join('')}</select>`;
 else if(k==='companyId')control=`<select ${attrs} ${kind==='events'?'required':''}><option value="">${kind==='events'?'기업 선택':'특정 기업 없음'}</option>${companies.map(c=>`<option value="${escape(c.id)}" ${value===c.id?'selected':''}>${escape(c.name)}</option>`).join('')}</select>`;
 else if(k==='companyIds')control=`<select ${attrs} multiple size="5">${companies.map(c=>`<option value="${escape(c.id)}" ${Array.isArray(value)&&value.includes(c.id)?'selected':''}>${escape(c.name)}</option>`).join('')}</select>`;
 else if(options[k])control=`<select ${attrs}>${options[k].map(([v,l])=>`<option value="${v}" ${String(value)===v?'selected':''}>${l}</option>`).join('')}</select>`;
 else if(['description','content'].includes(k))control=`<textarea ${attrs} ${k==='content'?'required':''} maxlength="${k==='content'?5000:2000}">${escape(value)}</textarea>`;
 else control=`<input ${attrs} value="${escape(Array.isArray(value)?value.join(','):value)}" type="${k.endsWith('At')?'datetime-local':['referencePrice','issuedShares'].includes(k)?'number':'text'}" ${['companyIds','companyId'].includes(k)?'':'required'} maxlength="${k==='title'?120:k==='description'?2000:k==='id'||k==='companyId'?128:80}" ${['referencePrice','issuedShares'].includes(k)?'min="1" max="1000000" step="1"':''}>`;
 return `<label>${k==='companyId'?'관련 기업':labels[k]}${control}</label>`;
 }).join('');
 document.querySelector('#admin-editor').innerHTML=`<form id="admin-form" class="admin-form"><h3>${editing?escape(item.name||item.title||item.displayName)+' · 수정':'새로 등록'}</h3>${kind==='users'?`<p class="info-note admin-student-email"><strong>이메일</strong> ${escape(item.email||'다음 로그인 시 확인됩니다.')}</p>`:''}${kind==='companies'&&!editing?'<p class="info-note">최초 주식 판매대금이 회사 자금으로 들어옵니다.</p>':''}${controls}<button class="account-btn" type="submit">저장</button></form>`;
 document.querySelector('#admin-form').onsubmit=async e=>{
 e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;
 const data=Object.fromEntries(new FormData(e.target));data.id=item.id||crypto.randomUUID();if(kind==='users')data.displayName=item.displayName;
 if(kind==='companies'){data.initial=!editing;if(!editing){data.referencePrice=Number(data.referencePrice);data.issuedShares=Number(data.issuedShares);}}
 if(kind==='users'){data.active=data.active==='true';data.companyIds=new FormData(e.target).getAll('companyIds');}
 if(kind==='events'){data.startsAt=new Date(data.startsAt).toISOString();data.endsAt=new Date(data.endsAt).toISOString();}
 try{await api('/api/admin/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});await load();message('저장했습니다.');window.dispatchEvent(new CustomEvent('admin-saved',{detail:{kind}}));}catch(err){message(err.message);}finally{button.disabled=false;}
 };
 }
 function message(s){document.querySelector('#admin-message').textContent=s;}
 function renderList(){
 const search=kind==='users'?document.querySelector('#admin-user-search').value.trim().toLocaleLowerCase():'';
 const visible=items.map((item,index)=>({item,index})).filter(({item})=>!search||(String(item.displayName||'')+' '+String(item.email||'')).toLocaleLowerCase().includes(search));
 document.querySelector('#admin-user-count').textContent=search?'검색 '+visible.length+'명 / 전체 '+items.length+'명':'전체 '+items.length+'명';
 setHTMLKeepingScroll(document.querySelector('#admin-list'),visible.map(({item:x,index:i})=>`<button class="admin-item" data-item="${i}"><strong>${escape(x.name||x.title||x.displayName)}</strong>${kind==='users'?`<span class="admin-student-email">${escape(x.email||'다음 로그인 시 이메일 확인')}</span>`:''}<small>${escape(kind==='users'?(x.active?'활성':'비활성'):x.ticker||'')} · ${escape(x.role==='president'?'사장':x.role==='student'?'학생':kind==='news'?newsCategory(x):x.status||x.role||x.companyId||'전체')}</small></button>`).join('')||'<p class="muted">'+(search?'검색 결과가 없습니다.':'등록된 항목이 없습니다.')+'</p>');
 }
 async function load(){
 const version=++requestVersion,targetKind=kind;
 host.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
 document.querySelector('#admin-user-tools').hidden=kind!=='users';
 document.querySelector('#admin-list').dataset.users=String(kind==='users');
 const refresh=document.querySelector('#admin-refresh');refresh.disabled=true;refresh.textContent='조회 중…';
 try{
  if(targetKind!=='companies'){const data=await api('/api/admin/companies');if(version!==requestVersion)return;companies=data.companies;}
  if(targetKind==='events'){document.querySelector('#admin-editor').innerHTML='';await showEventAdmin(document.querySelector('#admin-editor'),document.querySelector('#admin-list'),api,companies,message);return;}
  const data=await api('/api/admin/'+targetKind);if(version!==requestVersion)return;
  document.querySelector('#admin-list').onclick=null;items=data[targetKind];renderList();form();
 }catch(err){if(version===requestVersion)message(err.message);}
 finally{if(version===requestVersion){refresh.disabled=false;refresh.textContent='새로 조회';}}
 }
 host.innerHTML=`<div class="admin-tabs">${[['companies','기업'],['news','뉴스·공지'],['events','기업 이벤트'],['users','참가자']].map(([k,l])=>`<button class="account-btn" data-kind="${k}">${l}</button>`).join('')}<button class="ghost" id="admin-refresh">새로 조회</button></div><div id="admin-user-tools" class="admin-user-tools" hidden><input id="admin-user-search" type="search" placeholder="이름 또는 이메일 검색" aria-label="참가자 이름 또는 이메일 검색"><span id="admin-user-count" role="status"></span></div><p role="status" id="admin-message"></p><div class="admin-workspace"><section id="admin-list"></section><section id="admin-editor"></section></div>`;
 host.onclick=async e=>{const tab=e.target.closest('[data-kind]'),row=e.target.closest('[data-item]');if(tab){kind=tab.dataset.kind;message('');await load();}if(row){const version=requestVersion,item={...items[Number(row.dataset.item)]};if(kind==='users'){try{item.companyIds=(await api('/api/admin/users?id='+encodeURIComponent(item.id))).companyIds;if(version!==requestVersion)return;}catch(err){message(err.message);return;}}for(const k of ['startsAt','endsAt'])if(item[k]){const d=new Date(item[k]);item[k]=new Date(d.valueOf()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}form(item);}};
 document.querySelector('#admin-user-search').addEventListener('input',renderList);
 document.querySelector('#admin-refresh').onclick=load;
 return {session(user){nav.hidden=user?.role!=='admin';if(user?.role==='admin')load();else{requestVersion++;items=[];document.querySelector('#admin-user-search').value='';document.querySelector('#admin-user-count').textContent='';document.querySelector('#admin-user-tools').hidden=true;document.querySelector('#admin-refresh').disabled=false;document.querySelector('#admin-refresh').textContent='새로 조회';document.querySelector('#admin-list').innerHTML='';document.querySelector('#admin-editor').innerHTML='';message('관리자 계정으로 로그인하세요.');}}};
}

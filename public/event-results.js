import {effectText} from '../client/event-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderEventResults(summary){
 if(!summary?.groups?.length)return '';
 return `<section class="event-news-results" aria-label="이벤트 결과"><h2>${summary.type==='choice'?'선택지별 기업·적용 결과':'대상 기업·적용 결과'}</h2>${summary.groups.map((g,i)=>`<section class="event-news-group"><h3>${summary.type==='choice'?i+1+'. ':''}${esc(g.label)}</h3><p class="event-news-effect">${esc(effectText(g.effect))}</p>${g.companies.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="스크롤 가능한 표"><table><thead><tr><th>기업</th><th>받은 영향</th><th>상태</th></tr></thead><tbody>${g.companies.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(effectText(g.effect,c.result))}</td><td>${c.status==='applied'?'적용 완료':'적용 대기'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">이 선택지를 선택한 기업이 없습니다.</p>'}</section>`).join('')}${summary.unselected.length?`<p class="event-news-unselected"><strong>미선택 기업</strong> ${summary.unselected.map(esc).join(' · ')}<br><small>선택하지 않은 기업에는 선택 효과를 적용하지 않습니다.</small></p>`:''}</section>`;
}

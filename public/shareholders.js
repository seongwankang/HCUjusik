const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0).toLocaleString('ko-KR');
export function shareholderMarkup(data,error){
 if(error)return '<p class="inline-warning">주주 명부를 불러오지 못했습니다. 새로고침으로 다시 확인해 주세요.</p>';
 if(!data)return '<p class="placeholder">주주 명부를 집계 중입니다. 자동 집계가 완료되면 표시됩니다.</p>';
 const pending=data.pending?'<p class="compact-note" role="status">최근 체결 반영 중 · 주주별 수량은 직전 집계 기준</p>':'';
 const rows=data.entries||[],issued=data.issuedShares,ratio=q=>issued>0?(q/issued*100).toLocaleString('ko-KR',{maximumFractionDigits:2})+'%':'—';
 return pending+'<div class="business-section-heading"><h2>주주 명부</h2><span>'+rows.length+'명</span></div><p class="compact-note">집계 '+esc(new Date(data.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+' · 매도 대기 주식 포함</p><div class="portfolio-table-wrap" tabindex="0" role="region" aria-label="우리 회사 주주 명부"><table><thead><tr><th>주주</th><th>보유 수량</th><th>지분율</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+n(r.quantity)+'주</td><td>'+ratio(r.quantity)+'</td></tr>').join('')+(data.treasuryShares?'<tr><td>회사 보유 · 미판매</td><td>'+n(data.treasuryShares)+'주</td><td>'+ratio(data.treasuryShares)+'</td></tr>':'')+(!rows.length&&!data.treasuryShares?'<tr><td colspan="3">현재 보유 주주가 없습니다.</td></tr>':'')+'</tbody></table></div>';
}

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v).toLocaleString('ko-KR');
export function pendingBuyMarkup(rows=[]){
 if(!rows.length)return '';
 return '<div class="panel-title"><h3>매수 대기</h3><span>아직 체결되지 않은 주문</span></div><div class="trade-table-wrap" tabindex="0" role="region" aria-label="매수 대기 주식"><table class="portfolio-table"><thead><tr><th>종목</th><th>지정가</th><th>대기 수량</th><th>매수 예약금</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.ticker)+'</small></td><td>'+n(r.price)+'원</td><td>'+n(r.quantity)+'주</td><td>'+n(r.reservedAmount)+'원</td><td><button class="row-button" data-company="'+esc(r.companyId)+'">주문 보기 ↗</button></td></tr>').join('')+'</tbody></table></div>';
}

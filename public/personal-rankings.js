const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=v=>Number(v||0).toLocaleString('ko-KR')+'원';
export const PERSONAL_RANKINGS={totalValue:'총순위',cash:'보유 현금',stockValue:'주식 평가액'};
export function personalRankingRows(board,key){return board?.[key==='cash'?'cashEntries':key==='stockValue'?'stockEntries':'entries']||[];}
export function personalRankingMarkup(board,key){
 const rows=personalRankingRows(board,key);
 return '<table><thead><tr><th>순위</th><th>참가자</th><th>'+(key==='totalValue'?'순위 산정액':PERSONAL_RANKINGS[key])+'</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><b>'+r.rank+'</b></td><td>'+(r.investorKey?'<button type="button" class="investor-name" data-investor="'+esc(r.investorKey)+'">'+esc(r.name)+' <span>↗</span></button>':esc(r.name))+'</td><td><strong>'+won(r[key])+'</strong></td></tr>').join('')+(rows.length?'':'<tr><td colspan="3" class="table-empty">해당 순위를 집계 중입니다.</td></tr>')+'</tbody></table>';
}

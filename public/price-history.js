const number=n=>Number(n).toLocaleString('ko-KR');
// The API exposes only the viewer's fills, not a market-wide price history.
export function priceHistory(fills){
 const points=fills.filter(f=>Number.isFinite(f.price)&&f.price>0).slice(0,30).reverse();
 if(!points.length)return '<div class="chart-empty"><span aria-hidden="true">⌁</span><strong>첫 체결을 기다리고 있어요</strong><p>주문이 체결되면 나의 체결 가격이 여기에 표시됩니다.</p></div>';
 const prices=points.map(f=>f.price),lo=Math.min(...prices),hi=Math.max(...prices),pad=Math.max((hi-lo)*.18,lo*.01,1),min=lo-pad,max=hi+pad;
 const x=i=>32+(points.length===1?264:i/(points.length-1)*528),y=p=>22+(max-p)/(max-min)*174;
 const coordinates=points.map((p,i)=>`${x(i)},${y(p.price)}`).join(' ');
 return `<svg class="price-chart" viewBox="0 0 660 238" role="img" aria-label="나의 최근 ${points.length}건 체결 가격. 최저 ${number(lo)}원, 최고 ${number(hi)}원. 전체 시장 차트가 아닙니다.">${[0,1,2,3].map(i=>{const p=max-(max-min)*i/3;return `<line x1="20" x2="568" y1="${y(p)}" y2="${y(p)}" stroke="currentColor"/><text x="580" y="${y(p)+4}">${number(Math.round(p))}</text>`}).join('')}<polygon points="${x(0)},205 ${coordinates} ${x(points.length-1)},205" fill="#7863dc" opacity=".07"/><polyline points="${coordinates}" fill="none" stroke="#7863dc" stroke-width="2.5" stroke-linejoin="round"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.price)}" r="${points.length===1?5:3}" fill="#7863dc"><title>${i+1}번째 체결 · ${number(p.price)}원</title></circle>`).join('')}<text x="24" y="230">이전 체결</text><text x="505" y="230">최근 체결</text></svg><div class="chart-range"><span>최저 <b>${number(lo)}원</b></span><span>최고 <b>${number(hi)}원</b></span><span>${points.length}건 · 체결 순</span></div>`;
}

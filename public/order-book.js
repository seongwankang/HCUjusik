import {withinPriceLimits} from '../client/daily-price-limits.js';
import {PRICE_TICK,orderPrice,validOrderPrice} from '../client/price-tick.js';
const number=n=>n.toLocaleString('ko-KR');
export function orderBookRows(book,currentPrice,limits){
 const asks=new Map(),bids=new Map();
 for(const [levels,map] of [[book.asks,asks],[book.bids,bids]])for(const {price,quantity} of levels||[])if(Number.isSafeInteger(price)&&price>0&&Number.isSafeInteger(quantity)&&quantity>0)map.set(price,(map.get(price)||0)+quantity);
 const anchor=orderPrice(currentPrice),prices=new Set([...asks.keys(),...bids.keys()]);
 for(let i=-2;i<=2;i++){const p=anchor+i*PRICE_TICK;if(validOrderPrice(p))prices.add(p);}
 return [...prices].sort((a,b)=>b-a).map(price=>({price,asks:asks.get(price)||0,bids:bids.get(price)||0,tradable:validOrderPrice(price)&&(!limits||withinPriceLimits(price,limits))}));
}
export function renderOrderBook(book,currentPrice,selectedPrice,limits){
 const rows=orderBookRows(book,currentPrice,limits),max=Math.max(1,...rows.flatMap(r=>[r.asks,r.bids]));
 const quantity=(r,side)=>{const q=r[side],action=side==='asks'?'매수':'매도';return `<button type="button" class="market-quantity ${side}" data-limit-price="${r.price}" data-limit-side="${side==='asks'?'buy':'sell'}" aria-label="${number(r.price)}원 ${side==='asks'?'매도':'매수'} 대기 ${number(q)}주 · 이 가격으로 ${action}" ${r.tradable?'':'disabled'}><span class="market-depth-bar" style="width:${q/max*100}%"></span><strong>${q?number(q):'—'}</strong><small>${action} ↗</small></button>`;};
 return `<div class="transfer-book-heading"><span class="ask-label">판매 대기 수량</span><span>가격 <small>100원 단위</small></span><span class="bid-label">구매 대기 수량</span></div><div class="transfer-book-rows">${rows.map(r=>`<div class="transfer-book-row" data-price="${r.price}" data-selected="${r.price===Number(selectedPrice)}">${quantity(r,'asks')}<button type="button" class="market-price" data-limit-price="${r.price}" ${r.tradable?'':'disabled'} aria-label="주문 가격 ${number(r.price)}원 선택"><strong>${number(r.price)}</strong>${!r.tradable?`<small>${validOrderPrice(r.price)?'가격 범위 밖':'이전 주문 단위'}</small>`:r.price===currentPrice?'<small>현재가</small>':''}</button>${quantity(r,'bids')}</div>`).join('')}</div><div class="transfer-book-total"><span>판매 대기 <b>${number(rows.reduce((n,r)=>n+r.asks,0))}주</b></span><span>구매 대기 <b>${number(rows.reduce((n,r)=>n+r.bids,0))}주</b></span></div>`;
}

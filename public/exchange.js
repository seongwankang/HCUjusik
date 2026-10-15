const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';
let generation=0;
export function closeTrading(){generation++;}
export async function showTrading(c,request){
 const token=++generation,box=document.querySelector('#test-trade');
 if(!['test-a','test-b'].includes(c.id)){box.textContent='현재 지정가 테스트는 두 테스트 기업만 지원합니다.';return;}
 box.innerHTML=`<h3>지정가 주문장</h3><p class="info-note">별도 가상 자금 100만 원 · 최초 물량 선착순 · 가격/시간 우선 · 종목당 대기 주문 최대 4건</p><p id="limit-status" role="status">Firebase 주문장을 확인하는 중…</p><div id="limit-book"></div><form id="limit-form"><label>주문 구분 <select name="side"><option value="buy">매수</option><option value="sell">매도</option></select></label><label>지정가격(원) <input name="price" type="number" value="${Number(c.referencePrice)}" min="1" max="1000000" step="1" required></label><label>수량(주) <input name="quantity" type="number" value="1" min="1" max="1000000" step="1" required></label><p id="limit-total"></p><button type="submit" id="limit-submit" disabled>지정가 주문 접수</button></form><button type="button" id="limit-refresh">호가·체결 새로고침</button><div id="limit-orders"></div><div id="limit-fills"></div><p class="info-note">호가는 새로고침 시 갱신됩니다. 반대 주문이 없으면 미체결로 대기하며, 남은 수량은 취소할 수 있습니다. 자기 주문끼리는 체결되지 않습니다.</p>`;
 const form=box.querySelector('form'),status=box.querySelector('#limit-status'),button=box.querySelector('#limit-submit');
 const controls=[...form.querySelectorAll('input,select')];let pending=null,busy=false,connected=false,lastMatchError=null;
 const alive=()=>token===generation;
 const lock=()=>{button.disabled=busy||!connected;controls.forEach(e=>e.disabled=busy||!!pending);box.querySelector('#limit-refresh').disabled=busy;};
 const total=()=>{box.querySelector('#limit-total').textContent=`주문금액 ${won(Number(form.elements.price.value)*Number(form.elements.quantity.value))}`;};controls.forEach(e=>e.addEventListener('input',total));total();
 async function refresh(){
  const data=await request('/api/exchange?companyId='+c.id);if(!alive())return;
  const a=data.account;lastMatchError=data.matchError;
  box.querySelector('#limit-book').innerHTML=`<p>주문 가능 현금 <strong>${won(a.cash-a.reservedCash)}</strong> / 예약 ${won(a.reservedCash)} · 매도 가능 <strong>${(a.positions[c.id]||0)-(a.reservedPositions[c.id]||0)}주</strong></p><p>최근 체결가 ${data.market?.lastPrice?won(data.market.lastPrice):'체결 전'} · 초기 판매 잔여 ${data.market?.treasuryShares??c.issuedShares}주</p><div class="order-depth">${['asks','bids'].map((side)=>`<section><h4>${side==='asks'?'매도 호가 (낮은 가격 우선)':'매수 호가 (높은 가격 우선)'}</h4>${data.book[side].map(x=>`<div class="asset-row"><strong>${won(x.price)}</strong><span>${x.quantity}주</span></div>`).join('')||'<p>대기 주문 없음</p>'}</section>`).join('')}</div>`;
  box.querySelector('#limit-orders').innerHTML=`<h4>내 미체결 · 최근 주문 내역</h4>${data.orders.map(o=>`<div class="asset-row"><span>${esc(o.companyId)} ${o.side==='buy'?'매수':'매도'} · ${won(o.price)} × ${o.quantity}주<br>체결 ${o.filled} / 미체결 ${o.remaining} / 취소 ${o.cancelled}</span>${o.status==='open'?`<button type="button" data-cancel-order="${esc(o.orderId)}" data-company-id="${esc(o.companyId)}">잔량 취소</button>`:`<span>${o.status==='filled'?'체결 완료':'취소 완료'}</span>`}</div>`).join('')||'<p>주문이 없습니다.</p>'}`;
  box.querySelector('#limit-fills').innerHTML=`<h4>내 최근 체결 30건</h4>${data.fills.map(f=>`<div class="asset-row"><span>${esc(f.companyId)} ${f.side==='buy'?'매수':'매도'} ${f.quantity}주</span><strong>${won(f.price)}</strong></div>`).join('')||'<p>체결 내역이 없습니다.</p>'}`;
  if(data.adminOrders?.length)box.querySelector('#limit-orders').insertAdjacentHTML('beforeend',`<h4>관리자 · 이 종목 전체 대기 주문</h4>${data.adminOrders.map(o=>`<div class="asset-row"><span>${o.side==='buy'?'매수':'매도'} ${won(o.price)} · ${o.remaining}주</span><button type="button" data-cancel-order="${esc(o.id)}" data-owner-uid="${esc(o.uid)}" data-company-id="${esc(c.id)}">관리자 취소</button></div>`).join('')}`);
  connected=true;lock();
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!connected)return;
  if(!pending)pending={orderId:crypto.randomUUID(),companyId:c.id,side:form.elements.side.value,price:Number(form.elements.price.value),quantity:Number(form.elements.quantity.value)};
  busy=true;lock();
  try{const result=await request('/api/limit-order',{method:'POST',body:JSON.stringify(pending)});if(!alive())return;pending=null;button.textContent='지정가 주문 접수';status.textContent=`주문 ${result.duplicate?'기존 접수 확인':'접수 완료'} · 체결 ${result.order.filled}주 / 대기 ${result.order.remaining}주`;await refresh();}
  catch(error){if(!alive())return;status.textContent=error.message;if(error.status&&error.status<500){pending=null;button.textContent='지정가 주문 접수';}else button.textContent='같은 주문 다시 확인';}
  finally{busy=false;if(alive())lock();}
 });
 box.addEventListener('click',async e=>{
  const cancel=e.target.closest('[data-cancel-order]');if(!cancel||busy)return;busy=true;lock();cancel.disabled=true;
  try{await request('/api/cancel-order',{method:'POST',body:JSON.stringify({orderId:cancel.dataset.cancelOrder,companyId:cancel.dataset.companyId,...(cancel.dataset.ownerUid?{ownerUid:cancel.dataset.ownerUid}:{})})});if(!alive())return;status.textContent='남은 주문을 취소하고 예약 자산을 반환했습니다.';await refresh();}catch(error){if(alive())status.textContent=error.code==='permission-denied'?'최신 Firestore 거래 규칙 게시와 계정 권한을 확인하세요.':error.message;}
  finally{busy=false;if(alive()){cancel.disabled=false;lock();}}
 });
 box.querySelector('#limit-refresh').addEventListener('click',async()=>{if(busy)return;busy=true;lock();try{await refresh();if(alive())status.textContent=lastMatchError||'호가와 체결 내역을 갱신했습니다.';}catch(e){if(alive())status.textContent=e.message;}finally{busy=false;if(alive())lock();}});
 try{await refresh();if(alive())status.textContent=lastMatchError||'지정가 주문 가능 · 접수 순서는 Firestore 확정 순서로 결정됩니다.';}catch(error){if(alive())status.textContent=error.code==='permission-denied'?'최신 Firestore 거래 규칙을 게시한 뒤 다시 열어 주세요.':error.message;}
}

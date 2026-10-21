const won=n=>Number(n).toLocaleString('ko-KR')+'원';
export function priceLimitsMarkup(p){
 if(!p)return '<span class="price-limit-pending">상·하한가 확인 중…</span>';
 return `<span class="price-limit-lower">하한가<strong>${won(p.lower)}</strong></span><span>상·하한 기준가<strong>${won(p.referencePrice)}</strong></span><span class="price-limit-upper">상한가<strong>${won(p.upper)}</strong></span>`;
}

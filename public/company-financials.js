import {revenueFormula} from './revenue-formula.js';
import {revenueEffectBadges} from './revenue-effects.js';
const amount=n=>Number.isSafeInteger(n)?n.toLocaleString('ko-KR')+'원':'—';
export function companyFinancialsMarkup(data){
 return `<div><span>회사 예상 일매출</span><div class="revenue-value"><strong>${amount(data?.tomorrowRevenue)}</strong><span class="revenue-effects">${revenueEffectBadges(data?.revenueEffects||[])}</span></div>${revenueFormula(data)}</div><div><span>회사 보유 현금</span><strong>${amount(data?.companyCash)}</strong></div>`;
}

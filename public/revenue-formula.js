const number=n=>n.toLocaleString('ko-KR');
export function revenueFormula(data,effects=data?.revenueEffects||[]){
 if(!data||!['salePrice','productionCost','productionPower'].every(key=>Number.isSafeInteger(data[key])&&data[key]>=0))return '';
 const percent=effects.filter(e=>e.kind==='revenue'&&Number.isFinite(e.percent)).reduce((sum,e)=>sum+e.percent,0);
 return `<small class="revenue-formula" aria-label="예상 일매출 계산식">(${number(data.salePrice)}원 − ${number(data.productionCost)}원) × ${number(data.productionPower)}개${percent?' × '+number(Math.max(0,100+percent))+'%':''}</small>`;
}

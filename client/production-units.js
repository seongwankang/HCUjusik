// Economic inputs are inventory quantities. Historical money-yield fields are never read.
export const UNITS_MODEL='units-v2';
export const ASSET_KEYS=['factory','employee','equipment','research'];
export const emptyUnits=()=>({factory:0,employee:0,equipment:0,research:0});
export const totalUnits=(o,k)=>o[k==='employee'?'employees':k]||0;
export const pendingUnits=o=>({...emptyUnits(),...o.pendingUnits});
export const unitCapacity=o=>Math.min(1000,10+totalUnits(o,'factory')*25);
export function matureUnits(o,day){return o.pendingDay<=day?emptyUnits():pendingUnits(o);}
export function unitsEconomy(o,day,records=[],active=()=>false){
 const pending=matureUnits(o,day),n=Object.fromEntries(ASSET_KEYS.map(k=>[k,Math.max(0,totalUnits(o,k)-pending[k])]));
 let factoryFactor=1,equipmentFactor=1,researchFactor=1,percent=0;
 for(const r of records)if(active(r)){const e=r.effect;if(e.kind==='revenue')percent+=e.percent;if(e.kind==='efficiency'){if(e.asset==='factory')factoryFactor+=e.percent/100;if(e.asset==='equipment')equipmentFactor+=e.percent/100;if(e.asset==='research')researchFactor+=e.percent/100;}}
 const capacity=Math.min(1000,10+Math.floor(n.factory*25*Math.max(0,factoryFactor))),supported=Math.min(n.employee,capacity);
 const salePrice=1000+Math.floor(n.research*10*Math.max(0,researchFactor));
 const productionCost=Math.max(1,Math.ceil(600*Math.pow(.95,n.equipment*Math.max(0,equipmentFactor))));
 const productionPower=supported*120,operatingIncome=(salePrice-productionCost)*productionPower;
 const revenue=Math.max(0,operatingIncome+Math.trunc(operatingIncome*percent/100));
 if(!Number.isSafeInteger(revenue)||revenue>1e12)throw Error('이벤트 적용 수익 한도를 초과합니다.');
 return {base:operatingIncome,revenue,salePrice,productionCost,productionPower,operatingIncome,supported,capacity,boostBps:0};
}
export function unitPurchase(o,asset,day,quantity=1){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000||asset!=='employee'&&quantity!==1)throw Error('채용 인원을 1~1,000명의 정수로 입력하세요.');
 const pending=pendingUnits(o),field=asset==='employee'?'employees':asset;
 if(ASSET_KEYS.some(k=>pending[k]>0)&&o.pendingDay<day)throw Error('이전 정산을 완료한 뒤 투자하세요.');
 if(totalUnits(o,asset)+quantity>1000)throw Error('보유 수량 한도에 도달했습니다.');
 if(asset==='employee'&&totalUnits(o,asset)+quantity>unitCapacity(o))throw Error('직원 정원이 부족합니다. 공장을 추가하세요.');
 return {[field]:totalUnits(o,asset)+quantity,pendingDay:day,pendingUnits:{...pending,[asset]:pending[asset]+quantity}};
}
export function unitLoss(o,asset,count){
 const pending=pendingUnits(o),lost=Math.min(totalUnits(o,asset),count),field=asset==='employee'?'employees':asset;
 return {[field]:totalUnits(o,asset)-lost,pendingUnits:{...pending,[asset]:Math.max(0,pending[asset]-lost)}};
}

// Explicit empty selections must never fall back to a global event.
export function eventTargets(input,companyIds){
 let targets;
 if(input.type==='choice')targets=[...companyIds];
 else if(Object.hasOwn(input,'companyIds')){
  if(!Array.isArray(input.companyIds)||!input.companyIds.length||input.companyIds.length>100)throw new Error('대상 기업을 한 곳 이상 선택하세요.');
  targets=[...new Set(input.companyIds)];
 }else targets=input.companyId?[input.companyId]:[...companyIds];
 if(!targets.length||targets.length>100||targets.some(id=>typeof id!=='string'||!companyIds.includes(id)))throw new Error('대상 기업을 확인하세요.');
 return targets;
}

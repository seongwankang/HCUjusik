export const DEFAULT_SPY_POLICY=Object.freeze({cost:1000000,bps:400,settlements:0});
export const SPY_LOSS_BPS=1000;
export function spyPolicy(value){
 const p=value||DEFAULT_SPY_POLICY;
 if(Object.keys(p).length!==3||!Number.isSafeInteger(p.cost)||p.cost!==1000000||!Number.isInteger(p.bps)||p.bps!==400||!Number.isInteger(p.settlements)||p.settlements!==0)throw Error('스파이 정책: 1명당 고용비 100만 원, 비율 4%, 기간 제한 없음');
 return {cost:p.cost,bps:p.bps,settlements:p.settlements};
}
// All amounts use immutable ordinary revenue, before any spy transfers.
// Proportional allocation with deterministic largest remainders conserves every won.
export function spyTransfers(contracts,companies){
 const grouped=new Map();for(const s of contracts){const key=s.companyId+'\0'+s.targetId,old=grouped.get(key);grouped.set(key,{...s,bps:(old?.bps||0)+s.bps});}contracts=[...grouped.values()];
 const entries=Object.fromEntries(Object.entries(companies).map(([id,c])=>[id,{companyId:id,baseRevenue:c.revenue,stolen:0,lost:0,net:0}])),transfers=[];
 for(const target of [...new Set(contracts.map(s=>s.targetId))].sort()){
  const c=companies[target];if(!c)continue;
  const requests=contracts.filter(s=>s.targetId===target&&s.companyId!==target&&companies[s.companyId]).sort((a,b)=>a.companyId.localeCompare(b.companyId)||(a.hireId||'').localeCompare(b.hireId||'')).map(s=>({...s,requested:Number(BigInt(c.revenue)*BigInt(s.bps)/10000n)}));
  const total=requests.reduce((n,s)=>n+BigInt(s.requested),0n),budget=BigInt(Math.min(Math.max(0,c.cash),Math.floor(c.revenue*SPY_LOSS_BPS/10000))),available=total<budget?total:budget;
  if(!total){for(const s of requests)transfers.push({companyId:s.companyId,targetId:target,amount:0});continue;}
  const allocated=requests.map(s=>({...s,amount:Number(BigInt(s.requested)*available/total),remainder:BigInt(s.requested)*available%total}));
  let remainder=Number(available)-allocated.reduce((n,s)=>n+s.amount,0);
  allocated.sort((a,b)=>a.remainder===b.remainder?a.companyId.localeCompare(b.companyId)||(a.hireId||'').localeCompare(b.hireId||''):a.remainder>b.remainder?-1:1);
  for(const s of allocated){if(remainder>0){s.amount++;remainder--;}transfers.push({companyId:s.companyId,targetId:target,amount:s.amount});entries[s.companyId].stolen+=s.amount;entries[target].lost+=s.amount;}
 }
 for(const e of Object.values(entries))e.net=e.stolen-e.lost;
 return {entries:Object.values(entries).sort((a,b)=>a.companyId.localeCompare(b.companyId)||(a.hireId||'').localeCompare(b.hireId||'')),transfers};
}

export const MAX_SPIES=2;
export function effectiveSpyPolicy(p){return spyPolicy(DEFAULT_SPY_POLICY);}
// Keep paid legacy agents; active contracts become permanent at the revised rate.
export function spyAgents(s){if(!s)return {};const {id,...legacy}=s;return s.agents||{0:legacy};}
export function activeSpies(s){return Object.values(spyAgents(s)).filter(a=>a.remaining>0);}

export function activeSpyEntries(s){return Object.entries(spyAgents(s)).filter(([,a])=>a.remaining>0).sort((a,b)=>(a[1].createdAt?.seconds||0)-(b[1].createdAt?.seconds||0)||(a[1].createdAt?.nanoseconds||0)-(b[1].createdAt?.nanoseconds||0)||String(a[1].hireId).localeCompare(String(b[1].hireId))||a[0].localeCompare(b[0]));}
export function oldestActiveSpy(s){return activeSpyEntries(s)[0];}

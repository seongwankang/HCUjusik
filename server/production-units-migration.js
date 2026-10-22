import {UNITS_MODEL,emptyUnits,totalUnits,ASSET_KEYS} from '../client/production-units.js';
import {newOperations} from '../client/economy.js';
import {publishDividendForecast} from '../client/dividend-rounds.js';
import {nextSettlement} from '../client/settlement-time.js';
export function migratedUnits(o,investments,effects){
 const pending=emptyUnits(),rows=[...investments.filter(r=>r.activeFromDay>o.lastSettledDay).map(r=>({...r,type:'buy',at:r.createdAt.toMillis()})),...effects.map(r=>({...r,type:'effect',at:r.appliedAt.toMillis()}))].sort((a,b)=>a.at-b.at);
 for(const r of rows){if(r.type==='buy')pending[r.asset]+=r.quantity;else if(r.effect.kind==='destroy'){const k=r.effect.asset;pending[k]=Math.max(0,pending[k]-(r.result?.count??r.effect.count));}else if(r.effect.kind==='workforce'&&r.effect.count<0)pending.employee=Math.max(0,pending.employee+Math.min(0,r.result?.count??r.effect.count));}
 for(const k of ASSET_KEYS)pending[k]=Math.min(pending[k],totalUnits(o,k));
 return pending;
}
export async function migrateProductionUnits(db,{now=Date.now()}={}){
 const companies=await db.collection('companies').get();let updated=0;
 for(const c of companies.docs){const changed=await db.runTransaction(async t=>{
  if((await t.get(db.doc('systemMaintenance/reset'))).exists)throw Error('Maintenance in progress');
  const ref=db.doc('companyOperations/'+c.id),s=await t.get(ref),o=s.data();
  if(o?.productionModel===UNITS_MODEL)return false;if(o?.locked)throw Error('Finish settlement before production migration');
  if(!o){t.set(ref,newOperations(now));return true;}
  const [investments,effects]=await Promise.all([t.get(ref.collection('investments')),t.get(db.collection('companyEffects').doc(c.id).collection('items'))]);
  const pendingUnits=migratedUnits(o,investments.docs.map(s=>s.data()),effects.docs.map(s=>s.data()));
  const inventoryLossAt={};for(const s of effects.docs){const r=s.data(),k=r.effect.kind==='destroy'?r.effect.asset:r.effect.kind==='workforce'&&r.effect.count<0?'employee':null;if(k&&(!inventoryLossAt[k]||inventoryLossAt[k].toMillis()<r.appliedAt.toMillis()))inventoryLossAt[k]=r.appliedAt;}
  t.update(ref,{productionModel:UNITS_MODEL,pendingUnits,inventoryLossAt,revenue:0,pendingRevenue:0,production:{factory:0,equipment:0,research:0},pendingProduction:{factory:0,equipment:0,research:0},staffRevenue:0,pendingStaffRevenue:0,activeResearchBps:0,pendingResearchBps:0});return true;
 });if(changed)updated++;}
 await publishDividendForecast(db,nextSettlement({},now).day);
 const snapshots=await Promise.all(companies.docs.map(c=>db.doc('companyOperations/'+c.id).get()));
 if(snapshots.some(s=>s.data()?.productionModel!==UNITS_MODEL))throw Error('Production model verification failed');
 return {companies:companies.size,updated,verified:snapshots.length,model:UNITS_MODEL};
}

import {refreshShareholders} from '../server/shareholder-refresh.js';
import {issueAdditionalShares} from '../server/additional-offering.js';
import {randomBytes,createCipheriv,publicEncrypt} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {correctSignupCapital} from '../server/signup-capital-correction.js';
import {migrateProductionUnits} from '../server/production-units-migration.js';
import {migrateRankedDividends} from '../server/ranked-dividend-migration.js';
import {rankingValue} from '../client/ranking-value.js';
import {marketPaused} from '../client/market-session.js';
import {closeMarket} from '../server/manual-market-close.js';
import {fundCompanyStartup} from '../server/company-startup-capital.js';
import {publishDailyPriceLimits,limitSession} from '../server/daily-price-limits.js';
import {resetPreservingPresidents} from '../server/preserve-presidents-reset.js';
import {reverseAccidentalTrade} from '../server/accidental-trade-correction.js';
import {increaseInitialCapital} from '../server/initial-capital-migration.js';
import {correctStartupSettlement,releaseCorrectionReservations} from '../server/settlement-correction.js';
import {publishRecoveryEvent} from '../server/recovery-event.js';
import {publishCashRankings} from '../client/rankings.js';
import {resetMarket} from '../server/market-reset.js';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {runScheduledEconomy} from '../server/scheduled-economy.js';
const projectId=process.env.FIREBASE_PROJECT_ID;
if(!projectId)throw Error('FIREBASE_PROJECT_ID is required');
if(process.env.FIRESTORE_EMULATOR_HOST&&(!projectId.startsWith('demo-')||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)))throw Error('Emulator requires a loopback demo project');
const app=initializeApp({projectId,...(!process.env.FIRESTORE_EMULATOR_HOST?{credential:applicationDefault()}:{})});
if(process.env.ECONOMY_JOB_MODE==='additional-offering-200'){const db=getFirestore(app),result=await issueAdditionalShares(db);await publishCashRankings(db);console.log(JSON.stringify({additionalOffering:result,rankingsUpdated:true}));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='signup-capital-correction'){
 const policy=JSON.parse(readFileSync('ops/signup-capital-correction-2026-10-22.json','utf8')),db=getFirestore(app);
 if(policy.auditOnly===true){
  const since=Date.parse('2026-10-22T08:00:00+09:00'),until=Date.parse('2026-10-23T00:00:00+09:00'),users=await db.collection('users').get(),previous=(await db.doc('capitalAdjustments/signup-overgrant-2026-10-22').get()).data();
  const profiles=users.docs.filter(u=>['student','president'].includes(u.data().role)&&u.createTime.toMillis()>=since&&u.createTime.toMillis()<until),rows=await Promise.all(profiles.map(async u=>{const [p,r]=await Promise.all([db.doc('portfolios/'+u.id).get(),db.doc('capitalAdjustments/signup-overgrant-2026-10-22/users/'+u.id).get()]);return {created:u.createTime.toMillis(),initial:p.data()?.initialCapital,corrected:r.exists};}));
  const last=previous?.completedAt?.toMillis()??0,newer=rows.filter(r=>r.created>last);
  console.log(JSON.stringify({signupFundingAudit:{users:users.size,participantsSince08:rows.length,initialOneMillion:rows.filter(r=>r.initial===1000000).length,initialTwoMillion:rows.filter(r=>r.initial===2000000).length,unknownInitial:rows.filter(r=>![1000000,2000000].includes(r.initial)).length,correctedReceipts:rows.filter(r=>r.corrected).length,unrecoveredTwoMillion:rows.filter(r=>r.initial===2000000&&!r.corrected).length,joinedAfterLastCorrection:newer.length,newOneMillion:newer.filter(r=>r.initial===1000000).length,newTwoMillion:newer.filter(r=>r.initial===2000000).length,checkedAt:new Date().toISOString()}}));process.exit(0);
 }
 const excluded=[];const result=await correctSignupCapital(db,{apply:policy.apply===true,allowOverdraft:policy.allowOverdraft===true,onExcluded:row=>excluded.push(row)});if(policy.apply===true)await publishCashRankings(db);
 let encryptedExcludedReport=null;
 if(policy.reportPublicKey){const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(JSON.stringify(excluded),'utf8'),cipher.final()]);encryptedExcludedReport={key:publicEncrypt({key:policy.reportPublicKey,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};}
 // Public logs contain aggregate totals and encrypted bytes only. The decryption
 // key remains local and is never sent to GitHub or Firebase.
 console.log(JSON.stringify({signupCapitalCorrection:result,encryptedExcludedReport}));process.exit(0);
}
if(process.env.ECONOMY_JOB_MODE==='production-units-migrate'){console.log(JSON.stringify(await migrateProductionUnits(getFirestore(app))));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='ranked-dividends-migrate'){console.log(JSON.stringify(await migrateRankedDividends(getFirestore(app))));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='offering-audit'){
 const db=getFirestore(app),[companies,books]=await Promise.all([db.collection('companies').get(),db.collection('sparkBooks').get()]),map=new Map(books.docs.map(s=>[s.id,s.data()]));
 const rows=companies.docs.map(s=>({company:s.data(),book:map.get(s.id)}));
 console.log(JSON.stringify({offeringAudit:{companies:rows.length,listed:rows.filter(r=>r.company.status==='listed').length,books:books.size,matchingInitialOfferings:rows.filter(r=>r.company.referencePrice===10000&&r.company.issuedShares===1000&&r.book?.initialPrice===10000&&r.book?.issuedShares===1000).length,unsoldCompanies:rows.filter(r=>r.book?.treasuryShares===1000).length,remainingShares:rows.reduce((n,r)=>n+(r.book?.treasuryShares||0),0),missingBooks:rows.filter(r=>!r.book).length}}));process.exit(0);
}
if(process.env.ECONOMY_JOB_MODE==='market-close'){console.log(JSON.stringify(await closeMarket(getFirestore(app))));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='production-economy-initialize'){
 const db=getFirestore(app),result=await fundCompanyStartup(db);
 console.log(JSON.stringify({startupCapital:result,amountPerCompany:10000000}));process.exit(0);
}
if(process.env.ECONOMY_JOB_MODE==='price-limits-initialize'){
 const db=getFirestore(app),now=Date.now();if(marketPaused(now)){console.log(JSON.stringify(await closeMarket(db)));process.exit(0);}
 const result=await publishDailyPriceLimits(db,{now}),day=limitSession(now).day;
 const books=await db.collection('sparkBooks').get(),limits=books.docs.map(s=>{const b=s.data();return b.priceLimits?.day===day?b.priceLimits:b.nextPriceLimits;}).filter(p=>p?.day===day);
 console.log(JSON.stringify({priceLimits:result,verifiedCompanies:limits.length,referencePrices:[...new Set(limits.map(p=>p.referencePrice))],lowerPrices:[...new Set(limits.map(p=>p.lower))],upperPrices:[...new Set(limits.map(p=>p.upper))]}));process.exit(0);
}
if(process.env.ECONOMY_JOB_MODE==='reverse-admin-meme-2026-10-21'){const db=getFirestore(app),result=await reverseAccidentalTrade(db);await publishCashRankings(db);console.log(JSON.stringify(result));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='correct-startup-settlement-2026-10-21'){const db=getFirestore(app);const result=await correctStartupSettlement(db);const reservations=await releaseCorrectionReservations(db);await publishCashRankings(db);console.log(JSON.stringify({...result,reservations}));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='recovery-event-2026-10-21'){console.log(JSON.stringify(await publishRecoveryEvent(getFirestore(app))));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='reset-preserve-presidents-2026-10-22'){console.log(JSON.stringify(await resetPreservingPresidents(getFirestore(app),{publish:publishCashRankings,skipBackup:true})));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='reset-2026-10-21'){console.log(JSON.stringify(await resetMarket(getFirestore(app))));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='initial-capital-2000000'){
 const db=getFirestore(app),result=await increaseInitialCapital(db);await publishCashRankings(db);console.log(JSON.stringify({capitalMigration:result,rankingsUpdated:true}));process.exit(0);
}
if(['shareholders-only','events-only','full','rankings-only'].includes(process.env.ECONOMY_JOB_MODE||'full')){const result=await refreshShareholders(getFirestore(app));console.log(JSON.stringify({shareholders:result}));if(process.env.ECONOMY_JOB_MODE==='shareholders-only')process.exit(0);}
const result=await runScheduledEconomy(getFirestore(app),{mode:process.env.ECONOMY_JOB_MODE||'full'});
// Public Actions logs contain counts only, never student names/cash/credentials.
console.log(JSON.stringify({settled:result.settled,resumed:result.resumed,skipped:result.skipped,failedCount:result.failed.length,choiceEvents:result.choiceEvents,spyDetection:result.spyDetection?.status,rankingsUpdated:result.rankingsUpdated}));
if(result.failed.length||result.choiceEvents.failed)throw Error('Some companies need settlement recovery; inspect company status in the administrator page.');

if(process.env.ECONOMY_JOB_MODE==='rankings-only'){
 const board=(await getFirestore(app).doc('leaderboards/cash').get()).data();
 if(!board?.entries?.every(r=>r.totalValue===rankingValue(r.cash,r.stockValue)))throw Error('Ranking weight verification failed');
 console.log(JSON.stringify({rankingsVerified:board.entries.length,stockWeightPercent:80}));
}

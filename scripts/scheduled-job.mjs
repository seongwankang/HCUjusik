import {increaseInitialCapital} from '../server/initial-capital-migration.js';
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
if(process.env.ECONOMY_JOB_MODE==='recovery-event-2026-10-21'){console.log(JSON.stringify(await publishRecoveryEvent(getFirestore(app))));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='reset-2026-10-21'){console.log(JSON.stringify(await resetMarket(getFirestore(app))));process.exit(0);}
if(process.env.ECONOMY_JOB_MODE==='initial-capital-2000000'){
 const db=getFirestore(app),result=await increaseInitialCapital(db);await publishCashRankings(db);console.log(JSON.stringify({capitalMigration:result,rankingsUpdated:true}));process.exit(0);
}
const result=await runScheduledEconomy(getFirestore(app),{mode:process.env.ECONOMY_JOB_MODE||'full'});
// Public Actions logs contain counts only, never student names/cash/credentials.
console.log(JSON.stringify({settled:result.settled,resumed:result.resumed,skipped:result.skipped,failedCount:result.failed.length,choiceEvents:result.choiceEvents,spyDetection:result.spyDetection?.status,rankingsUpdated:result.rankingsUpdated}));
if(result.failed.length||result.choiceEvents.failed)throw Error('Some companies need settlement recovery; inspect company status in the administrator page.');

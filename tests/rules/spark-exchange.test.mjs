import {removeIndexes} from '../../client/order-index.js';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,getDocs,collection,writeBatch,increment,serverTimestamp,query,orderBy,limit,deleteDoc} from 'firebase/firestore';
import {initializeSpark,placeSpark,matchSpark,cancelSpark,sparkView} from '../../client/spark-exchange.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw new Error('Loopback emulator required');
let env,a,b,c,admin;
const claims={email:'test@hcu.hs.kr',email_verified:true};
const order=(id,extra={})=>({orderId:id,companyId:'test-a',side:'buy',price:10000,quantity:1,...extra});
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-spark-limit',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();for(const uid of ['a','b','c','operator','inactive'])await setDoc(doc(db,'users',uid),{displayName:uid,active:uid!=='inactive',role:uid==='operator'?'admin':'student'});for(const id of ['test-a','test-b'])await setDoc(doc(db,'companies',id),{status:'listed',referencePrice:10000,issuedShares:100});});
 a=env.authenticatedContext('a',claims).firestore();b=env.authenticatedContext('b',claims).firestore();c=env.authenticatedContext('c',claims).firestore();admin=env.authenticatedContext('operator',claims).firestore();
 await initializeSpark(a,'a','test-a');await initializeSpark(b,'b','test-a');await initializeSpark(c,'c','test-a');
});
after(async()=>env?.cleanup());
test('first-come issuance, partial fill and immutable initial supply',async()=>{
 await placeSpark(a,'a',order('primary-first',{quantity:70,price:11000}));await matchSpark(a,'a','test-a');
 let asset=(await getDoc(doc(a,'sparkAccounts/a'))).data();assert.equal(asset.cash,1300000);assert.equal(asset.positions['test-a'],70);assert.equal(asset.reservedCash,0);
 await placeSpark(b,'b',order('primary-second',{quantity:40}));await matchSpark(b,'b','test-a');
 asset=(await getDoc(doc(b,'sparkAccounts/b'))).data();assert.equal(asset.cash,1700000);assert.equal(asset.positions['test-a'],30);assert.equal(asset.reservedCash,100000);
 assert.equal((await getDoc(doc(a,'sparkBooks/test-a'))).data().treasuryShares,0);
 await cancelSpark(b,'b',{companyId:'test-a',orderId:'primary-second'});
 await assertFails(updateDoc(doc(a,'sparkBooks/test-a'),{treasuryShares:100}));
});
test('market history includes other students while private fills stay private',async()=>{
 const q=query(collection(c,'sparkBooks/test-a/trades'),orderBy('marketVersion','desc'),limit(100));
 const trades=await getDocs(q);assert.equal(trades.size,2);
 assert.deepEqual(trades.docs.map(d=>d.data().quantity),[30,70]);
 for(const d of trades.docs){assert.deepEqual(Object.keys(d.data()).sort(),['companyId','createdAt','marketVersion','price','quantity']);assert.equal(d.data().price,10000);}
 await assertFails(getDocs(query(collection(c,'sparkAccounts/a/fills'),limit(30))));
 const view=await sparkView(c,'c','test-a','student');assert.equal(view.fills.length,0);assert.equal(view.marketTrades.length,2);assert.equal(view.marketHistoryAvailable,true);
});
test('public prints reject edits, deletes, unbounded queries and unauthenticated reads',async()=>{
 const trades=await getDocs(query(collection(c,'sparkBooks/test-a/trades'),limit(100))),ref=trades.docs[0].ref;
 await assertFails(updateDoc(ref,{price:1}));await assertFails(deleteDoc(ref));
 await assertFails(setDoc(doc(c,'sparkBooks/test-a/trades/fake-print'),{companyId:'test-a',price:1,quantity:1,marketVersion:1,createdAt:serverTimestamp()}));
 await assertFails(getDocs(collection(c,'sparkBooks/test-a/trades')));
 await assertFails(getDocs(query(collection(c,'sparkBooks/test-a/trades'),limit(101))));
 const anon=env.unauthenticatedContext().firestore();await assertFails(getDocs(query(collection(anon,'sparkBooks/test-a/trades'),limit(100))));
});
test('secondary price/time matching and private counterparty assets',async()=>{
 await assertFails(getDoc(doc(a,'sparkAccounts/b')));
 await placeSpark(a,'a',order('sell-first',{side:'sell',price:12000,quantity:5}));
 await placeSpark(c,'c',order('buy-third',{price:13000,quantity:2}));
 assert.equal(await matchSpark(admin,'operator','test-a'),true);
 const buyer=(await getDoc(doc(c,'sparkAccounts/c'))).data(),seller=(await getDoc(doc(a,'sparkAccounts/a'))).data();
 assert.equal(buyer.cash,1976000);assert.equal(buyer.reservedCash,0);assert.equal(buyer.positions['test-a'],2);assert.equal(seller.positions['test-a'],68);assert.equal(seller.reservedPositions['test-a'],3);
 await cancelSpark(a,'a',{companyId:'test-a',orderId:'sell-first'});assert.equal((await getDoc(doc(a,'sparkAccounts/a'))).data().reservedPositions['test-a'],0);
 await assertFails(getDocs(collection(a,'sparkAccounts/c/fills')));
});
async function forgeFill(db,buy,sell,{price=sell.price,quantity=Math.min(buy.remaining,sell.remaining),bonus=0,skipSeller=false,skipFill=false,skipOrder=false,skipPublic=false,publicPatch={}}={}){
 const ref=doc(db,'sparkBooks/test-a'),book=(await getDoc(ref)).data(),version=book.version+1,id=crypto.randomUUID();
 const orders=book.orders.filter(o=>!(o.uid===buy.uid&&o.id===buy.id)&&!(o.uid===sell.uid&&o.id===sell.id));
 for(const o of [buy,sell])if(o.remaining>quantity)orders.push({...o,remaining:o.remaining-quantity});
 const batch=writeBatch(db);if(!skipPublic)batch.set(doc(db,'sparkBooks/test-a/trades',id),{companyId:'test-a',price,quantity,marketVersion:version,createdAt:serverTimestamp(),...publicPatch});batch.update(ref,{...removeIndexes(book,[buy,sell].filter(o=>o.id!=='issuer'&&o.remaining===quantity)),orders,version,updatedAt:serverTimestamp(),lastPrice:price,lastAction:{kind:'fill',actor:'c',buy,sell,fillId:id}});
 batch.update(doc(db,'sparkAccounts',buy.uid),{cash:increment(-price*quantity+bonus),reservedCash:increment(-buy.price*quantity),['positions.test-a']:increment(quantity),version:increment(1),lastMarket:'test-a'});
 if(!skipSeller)batch.update(doc(db,'sparkAccounts',sell.uid),{cash:increment(price*quantity),['positions.test-a']:increment(-quantity),['reservedPositions.test-a']:increment(-quantity),version:increment(1),lastMarket:'test-a'});
 for(const [o,side]of [[buy,'buy'],[sell,'sell']]){
  if(!skipOrder)batch.update(doc(db,'sparkAccounts',o.uid,'orders',o.id),{remaining:o.remaining-quantity,filled:o.quantity-o.remaining+quantity,status:o.remaining===quantity?'filled':'open',marketVersion:version});
  if(!skipFill)batch.set(doc(db,'sparkAccounts',o.uid,'fills',id),{companyId:'test-a',price,quantity,side,marketVersion:version,createdAt:serverTimestamp()});
 }
 return batch.commit();
}
test('fully forged settlement cannot bypass best bid, resting price or atomic counterparty writes',async()=>{
 await placeSpark(a,'a',order('attack-sell',{side:'sell',price:12000,quantity:2}));
 await placeSpark(b,'b',order('attack-low',{price:13000,quantity:2}));
 await placeSpark(c,'c',order('attack-best',{price:14000,quantity:1}));
 let book=(await getDoc(doc(c,'sparkBooks/test-a'))).data();
 const sell=book.orders.find(o=>o.id==='attack-sell'),low=book.orders.find(o=>o.id==='attack-low'),best=book.orders.find(o=>o.id==='attack-best');
 await assertFails(forgeFill(c,low,sell));
 for(const options of [{price:13000},{quantity:2},{bonus:1},{skipSeller:true},{skipFill:true},{skipOrder:true},{skipPublic:true},{publicPatch:{price:1}},{publicPatch:{uid:"c"}}])await assertFails(forgeFill(c,best,sell,options));
 assert.equal(await matchSpark(c,'c','test-a'),true);assert.equal(await matchSpark(c,'c','test-a'),true);
 assert.equal((await getDoc(doc(c,'sparkBooks/test-a'))).data().treasuryShares,0);
 book=(await getDoc(doc(admin,'sparkBooks/test-a'))).data();for(const o of book.orders)await cancelSpark(admin,'operator',{companyId:'test-a',ownerUid:o.uid,orderId:o.id});
});
test('idempotent orders, concurrent reservations and cancellation',async()=>{
 const x=order('replay-order',{price:9000,quantity:2});await placeSpark(c,'c',x);assert.equal((await placeSpark(c,'c',x)).duplicate,true);
 await assert.rejects(placeSpark(c,'c',{...x,quantity:3}),/내용/);
 await cancelSpark(c,'c',{companyId:'test-a',orderId:x.orderId});await cancelSpark(c,'c',{companyId:'test-a',orderId:x.orderId});
 const results=await Promise.allSettled([placeSpark(c,'c',order('parallel-one',{price:9000,quantity:120})),placeSpark(c,'c',order('parallel-two',{price:9000,quantity:120}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const asset=(await getDoc(doc(c,'sparkAccounts/c'))).data();assert.equal(asset.reservedCash,1080000);assert.ok(asset.reservedCash<=asset.cash);
 const id=results[0].status==='fulfilled'?'parallel-one':'parallel-two';await cancelSpark(c,'c',{companyId:'test-a',orderId:id});
});
test('direct asset fabrication, forged book-only orders, foreign cancellation and unauthorized reads fail',async()=>{
 await assertFails(updateDoc(doc(a,'sparkAccounts/a'),{cash:1000000}));
 await assertFails(updateDoc(doc(a,'sparkAccounts/b'),{cash:1000000}));
 await placeSpark(a,'a',order('cancel-private',{side:'sell',price:12000,quantity:1}));
 await assertFails(cancelSpark(b,'b',{ownerUid:'a',companyId:'test-a',orderId:'cancel-private'}));
 await cancelSpark(admin,'operator',{ownerUid:'a',companyId:'test-a',orderId:'cancel-private'});
 const old=(await getDoc(doc(a,'sparkBooks/test-a'))).data();
 await assertFails(updateDoc(doc(a,'sparkBooks/test-a'),{orders:[],version:old.version+1,lastAction:{kind:'place',actor:'a',entry:{uid:'a',id:'forged-order',side:'buy',price:1,quantity:100,remaining:100,sequence:old.version+1}},updatedAt:serverTimestamp()}));
 const inactive=env.authenticatedContext('inactive',claims).firestore();await assertFails(initializeSpark(inactive,'inactive','test-a'));
 const unverified=env.authenticatedContext('a',{...claims,email_verified:false}).firestore();await assertFails(getDoc(doc(unverified,'sparkBooks/test-a')));
});
test('full four-entry book still enforces best price and completes peer settlement',async()=>{
 for(let i=0;i<2;i++)await placeSpark(b,'b',order('depth-bid-'+i,{price:9000,quantity:1}));
 await placeSpark(c,'c',order('depth-best',{price:13000,quantity:1}));
 await placeSpark(a,'a',order('depth-sell',{side:'sell',price:12000,quantity:1}));
 assert.equal((await getDoc(doc(a,'sparkBooks/test-a'))).data().orders.length,4);
 assert.equal(await matchSpark(c,'c','test-a'),true);
 assert.equal((await getDoc(doc(c,'sparkAccounts/c/orders/depth-best'))).data().status,'filled');
 const book=(await getDoc(doc(admin,'sparkBooks/test-a'))).data();for(const o of book.orders)await cancelSpark(admin,'operator',{companyId:'test-a',ownerUid:o.uid,orderId:o.id});
});
test('initial shares use eligible first arrival even when a later buyer bids higher',async()=>{
 await initializeSpark(a,'a','test-b');await initializeSpark(b,'b','test-b');
 await placeSpark(a,'a',order('initial-low-first',{companyId:'test-b',quantity:2,price:10000}));
 await placeSpark(b,'b',order('initial-high-next',{companyId:'test-b',quantity:2,price:12000}));
 await matchSpark(b,'b','test-b');
 assert.equal((await getDoc(doc(a,'sparkAccounts/a/orders/initial-low-first'))).data().status,'filled');
 assert.equal((await getDoc(doc(b,'sparkAccounts/b/orders/initial-high-next'))).data().status,'open');
 await matchSpark(a,'a','test-b');
});
test('ordinary student uses the same direct Firebase trade API without backend configuration',async()=>{
 const {createClientApi}=await import('../../client/data.js');
 const api=createClientApi({db:a,getUser:async()=>({uid:'a',getIdTokenResult:async()=>({claims})})});
 const view=await api('/api/exchange?companyId=test-b');assert.equal(view.mode,'spark-limit-v1');
 await assert.rejects(api('/api/limit-order',{method:'POST',body:JSON.stringify(order('invalid-tick-api',{companyId:'test-b',price:9999}))}),/100원 단위/);
 await initializeSpark(c,'c','test-b');const bookRef=doc(c,'sparkBooks/test-b'),book=(await getDoc(bookRef)).data(),seq=book.version+1,id='invalid-tick-raw';
 const entry={uid:'c',id,side:'buy',price:9999,quantity:1,remaining:1,sequence:seq},raw=writeBatch(c);
 raw.update(bookRef,{orders:[...book.orders,entry],version:seq,lastAction:{kind:'place',actor:'c',entry},updatedAt:serverTimestamp()});
 raw.update(doc(c,'sparkAccounts/c'),{reservedCash:increment(9999),version:increment(1),lastMarket:'test-b'});
 raw.set(doc(c,'sparkAccounts/c/orders',id),{companyId:'test-b',orderId:id,uid:'c',side:'buy',price:9999,quantity:1,sequence:seq,remaining:1,filled:0,cancelled:0,status:'open',createdAt:serverTimestamp(),marketVersion:seq});
 await assertFails(raw.commit());
 const placed=await api('/api/limit-order',{method:'POST',body:JSON.stringify(order('student-api-order',{companyId:'test-b',price:9900}))});
 assert.equal(placed.order.status,'open');
 await api('/api/cancel-order',{method:'POST',body:JSON.stringify({companyId:'test-b',orderId:'student-api-order'})});
 assert.equal((await getDoc(doc(a,'sparkAccounts/a/orders/student-api-order'))).data().status,'cancelled');
});

// Production can still have the previous rules while the new bundle deploys.
test('rules rollout preserves old trading and activates mandatory market history',async()=>{
 const current=readFileSync('firestore.rules','utf8');
 const legacyFill=`    function sparkFill(uid,id) {
      let d=request.resource.data;
      let before=sparkBefore(d.companyId);
      let book=sparkAfter(d.companyId);
      let a=book.lastAction;
      return sparkId(d.companyId) && book.version == before.version+1 && a.kind == 'fill' && a.fillId == id &&
        ((uid == a.buy.uid && d.side == 'buy') || (a.sell.id != 'issuer' && uid == a.sell.uid && d.side == 'sell')) &&
        d == {'companyId':d.companyId,'price':fillPrice(a),'quantity':fillQuantity(a),'side':d.side,'marketVersion':book.version,'createdAt':request.time};
    }
`;
 const legacy=current.replace(/    function sparkFill[\s\S]*?(?=    function publicTrade)/,()=>legacyFill).replace(/    function publicTrade[\s\S]*?(?=    function manager)/,'');
 assert.notEqual(legacy,current);assert.ok(!legacy.includes('function publicTrade'));
 const projectId='demo-history-rollout';
 const old=await initializeTestEnvironment({projectId,firestore:{rules:legacy}});let upgraded;
 try{
  await old.clearFirestore();await old.withSecurityRulesDisabled(async c=>{const db=c.firestore();await setDoc(doc(db,'users/rollout'),{displayName:'synthetic',active:true,role:'student'});await setDoc(doc(db,'companies/test-a'),{status:'listed',referencePrice:10000,issuedShares:100});});
  const db=old.authenticatedContext('rollout',claims).firestore();const {createClientApi}=await import('../../client/data.js');
  const api=createClientApi({db,getUser:async()=>({uid:'rollout',getIdTokenResult:async()=>({claims})})});
  await api('/api/limit-order',{method:'POST',body:JSON.stringify(order('rollout-before'))});
  let v=await api('/api/exchange?companyId=test-a');assert.equal(v.account.positions['test-a'],1);assert.equal(v.marketHistoryAvailable,false);assert.deepEqual(v.marketTrades,[]);
  upgraded=await initializeTestEnvironment({projectId,firestore:{rules:current}});
  await placeSpark(db,'rollout',order('rollout-after'));
  await assertFails(matchSpark(db,'rollout','test-a',{recordPublic:false}));
  assert.equal((await getDoc(doc(db,'sparkAccounts/rollout'))).data().positions['test-a'],1);
  await matchSpark(db,'rollout','test-a');
  v=await api('/api/exchange?companyId=test-a');assert.equal(v.marketHistoryAvailable,true);assert.equal(v.marketTrades.length,1);assert.equal(v.account.positions['test-a'],2);
 }finally{await old.cleanup();await upgraded?.cleanup();}
});

test('portfolio reflects executed trades, reservations and cancellation from the trading account',async()=>{
 const {createClientApi}=await import('../../client/data.js');
 const api=createClientApi({db:a,getUser:async()=>({uid:'a',getIdTokenResult:async()=>({claims})})});
 const before=await api('/api/trading-portfolio'),q=before.holdings.find(h=>h.companyId==='test-b')?.quantity||0;
 await api('/api/limit-order',{method:'POST',body:JSON.stringify(order('portfolio-buy',{companyId:'test-b',quantity:2}))});
 let p=await api('/api/trading-portfolio?uid=b');assert.equal(p.cash,before.cash-20000);assert.equal(p.holdings.find(h=>h.companyId==='test-b').quantity,q+2);
 const bookVersion=(await getDoc(doc(a,'sparkBooks/test-b'))).data().version;await api('/api/trading-portfolio');assert.equal((await getDoc(doc(a,'sparkBooks/test-b'))).data().version,bookVersion);
 await api('/api/limit-order',{method:'POST',body:JSON.stringify(order('portfolio-reserve',{companyId:'test-b',price:9000}))});
 p=await api('/api/trading-portfolio');assert.equal(p.cash,before.cash-20000);assert.equal(p.reservedCash,9000);assert.equal(p.availableCash,p.cash-9000);
 await api('/api/cancel-order',{method:'POST',body:JSON.stringify({companyId:'test-b',orderId:'portfolio-reserve'})});
 p=await api('/api/trading-portfolio');assert.equal(p.reservedCash,0);assert.equal(p.availableCash,p.cash);
 await api('/api/limit-order',{method:'POST',body:JSON.stringify(order('portfolio-sell',{companyId:'test-b',side:'sell',price:12000}))});
 p=await api('/api/trading-portfolio');const h=p.holdings.find(h=>h.companyId==='test-b');assert.equal(h.quantity,q+2);assert.equal(h.reserved,1);assert.equal(h.available,q+1);
 await api('/api/cancel-order',{method:'POST',body:JSON.stringify({companyId:'test-b',orderId:'portfolio-sell'})});
});

test('administrator-created company IDs trade, settle and appear in assets without a test allowlist',async()=>{
 const cid='6fc6b11c-1c84-4718-bdc9-742fba2f539e';
 await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),'companies',cid),{name:'Synthetic new company',ticker:'NEW',status:'listed',referencePrice:2500,issuedShares:20}));
 await initializeSpark(a,'a',cid);await initializeSpark(b,'b',cid);
 await placeSpark(a,'a',order('new-company-buy',{companyId:cid,quantity:3,price:2500}));await matchSpark(a,'a',cid);
 assert.equal((await getDoc(doc(a,'sparkAccounts/a'))).data().positions[cid],3);
 await placeSpark(a,'a',order('new-company-sell',{companyId:cid,side:'sell',quantity:1,price:2400}));
 await placeSpark(b,'b',order('new-company-peer',{companyId:cid,quantity:1,price:2400}));await matchSpark(b,'b',cid);
 assert.equal((await getDoc(doc(b,'sparkAccounts/b'))).data().positions[cid],1);
 const {createClientApi}=await import('../../client/data.js');const api=createClientApi({db:b,getUser:async()=>({uid:'b',getIdTokenResult:async()=>({claims})})});
 assert.equal((await api('/api/trading-portfolio')).holdings.find(h=>h.companyId===cid).quantity,1);
 await assertFails(updateDoc(doc(b,'sparkAccounts/b'),{['positions.unrelated']:999}));
 await assert.rejects(initializeSpark(a,'a','missing-company'),/거래 가능한 기업/);
 await env.withSecurityRulesDisabled(async context=>updateDoc(doc(context.firestore(),'companies',cid),{status:'paused'}));
 await assertFails(placeSpark(a,'a',order('new-company-paused',{companyId:cid,price:2400})));
});


test('two ordinary accounts match in both directions with an initialized operating company',async()=>{
 const cid='two-account-company';
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'companies',cid),{status:'listed',referencePrice:10000,issuedShares:10});await setDoc(doc(db,'companyOperations',cid),{locked:false});});
 const {createClientApi}=await import('../../client/data.js');
 const apiA=createClientApi({db:a,getUser:async()=>({uid:'a',getIdTokenResult:async()=>({claims})})});
 const apiB=createClientApi({db:b,getUser:async()=>({uid:'b',getIdTokenResult:async()=>({claims})})});
 const submit=(api,id,side,price,quantity=1)=>api('/api/limit-order',{method:'POST',body:JSON.stringify({companyId:cid,orderId:id,side,price,quantity})});
 await submit(apiA,'two-account-issue','buy',10000,10);
 assert.equal((await apiA('/api/exchange?companyId='+cid)).account.positions[cid],10);
 await submit(apiA,'two-account-ask','sell',12000,2);
 const bought=await submit(apiB,'two-account-take-ask','buy',12000);
 assert.equal(bought.matchPending,undefined);assert.equal(bought.order.filled,1);
 await apiA('/api/cancel-order',{method:'POST',body:JSON.stringify({companyId:cid,orderId:'two-account-ask'})});
 await submit(apiB,'two-account-bid','buy',11000,2);
 const sold=await submit(apiA,'two-account-take-bid','sell',11000);
 assert.equal(sold.matchPending,undefined);assert.equal(sold.order.filled,1);
});

test('initialized company with four entries can settle as an ordinary counterparty',async()=>{
 const cid='two-account-company';
 await placeSpark(a,'a',{companyId:cid,orderId:'ops-depth-ask-one',side:'sell',price:13100,quantity:1});
 await placeSpark(a,'a',{companyId:cid,orderId:'ops-depth-ask-two',side:'sell',price:14000,quantity:1});
 await placeSpark(b,'b',{companyId:cid,orderId:'ops-depth-take-ask',side:'buy',price:13100,quantity:1});
 assert.equal((await getDoc(doc(a,'sparkBooks',cid))).data().orders.length,4);
 assert.equal(await matchSpark(b,'b',cid),true);
});

test('more than four resting orders accept both crossing and non-crossing orders',async()=>{
 const cid='full-taker-slot';
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'companies',cid),{status:'listed',referencePrice:10000,issuedShares:10});await setDoc(doc(db,'companyOperations',cid),{locked:false});});
 await initializeSpark(a,'a',cid);await initializeSpark(b,'b',cid);
 await placeSpark(a,'a',{companyId:cid,orderId:'slot-issuance-buy',side:'buy',price:10000,quantity:10});await matchSpark(a,'a',cid);
 for(let i=0;i<4;i++)await placeSpark(a,'a',{companyId:cid,orderId:'slot-sell-'+i,side:'sell',price:11000+i*100,quantity:1});
 await placeSpark(b,'b',{companyId:cid,orderId:'slot-non-crossing',side:'buy',price:10000,quantity:1});assert.equal((await getDoc(doc(b,'sparkBooks',cid))).data().orders.length,5);await cancelSpark(b,'b',{companyId:cid,orderId:'slot-non-crossing'});
 const rawPlace=async(id,price)=>{
  const ref=doc(b,'sparkBooks',cid),old=(await getDoc(ref)).data(),v=old.version+1;
  const entry={uid:'b',id,side:'buy',price,quantity:1,remaining:1,sequence:v},batch=writeBatch(b);
  batch.update(ref,{orders:[...old.orders,entry],version:v,lastAction:{kind:'place',actor:'b',entry},updatedAt:serverTimestamp()});
  batch.update(doc(b,'sparkAccounts/b'),{reservedCash:increment(price),version:increment(1),lastMarket:cid});
  batch.set(doc(b,'sparkAccounts/b/orders',id),{companyId:cid,orderId:id,uid:'b',side:'buy',price,quantity:1,sequence:v,remaining:1,filled:0,cancelled:0,status:'open',createdAt:serverTimestamp(),marketVersion:v});
  return batch.commit();
 };
 // Raw writes without their priority-index update are rejected at any depth.
 await assertFails(rawPlace('slot-forged-resting',10000));
 await placeSpark(b,'b',{companyId:cid,orderId:'slot-crossing-buy',side:'buy',price:11000,quantity:1});
 assert.equal((await getDoc(doc(b,'sparkBooks',cid))).data().orders.length,5);
 await assertFails(rawPlace('slot-forged-sixth',11000));
 assert.equal(await matchSpark(b,'b',cid),true);
 assert.equal((await getDoc(doc(b,'sparkAccounts/b/orders/slot-crossing-buy'))).data().filled,1);
 // Mirror case: four bids must also accept a crossing seller.
 let book=(await getDoc(doc(admin,'sparkBooks',cid))).data();for(const o of book.orders)await cancelSpark(admin,'operator',{companyId:cid,ownerUid:o.uid,orderId:o.id});
 for(let i=0;i<4;i++)await placeSpark(b,'b',{companyId:cid,orderId:'slot-bid-'+i,side:'buy',price:9000+i*100,quantity:1});
 await placeSpark(a,'a',{companyId:cid,orderId:'slot-crossing-sell',side:'sell',price:9000,quantity:1});
 assert.equal(await matchSpark(a,'a',cid),true);
 assert.equal((await getDoc(doc(a,'sparkAccounts/a/orders/slot-crossing-sell'))).data().filled,1);
});


test('10200 same-price cross settles with operations and a deep order book',async()=>{
 const cid='memtrion-cross-regression';
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await setDoc(doc(db,'companies',cid),{status:'listed',referencePrice:10000,issuedShares:20});await setDoc(doc(db,'companyOperations',cid),{locked:false});});
 await initializeSpark(a,'a',cid);await initializeSpark(b,'b',cid);
 await placeSpark(b,'b',{companyId:cid,orderId:'mem-issue-stock',side:'buy',price:10000,quantity:20});assert.equal(await matchSpark(b,'b',cid),true);
 for(let i=0;i<12;i++){
  await placeSpark(a,'a',{companyId:cid,orderId:'mem-deep-bid-'+i,side:'buy',price:9000-i*100,quantity:1});
  await placeSpark(b,'b',{companyId:cid,orderId:'mem-deep-ask-'+i,side:'sell',price:20000+i*100,quantity:1});
 }
 await placeSpark(b,'b',{companyId:cid,orderId:'mem-sell-10200',side:'sell',price:10200,quantity:3});
 await placeSpark(a,'a',{companyId:cid,orderId:'mem-buy-10200',side:'buy',price:10200,quantity:3});
 assert.equal(await matchSpark(a,'a',cid),true);
 assert.equal((await getDoc(doc(a,'sparkAccounts/a/orders/mem-buy-10200'))).data().filled,3);
 assert.equal((await getDoc(doc(b,'sparkAccounts/b/orders/mem-sell-10200'))).data().filled,3);
 assert.equal((await getDoc(doc(a,'sparkBooks',cid))).data().lastPrice,10200);
});

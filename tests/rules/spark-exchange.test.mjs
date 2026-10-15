import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,getDocs,collection,writeBatch,increment,serverTimestamp} from 'firebase/firestore';
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
 let asset=(await getDoc(doc(a,'sparkAccounts/a'))).data();assert.equal(asset.cash,300000);assert.equal(asset.positions['test-a'],70);assert.equal(asset.reservedCash,0);
 await placeSpark(b,'b',order('primary-second',{quantity:40}));await matchSpark(b,'b','test-a');
 asset=(await getDoc(doc(b,'sparkAccounts/b'))).data();assert.equal(asset.cash,700000);assert.equal(asset.positions['test-a'],30);assert.equal(asset.reservedCash,100000);
 assert.equal((await getDoc(doc(a,'sparkBooks/test-a'))).data().treasuryShares,0);
 await cancelSpark(b,'b',{companyId:'test-a',orderId:'primary-second'});
 await assertFails(updateDoc(doc(a,'sparkBooks/test-a'),{treasuryShares:100}));
});
test('secondary price/time matching and private counterparty assets',async()=>{
 await assertFails(getDoc(doc(a,'sparkAccounts/b')));
 await placeSpark(a,'a',order('sell-first',{side:'sell',price:12000,quantity:5}));
 await placeSpark(c,'c',order('buy-third',{price:13000,quantity:2}));
 assert.equal(await matchSpark(admin,'operator','test-a'),true);
 const buyer=(await getDoc(doc(c,'sparkAccounts/c'))).data(),seller=(await getDoc(doc(a,'sparkAccounts/a'))).data();
 assert.equal(buyer.cash,976000);assert.equal(buyer.reservedCash,0);assert.equal(buyer.positions['test-a'],2);assert.equal(seller.positions['test-a'],68);assert.equal(seller.reservedPositions['test-a'],3);
 await cancelSpark(a,'a',{companyId:'test-a',orderId:'sell-first'});assert.equal((await getDoc(doc(a,'sparkAccounts/a'))).data().reservedPositions['test-a'],0);
 await assertFails(getDocs(collection(a,'sparkAccounts/c/fills')));
});
async function forgeFill(db,buy,sell,{price=sell.price,quantity=Math.min(buy.remaining,sell.remaining),bonus=0,skipSeller=false,skipFill=false,skipOrder=false}={}){
 const ref=doc(db,'sparkBooks/test-a'),book=(await getDoc(ref)).data(),version=book.version+1,id=crypto.randomUUID();
 const orders=book.orders.filter(o=>!(o.uid===buy.uid&&o.id===buy.id)&&!(o.uid===sell.uid&&o.id===sell.id));
 for(const o of [buy,sell])if(o.remaining>quantity)orders.push({...o,remaining:o.remaining-quantity});
 const batch=writeBatch(db);batch.update(ref,{orders,version,updatedAt:serverTimestamp(),lastPrice:price,lastAction:{kind:'fill',actor:'c',buy,sell,fillId:id}});
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
 for(const options of [{price:13000},{quantity:2},{bonus:1},{skipSeller:true},{skipFill:true},{skipOrder:true}])await assertFails(forgeFill(c,best,sell,options));
 assert.equal(await matchSpark(c,'c','test-a'),true);assert.equal(await matchSpark(c,'c','test-a'),true);
 assert.equal((await getDoc(doc(c,'sparkBooks/test-a'))).data().treasuryShares,0);
 book=(await getDoc(doc(admin,'sparkBooks/test-a'))).data();for(const o of book.orders)await cancelSpark(admin,'operator',{companyId:'test-a',ownerUid:o.uid,orderId:o.id});
});
test('idempotent orders, concurrent reservations and cancellation',async()=>{
 const x=order('replay-order',{price:9000,quantity:2});await placeSpark(c,'c',x);assert.equal((await placeSpark(c,'c',x)).duplicate,true);
 await assert.rejects(placeSpark(c,'c',{...x,quantity:3}),/내용/);
 await cancelSpark(c,'c',{companyId:'test-a',orderId:x.orderId});await cancelSpark(c,'c',{companyId:'test-a',orderId:x.orderId});
 const results=await Promise.allSettled([placeSpark(c,'c',order('parallel-one',{price:9000,quantity:60})),placeSpark(c,'c',order('parallel-two',{price:9000,quantity:60}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const asset=(await getDoc(doc(c,'sparkAccounts/c'))).data();assert.equal(asset.reservedCash,540000);assert.ok(asset.reservedCash<=asset.cash);
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
 const placed=await api('/api/limit-order',{method:'POST',body:JSON.stringify(order('student-api-order',{companyId:'test-b',price:9999}))});
 assert.equal(placed.order.status,'open');
 await api('/api/cancel-order',{method:'POST',body:JSON.stringify({companyId:'test-b',orderId:'student-api-order'})});
 assert.equal((await getDoc(doc(a,'sparkAccounts/a/orders/student-api-order'))).data().status,'cancelled');
});

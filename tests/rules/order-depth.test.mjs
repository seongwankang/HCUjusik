import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';import {doc,setDoc,getDoc,updateDoc,writeBatch,increment,serverTimestamp} from 'firebase/firestore';
import {initializeSpark,placeSpark,matchSpark,cancelSpark,sparkView} from '../../client/spark-exchange.js';import {emptyIndexes,insertIndexes,removeIndexes} from '../../client/order-index.js';
if(!/^127[.]0[.]0[.]1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,a,b,c;const claims={email:'synthetic@hcu.hs.kr',email_verified:true};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-order-depth',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{for(const uid of ['a','b','c'])await setDoc(doc(ctx.firestore(),'users',uid),{displayName:uid,role:'student',active:true});for(const cid of ['deep','legacy'])await setDoc(doc(ctx.firestore(),'companies',cid),{name:cid,status:'listed',referencePrice:10000,issuedShares:1000});});a=env.authenticatedContext('a',claims).firestore();b=env.authenticatedContext('b',claims).firestore();c=env.authenticatedContext('c',claims).firestore();for(const cid of ['deep','legacy'])for(const [uid,db] of [['a',a],['b',b],['c',c]])await initializeSpark(db,uid,cid);await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await updateDoc(doc(db,'sparkBooks/deep'),{treasuryShares:0,issuerCash:10000000});await updateDoc(doc(db,'sparkAccounts/a'),{positions:{deep:1000}});});});after(async()=>env?.cleanup());
const order=(cid,id,side,price,quantity=1)=>({companyId:cid,orderId:id,side,price,quantity});
const read=async(cid='deep')=>(await getDoc(doc(a,'sparkBooks',cid))).data();
async function rawPlace(id,price,{wrongPriority=false,omitOwner=false}={}){const book=await read(),entry={uid:'b',id,side:'buy',price,quantity:1,remaining:1,sequence:book.version+1},{patch,proof}=insertIndexes(book,entry);if(wrongPriority){patch.bidIndex=[{...entry}];delete patch.bidIndex[0].remaining;patch.bidIndex.push(...book.bidIndex);proof.prefix=[];proof.suffix=book.bidIndex;}if(omitOwner)patch.ownerBids=book.ownerBids;const batch=writeBatch(b);batch.update(doc(b,'sparkBooks/deep'),{...patch,orders:[...book.orders,entry],version:entry.sequence,lastAction:{kind:'place',actor:'b',entry,...proof},updatedAt:serverTimestamp()});batch.update(doc(b,'sparkAccounts/b'),{reservedCash:increment(price),version:increment(1),lastMarket:'deep'});batch.set(doc(b,'sparkAccounts/b/orders',id),{companyId:'deep',orderId:id,uid:'b',side:'buy',price,quantity:1,sequence:entry.sequence,remaining:1,filled:0,cancelled:0,status:'open',createdAt:serverTimestamp(),marketVersion:entry.sequence});return batch.commit();}

async function forgeFill(db,buy,sell,{price=sell.price,quantity=Math.min(buy.remaining,sell.remaining),bonus=0,skipSeller=false,skipFill=false,skipOrder=false,skipPublic=false,publicPatch={}}={}){
 const ref=doc(db,'sparkBooks/deep'),book=(await getDoc(ref)).data(),version=book.version+1,id=crypto.randomUUID();
 const orders=book.orders.filter(o=>!(o.uid===buy.uid&&o.id===buy.id)&&!(o.uid===sell.uid&&o.id===sell.id));
 for(const o of [buy,sell])if(o.remaining>quantity)orders.push({...o,remaining:o.remaining-quantity});
 const batch=writeBatch(db);if(!skipPublic)batch.set(doc(db,'sparkBooks/deep/trades',id),{companyId:'deep',price,quantity,marketVersion:version,createdAt:serverTimestamp(),...publicPatch});batch.update(ref,{...removeIndexes(book,[buy,sell].filter(o=>o.id!=='issuer'&&o.remaining===quantity)),orders,version,updatedAt:serverTimestamp(),lastPrice:price,lastAction:{kind:'fill',actor:'c',buy,sell,fillId:id}});
 batch.update(doc(db,'sparkAccounts',buy.uid),{cash:increment(-price*quantity+bonus),reservedCash:increment(-buy.price*quantity),['positions.deep']:increment(quantity),version:increment(1),lastMarket:'deep'});
 if(!skipSeller)batch.update(doc(db,'sparkAccounts',sell.uid),{cash:increment(price*quantity),['positions.deep']:increment(-quantity),['reservedPositions.deep']:increment(-quantity),version:increment(1),lastMarket:'deep'});
 for(const [o,side]of [[buy,'buy'],[sell,'sell']]){
  if(!skipOrder)batch.update(doc(db,'sparkAccounts',o.uid,'orders',o.id),{remaining:o.remaining-quantity,filled:o.quantity-o.remaining+quantity,status:o.remaining===quantity?'filled':'open',marketVersion:version});
  if(!skipFill)batch.set(doc(db,'sparkAccounts',o.uid,'fills',id),{companyId:'deep',price,quantity,side,marketVersion:version,createdAt:serverTimestamp()});
 }
 return batch.commit();
}
test('100 resting orders preserve reservations, priority, partial fills and non-head cancellation',async()=>{
 for(let i=0;i<50;i++)await placeSpark(b,'b',order('deep','depth-buy-'+i,'buy',8000+i*10));
 for(let i=0;i<50;i++)await placeSpark(a,'a',order('deep','depth-ask-'+i,'sell',11000+i%5*10,2));
 let book=await read();assert.equal(book.orders.length,100);assert.equal(book.bidIndex[0].id,'depth-buy-49');assert.equal(book.askIndex[0].id,'depth-ask-0');assert.equal((await getDoc(doc(b,'sparkAccounts/b'))).data().reservedCash,412250);assert.equal((await getDoc(doc(a,'sparkAccounts/a'))).data().reservedPositions.deep,100);
 await assertFails(rawPlace('wrong-queue-priority',7000,{wrongPriority:true}));await assertFails(rawPlace('missing-owner-index',7000,{omitOwner:true}));
 await assert.rejects(placeSpark(a,'a',order('deep','self-cross-depth','buy',12000)),/본인/);
 await placeSpark(c,'c',order('deep','deep-taker','buy',12000,3));book=await read();await assertFails(forgeFill(c,book.orders.find(o=>o.id==='deep-taker'),book.orders.find(o=>o.id==='depth-ask-4')));assert.equal(await matchSpark(c,'c','deep'),true);assert.equal(await matchSpark(c,'c','deep'),true);
 assert.equal((await getDoc(doc(a,'sparkAccounts/a/orders/depth-ask-0'))).data().status,'filled');assert.equal((await getDoc(doc(a,'sparkAccounts/a/orders/depth-ask-5'))).data().remaining,1);
 await cancelSpark(b,'b',{companyId:'deep',orderId:'depth-buy-13'});await cancelSpark(a,'a',{companyId:'deep',orderId:'depth-ask-13'});book=await read();assert.equal(book.bidIndex.length,49);assert.equal(book.askIndex.length,48);
 const view=await sparkView(a,'a','deep','student');assert.equal(view.orders.filter(o=>o.status==='open'&&o.companyId==='deep').length,48);assert.equal(view.account.reservedPositions.deep,95);
});

test('large taker orders continue matching across bounded view refreshes instead of stopping after eight fills',async()=>{
 await placeSpark(c,'c',order('deep','many-pair-taker','buy',12000,50));let calls=0,view;
 do{view=await sparkView(c,'c','deep','student');calls++;assert.ok(calls<10);}while(view.matchPending);
 assert.ok(calls>1);assert.equal((await getDoc(doc(c,'sparkAccounts/c/orders/many-pair-taker'))).data().remaining,0);assert.equal(view.account.positions.deep,53);
});

test('legacy order upgrade resumes and preserves orders, reserves and first-arrival issuance',async()=>{
 for(let i=0;i<12;i++)await placeSpark(i%2?b:a,i%2?'b':'a',order('legacy','legacy-bid-'+i,'buy',10000+i*10));
 const old=await read('legacy'),account=(await getDoc(doc(a,'sparkAccounts/a'))).data();await env.withSecurityRulesDisabled(async ctx=>{const legacy={...old,orders:[...old.orders].reverse()};for(const key of Object.keys(emptyIndexes()))delete legacy[key];await setDoc(doc(ctx.firestore(),'sparkBooks/legacy'),legacy);});
 const ref=doc(a,'sparkBooks/legacy'),book=await read('legacy');await assertFails(updateDoc(ref,{...emptyIndexes(),version:book.version+1,lastAction:{kind:'indexStart',actor:'a'},updatedAt:serverTimestamp()}));
 await updateDoc(ref,{...emptyIndexes(),indexVersion:1,version:book.version+1,lastAction:{kind:'indexStart',actor:'a'},updatedAt:serverTimestamp()});
 await assertFails(updateDoc(ref,{indexVersion:2,version:book.version+2,lastAction:{kind:'index',actor:'a'},updatedAt:serverTimestamp()}));
 await Promise.all([...Array.from({length:6},(_,i)=>initializeSpark(i%2?b:a,i%2?'b':'a','legacy'))]).catch(e=>{throw Error('Migration: '+e.message);});const indexed=await read('legacy');assert.equal(indexed.indexVersion,2);assert.deepEqual(indexed.orders,[...old.orders].reverse());assert.deepEqual((await getDoc(doc(a,'sparkAccounts/a'))).data(),account);assert.equal(indexed.initialIndex[0].id,'legacy-bid-0');
 assert.equal(await matchSpark(c,'c','legacy'),true);assert.equal((await getDoc(doc(a,'sparkAccounts/a/orders/legacy-bid-0'))).data().status,'filled');assert.equal((await getDoc(doc(b,'sparkAccounts/b/orders/legacy-bid-11'))).data().status,'open');
});

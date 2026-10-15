import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {initializeTestEnvironment} from '@firebase/rules-unit-testing';import {doc,setDoc} from 'firebase/firestore';import {subscribeQuotes} from '../../client/quotes.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('live quotes follow confirmed fills, keep price on order-only changes, and unsubscribe',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-live-quotes',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();let stop;
 try{await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'users/viewer'),{displayName:'synthetic',active:true,role:'student'}));const db=env.authenticatedContext('viewer',{email:'test@hcu.hs.kr',email_verified:true}).firestore();const events=[],waiting=[];
 const waitFor=predicate=>new Promise((resolve,reject)=>{if(predicate())return resolve();const timer=setTimeout(()=>reject(Error('quote timeout')),4000);waiting.push(()=>{if(predicate()){clearTimeout(timer);resolve();}});});
 stop=subscribeQuotes(db,[{id:'new-symbol',referencePrice:10000}],(id,q)=>{events.push(q);waiting.forEach(w=>w());});await waitFor(()=>events.some(q=>q.quoteKind==='initial'));
 await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'sparkBooks/new-symbol'),{lastPrice:12345,version:1}));await waitFor(()=>events.at(-1)?.currentPrice===12345);
 const count=events.length;await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'sparkBooks/new-symbol'),{lastPrice:12345,version:2,orders:[{price:15000}]}));await waitFor(()=>events.length>count);assert.equal(events.at(-1).currentPrice,12345);
 stop();const end=events.length;await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'sparkBooks/new-symbol'),{lastPrice:14000,version:3}));assert.equal(events.length,end);
 }finally{stop?.();await env.cleanup();}
});

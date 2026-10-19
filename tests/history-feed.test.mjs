import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historyPage,compareHistory} from '../client/management-history.js';
import {mountManagementHistory} from '../public/history-feed.js';
test('history cursors retain equal timestamps, colliding event/investment IDs and all older loss rows',()=>{
 const rows=Array.from({length:35},(_,i)=>({id:'item-'+i,source:'investment',appliedAt:1000}));rows.push({id:'item-1',source:'event',appliedAt:1000},{id:'loss',source:'event',appliedAt:1});rows.sort(compareHistory);
 let cursor,all=[];do{const page=historyPage(rows,cursor);assert.ok(page.rows.length<=20);all.push(...page.rows);cursor=page.next;}while(cursor);
 assert.equal(all.length,37);assert.equal(new Set(all.map(r=>r.source+':'+r.id)).size,37);assert.equal(all.at(-1).id,'loss');assert.throws(()=>historyPage(rows,{id:'../x',source:'event',appliedAt:1}));
});
function fixture(){
 let callback,requests=0,fail=false,disconnected=0;const html=[],listeners={};
 const sentinel={textContent:'',innerHTML:'',insertAdjacentHTML:(pos,s)=>html.push(s),remove:()=>{}},list={querySelector:()=>sentinel,addEventListener:()=>{},removeEventListener:()=>{}},count={};
 const root={isConnected:true,querySelector:sel=>sel==='h3 span'?count:list,addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:()=>{}};
 class Observer{constructor(fn){callback=fn;}observe(){}unobserve(){}disconnect(){disconnected++;}}
 const request=async()=>{requests++;if(fail)throw Error();return {rows:[{id:String(requests),source:'event',kind:'cash',amount:-1000,status:'applied',appliedAt:1000,title:'손실금',description:'회사 자금 -1,000원'}],next:requests===1?{id:'1',source:'event',appliedAt:1000}:null};};
 const stop=mountManagementHistory(root,request,'fixture',{Observer});
 return {intersect:()=>callback([{isIntersecting:true}]),settled:()=>new Promise(r=>setImmediate(r)),requests:()=>requests,stop,html,count,sentinel,root,listeners,fail:v=>fail=v,disconnected:()=>disconnected};
}
test('history waits until visible, adds older rows on scroll and stops after disposal',async()=>{
 const f=fixture();assert.equal(f.requests(),0);f.intersect();f.intersect();await f.settled();assert.equal(f.requests(),1);assert.equal(f.count.textContent,'1+');f.intersect();await f.settled();assert.equal(f.requests(),2);assert.equal(f.html.length,2);f.stop();f.intersect();assert.equal(f.requests(),2);
});
test('history failures do not spin repeated requests and retry remains available',async()=>{
 const f=fixture();f.fail(true);f.intersect();await f.settled();f.intersect();assert.equal(f.requests(),1);assert.match(f.sentinel.innerHTML,/다시 시도/);f.fail(false);f.listeners.click({target:{closest:()=>true}});await f.settled();assert.equal(f.requests(),2);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRetainedViews} from '../public/retained-views.js';
function fixture(limit=8){const host={replaceChildren(node){if(this.node)this.node.parentNode=null;this.node=node;node.parentNode=this;}},views=createRetainedViews({limit,create:()=>({remove(){this.parentNode=null;}})});return {host,views};}
test('returning to a screen retains actual nodes, entered values and scroll with zero reloads',async()=>{
 const {host,views}=fixture();let reads=0;const mount=async node=>{reads++;node.price=12340;node.scrollTop=80;};
 await views.show(host,'company-a',mount);const first=host.node;first.price=23450;first.scrollTop=140;
 views.pause();await views.show(host,'portfolio',mount);await views.show(host,'company-a',mount);
 assert.equal(host.node,first);assert.equal(host.node.price,23450);assert.equal(host.node.scrollTop,140);assert.equal(reads,2);
});
test('only invalidated views refresh, controllers resume without destroying their contents',async()=>{
 const {host,views}=fixture();let mounts=0,refreshes=0,resumes=0,disposed=0;
 const mount=async()=>{mounts++;return {refresh:async()=>refreshes++,resume:()=>resumes++,dispose:()=>disposed++};};
 await views.show(host,'a',mount);await views.show(host,'b',mount);views.invalidate(k=>k==='b');await views.show(host,'a',mount);assert.equal(resumes,1);assert.equal(refreshes,0);await views.show(host,'b',mount);assert.equal(refreshes,1);assert.equal(mounts,2);views.clear();assert.equal(disposed,2);
});
test('bounded screens dispose old controllers and session clearing blocks stale mounts',async()=>{
 const {host,views}=fixture(2);let disposed=0;const mount=async()=>({dispose:()=>disposed++});await views.show(host,'a',mount);await views.show(host,'b',mount);await views.show(host,'c',mount);assert.equal(disposed,1);views.clear();assert.equal(disposed,3);
 let finish;const pending=views.show(host,'old',async()=>{await new Promise(r=>finish=r);return {dispose:()=>disposed++};});await Promise.resolve();views.clear();finish();await pending;assert.equal(disposed,4);
});

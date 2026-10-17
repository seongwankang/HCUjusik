import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=/<script id="startup-guard">([\s\S]*?)<\/script>/.exec(html)[1];
function fixture(){
 const listeners=new Map(),timers=new Map();let starting=true,parsed=false,reloads=0,id=0;
 const message={textContent:'화면을 준비하고 있어요.'},retry={hidden:true};
 const on=(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);};
 const document={documentElement:{hasAttribute:()=>starting,removeAttribute:()=>{starting=false;}},querySelector:selector=>parsed?(selector==='#startup-message'?message:retry):null,addEventListener:on};
 runInNewContext(source,{document,window:{addEventListener:on},location:{reload:()=>{reloads++;}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)});
 const emit=(name,event={})=>{if(name==='DOMContentLoaded')parsed=true;for(const fn of [...listeners.get(name)||[]])fn(event);};
 return {emit,message,retry,timers,starting:()=>starting,reloads:()=>reloads};
}
test('first paint hides the default layout with inline styles before external assets',()=>{
 assert.match(html,/<html[^>]+data-starting/);
 assert.ok(html.indexOf('id="startup-style"')<html.indexOf('href="./style.css"'));
 assert.match(html,/html\[data-starting\] body>\.layout\{visibility:hidden\}/);
 assert.match(html,/<div id="app-startup" role="status"/);
});
test('ready restores layout immediately and cancels delayed retry without a minimum wait',()=>{
 const f=fixture();f.emit('DOMContentLoaded');assert.equal(f.starting(),true);assert.equal(f.timers.size,1);
 f.emit('app-ready');assert.equal(f.starting(),false);assert.equal(f.timers.size,0);
 f.emit('error',{error:new Error('background task')});assert.equal(f.retry.hidden,true);
});
test('slow connection can recover after retry appears and retry actually reloads',()=>{
 const f=fixture();f.emit('DOMContentLoaded');for(const fn of f.timers.values())fn();
 assert.equal(f.starting(),true);assert.equal(f.retry.hidden,false);assert.match(f.message.textContent,/지연/);
 f.retry.onclick();assert.equal(f.reloads(),1);f.emit('app-ready');assert.equal(f.starting(),false);
});
test('bundle errors before body parsing expose recovery and never reveal half-initialized layout',()=>{
 const f=fixture();f.emit('error',{target:{tagName:'SCRIPT'}});f.emit('DOMContentLoaded');
 assert.equal(f.retry.hidden,false);assert.match(f.message.textContent,/불러오지 못/);assert.equal(f.timers.size,0);
 f.emit('app-ready');assert.equal(f.starting(),true);
});

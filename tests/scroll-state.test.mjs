import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureScroll,restoreScroll,setHTMLKeepingScroll} from '../public/scroll-state.js';
function fixture(){
 const root={id:'root',scrollTop:0,scrollLeft:0,children:[],childNodes:[],contains(node){return this.children.includes(node);},querySelectorAll(selector){return this.children.filter(n=>selector!=='[id]'||n.id);}};
 let html='',writes=0;
 Object.defineProperty(root,'innerHTML',{get:()=>html,set(value){html=value;writes++;root.children=[{id:'list',scrollTop:0,scrollLeft:0,parentElement:root,children:[]}];root.childNodes=[...root.children];root.scrollTop=0;}});
 return {root,writes:()=>writes};
}
test('refresh restores nested vertical/horizontal scroll after replacing content, using latest position at paint time',()=>{
 const {root}=fixture();setHTMLKeepingScroll(root,'first');root.children[0].scrollTop=240;root.children[0].scrollLeft=120;root.scrollTop=50;
 setHTMLKeepingScroll(root,'updated');assert.equal(root.children[0].scrollTop,240);assert.equal(root.children[0].scrollLeft,120);assert.equal(root.scrollTop,50);
});
test('unchanged content keeps actual nodes; external reset and new history revision still render',()=>{
 const f=fixture();setHTMLKeepingScroll(f.root,'same');const first=f.root.children[0];setHTMLKeepingScroll(f.root,'same');assert.equal(f.writes(),1);assert.equal(f.root.children[0],first);
 f.root.innerHTML='';setHTMLKeepingScroll(f.root,'same');assert.equal(f.writes(),3);
 setHTMLKeepingScroll(f.root,'same',{revision:'new-record'});assert.equal(f.writes(),4);
});
test('scroll snapshot can be restored after the final table render rather than its empty placeholder',()=>{
 const {root}=fixture();setHTMLKeepingScroll(root,'first');root.children[0].id='';root.children[0].scrollTop=160;const saved=captureScroll(root);root.innerHTML='new';root.children[0].id='';restoreScroll(root,saved);assert.equal(root.children[0].scrollTop,160);
});

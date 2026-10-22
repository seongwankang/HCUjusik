import {test} from 'node:test';import assert from 'node:assert/strict';
import {showSpies} from '../public/spies.js';
test('spy overview, combined rate and every active row show the effective policy, even with old response fields',async()=>{
 for(const count of [0,1,2]){
 const host={innerHTML:'',textContent:''},companies=[{id:'a',name:'파견',status:'listed'},{id:'b',name:'대상',status:'listed'}],agents=Object.fromEntries(Array.from({length:count},(_,i)=>[i,{targetId:'b',bps:250,remaining:1,activeFromDay:20000}]));
 await showSpies(host,async route=>route.startsWith('/api/spies?')?{policy:{cost:1000000,bps:250,settlements:0},contract:{agents},history:[]}:{companies},'a',companies,{}, {available:10000000,ops:{}},async()=>{},()=>true);
 assert.match(host.innerHTML,/1명당 일매출 4% 강탈/);assert.ok(host.innerHTML.includes(`활동 인원 ${count}명 · 합계 ${count*4}%`));assert.equal((host.innerHTML.match(/<td>4%<\/td>/g)||[]).length,count);assert.equal(host.innerHTML.includes('2.5%'),false);
 }
});

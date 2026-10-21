import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderInvestor} from '../public/investor.js';

test('history renders every row in one scroll list, with a visible loss label and no older-history disclosure',()=>{
 const recentHistory=Array.from({length:25},(_,n)=>({id:String(n),kind:'cash',amount:n===24?-1000000:100,status:'applied',appliedAt:Date.now()-n*1000,title:n===24?'손실 발생':'지원',description:n===24?'회사 자금 -1,000,000원 · 일회성':'회사 자금 +100원 · 일회성'}));
 const host={querySelectorAll:()=>[],childNodes:[]};renderInvestor(host,{asOf:Date.now(),dividendBps:5000,tomorrowRevenue:0,perShare:0,myDividend:0,myShares:0,factory:0,equipment:0,research:0,researchBps:0,employees:0,capacity:10,activeEvents:[],recentHistory,initialized:true});
 assert.equal((host.innerHTML.match(/class="investor-history-list"/g)||[]).length,1);
 assert.equal((host.innerHTML.match(/class="investor-history-item"/g)||[]).length,25);
 assert.ok(host.innerHTML.includes('>손실금</span>'));assert.match(host.innerHTML,/-1,000,000원/);
 assert.doesNotMatch(host.innerHTML,/investor-history-more|이전 이력|최근 20건/);
});

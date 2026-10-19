import {test} from 'node:test';import assert from 'node:assert/strict';
import {detectionCandidates,detectionCompensation,detectionArticle} from '../server/spy-detection-model.js';
test('draw contains each individual eligible agent once, including legacy contracts and multiple targets',()=>{
 const agent={companyId:'a',targetId:'b',hireId:'hired',remaining:1,activeFromDay:10,lastRoundDay:0};
 const rows=detectionCandidates([{id:'a',agents:{0:agent,1:{...agent,hireId:'second',targetId:'c'},2:{...agent,remaining:0},3:{...agent,activeFromDay:11},4:{...agent,lastRoundDay:10}}},{id:'b',...agent,targetId:'a'}],10);
 assert.deepEqual(rows.map(r=>[r.companyId,r.targetId,r.slot]),[['a','b','0'],['b','a','0']]);assert.deepEqual(detectionCandidates([],10),[]);
});
test('compensation is 150 percent of one 5 percent agent, rounded up to whole won without float loss',()=>{
 assert.deepEqual(detectionCompensation(4000000),{intended:200000,compensation:300000});assert.deepEqual(detectionCompensation(20),{intended:1,compensation:2});assert.deepEqual(detectionCompensation(19),{intended:0,compensation:0});assert.deepEqual(detectionCompensation(1e12),{intended:50000000000,compensation:75000000000});for(const n of [-1,1.5,NaN,1e12+1])assert.throws(()=>detectionCompensation(n));
});
test('automatic article names both companies and states actual reference revenue, amount and termination',()=>{
 const n=detectionArticle({day:20000,companyId:'a',targetId:'b',companyName:'발각회사',targetName:'피해회사',targetRevenue:4000000,intended:200000,compensation:300000});assert.equal(n.category,'기업 뉴스');assert.match(n.content,/피해회사/);assert.match(n.content,/200,000원/);assert.match(n.content,/300,000원/);assert.match(n.content,/오늘부터 수익을 가져오지 못합니다/);assert.match(n.title,/발각회사/);
});

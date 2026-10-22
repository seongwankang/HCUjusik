import {test} from 'node:test';import assert from 'node:assert/strict';
import {randomEffectGroups,effectReceiptId} from '../client/random-effects.js';
import {eventNewsSummary,mergeEventNews} from '../client/event-news.js';
import {managementHistory} from '../client/management-history.js';
test('each effect requires explicit valid companies; duplicates normalize and empty never means all',()=>{
 const input={effects:[{companyIds:['a','a'],effect:{kind:'cash',amount:100}},{companyIds:['a','b'],effect:{kind:'productionPower',percent:20,settlements:3}}]};
 const groups=randomEffectGroups(input,['a','b']);assert.deepEqual(groups.map(g=>g.targets),[['a'],['a','b']]);
 for(const effects of [[],Array(21).fill(input.effects[0]),[{companyIds:[],effect:{kind:'none'}}],[{effect:{kind:'none'}}],[{companyIds:['missing'],effect:{kind:'none'}}]])assert.throws(()=>randomEffectGroups({effects},['a']));
 assert.equal(effectReceiptId('event',1,2),'event_e1');assert.equal(effectReceiptId('event',0),'event');
});
test('news tracks each effect separately even when the same company receives both',()=>{
 const event={type:'random',randomEffectCount:2},outcomes=[{targets:['a'],effect:{kind:'cash',amount:100}},{targets:['a','b'],effect:{kind:'cash',amount:-200}}];
 const summary=eventNewsSummary(event,{a:{name:'A'},b:{name:'B'}},{},{a_0:{result:{amount:100}}},outcomes);
 assert.equal(summary.groups[0].companies[0].status,'applied');assert.equal(summary.groups[1].companies[0].status,'pending');
 const merged=mergeEventNews(summary,eventNewsSummary(event,{a:{name:'A'},b:{name:'B'}},{},{},outcomes));assert.equal(merged.groups[0].companies[0].result.amount,100);assert.equal(merged.groups[1].companies[0].status,'pending');
 const history=managementHistory({effects:[{id:'event_e0',eventId:'event',appliedAt:100,effect:{kind:'cash',amount:100}}],events:[{id:'event',title:'한 사건'}]},101);assert.equal(history.recentEvents[0].title,'한 사건');
});

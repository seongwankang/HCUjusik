import {test} from 'node:test';import assert from 'node:assert/strict';
import {eventNewsId,eventNewsSummary,mergeEventNews,validateEventNews} from '../client/event-news.js';import {renderEventResults} from '../public/event-results.js';
const e={type:'choice',targets:['a','b','c'],options:['유지','확대','중단']},effects=[{kind:'revenue',percent:-20,settlements:2},{kind:'cash',amount:1000},{kind:'none'}];
test('choice news groups companies and actual outcomes without participant identities or hidden metadata',()=>{
 const summary=eventNewsSummary(e,{a:{name:'기업 A'},b:{name:'기업 B'},c:{name:'기업 C'}},{a:{option:0,uid:'private'},b:{option:1}},{a:{},b:{result:{amount:500,uid:'secret',email:'secret@example.com'}}},effects);
 assert.equal(summary.groups[0].companies[0].name,'기업 A');assert.deepEqual(summary.groups[1].companies[0].result,{amount:500});assert.deepEqual(summary.unselected,['기업 C']);assert.equal(JSON.stringify(summary).includes('secret'),false);assert.equal(JSON.stringify(summary).includes('private'),false);
 const html=renderEventResults(summary);assert.match(html,/선택지별 기업·적용 결과/);assert.match(html,/500원/);assert.match(html,/미선택 기업/);assert.match(html,/정산 2회/);
});
test('pending results stay marked and all company names and choices are escaped',()=>{
 const summary=eventNewsSummary({...e,options:['<script>','B','C']},{a:{name:'<img onerror=alert(1)>'}},{a:{option:0}},{},effects);
 const html=renderEventResults(summary);assert.match(html,/적용 대기/);assert.equal(html.includes('<script>'),false);assert.equal(html.includes('<img '),false);assert.match(html,/&lt;script&gt;/);
});
test('long event identifiers map to stable safe news IDs and large company lists remain structured',async()=>{
 const id=await eventNewsId('e'.repeat(128));assert.match(id,/^[a-f0-9]{64}$/);assert.equal(await eventNewsId('e'.repeat(128)),id);assert.notEqual(await eventNewsId('different'),id);
 const ids=Array.from({length:100},(_,i)=>'c'+i),companies=Object.fromEntries(ids.map(k=>[k,{name:'이름'.repeat(40)}]));const s=eventNewsSummary({type:'random',targets:ids},companies,{}, {},[effects[0]]);assert.equal(s.groups[0].companies.length,100);
});
test('a stale concurrent news retry cannot revert completed companies or confuse identical names',()=>{
 const old={type:'random',groups:[{companies:[{companyId:'a',name:'같은 이름',status:'applied',result:{amount:100}}]}],unselected:[]};
 const next={type:'random',groups:[{companies:[{companyId:'a',name:'같은 이름',status:'pending',result:null},{companyId:'b',name:'같은 이름',status:'pending',result:null}]}],unselected:[]};
 const rows=mergeEventNews(old,next).groups[0].companies;assert.equal(rows[0].status,'applied');assert.equal(rows[0].result.amount,100);assert.equal(rows[1].status,'pending');
});


test('event news requires separately authored copy; blank or oversized drafts fail before writes',()=>{
 assert.equal(validateEventNews(null),null);
 assert.deepEqual(validateEventNews({title:' 직접 쓴 제목 ',content:' 기사 본문 '}),{title:'직접 쓴 제목',content:'기사 본문'});
 for(const value of [{},{title:'제목',content:' '},{title:'a'.repeat(121),content:'본문'},{title:'제목',content:'a'.repeat(5001)}])assert.throws(()=>validateEventNews(value),/뉴스/);
});

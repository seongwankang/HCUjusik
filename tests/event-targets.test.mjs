import {test} from 'node:test';
import assert from 'node:assert/strict';
import {eventTargets} from '../client/event-targets.js';
const ids=['one','two','three'];
test('random selection preserves only chosen companies and removes duplicates',()=>{
 assert.deepEqual(eventTargets({type:'random',companyIds:['three','one','three']},ids),['three','one']);
 assert.deepEqual(eventTargets({type:'random',companyIds:['two']},ids),['two']);
});
test('empty, malformed, unknown or oversized explicit selections never become global events',()=>{
 for(const companyIds of [[],null,'one',['missing'],[null],Array(101).fill('one')])assert.throws(()=>eventTargets({type:'random',companyIds},ids));
 assert.throws(()=>eventTargets({type:'random',companyIds:[] ,companyId:'one'},ids));
});
test('global and legacy single-company events remain compatible; choices still target all companies',()=>{
 assert.deepEqual(eventTargets({type:'random',companyId:''},ids),ids);
 assert.deepEqual(eventTargets({type:'random',companyId:'one'},ids),['one']);
 assert.deepEqual(eventTargets({type:'choice',companyIds:['one']},ids),ids);
 assert.throws(()=>eventTargets({type:'random'},[]));
});

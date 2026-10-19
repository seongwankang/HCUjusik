import {test} from 'node:test';import assert from 'node:assert/strict';
import {marketSession,koreaDayStart,dayChange} from '../client/market-session.js';
test('Korean market opens at 08:00 inclusive and closes at 21:00 exclusive every day',()=>{
 for(const [at,open] of [['2026-10-17T07:59:59.999+09:00',false],['2026-10-17T08:00:00+09:00',true],['2026-10-17T08:59:59.999+09:00',true],['2026-10-17T09:00:00+09:00',true],['2026-10-17T20:59:59.999+09:00',true],['2026-10-17T21:00:00+09:00',false],['2026-10-18T00:00:00+09:00',false]])assert.equal(marketSession(Date.parse(at)).open,open,at);
 assert.equal(new Date(koreaDayStart(Date.parse('2026-10-17T16:00:00+09:00'))).toISOString(),'2026-10-16T15:00:00.000Z');
});
test('day change compares current price against previous close with signed percent',()=>{assert.deepEqual(dayChange(11000,10000),{amount:1000,percent:10,direction:'up'});assert.deepEqual(dayChange(9000,10000),{amount:-1000,percent:-10,direction:'down'});assert.equal(dayChange(10000,10000).direction,'flat');assert.equal(dayChange(10000,null),null);});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newOperations,dayPlan} from '../client/economy.js';
import {koreaDay,settlementTime} from '../client/settlement-time.js';
test('a startup grant cannot mint revenue for a morning before its account existed',()=>{
 const now=Date.parse('2026-10-21T04:48:00Z'),day=koreaDay(now),o={...newOperations(now),equipment:1,revenue:200000};
 assert.equal(o.lastSettledDay,day);assert.throws(()=>dayPlan(o,{issuerCash:0,issuedShares:1000,treasuryShares:0},day));
 assert.equal(dayPlan(o,{issuerCash:0,issuedShares:1000,treasuryShares:0},day+1).revenue,400000);
 assert.equal(newOperations(settlementTime(day)-1).lastSettledDay,0);
 assert.equal(newOperations(settlementTime(day)).lastSettledDay,day);
});

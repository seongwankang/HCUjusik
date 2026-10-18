import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dividendAllocation} from '../client/dividends.js';
import {dayPlan,initialOperations} from '../client/economy.js';
test('standard 1000-share denominator is stable at zero, partial and full subscription',()=>{for(const sold of [0,400,1000]){const b={issuedShares:1000,treasuryShares:1000-sold,issuerCash:0},p=dayPlan({...initialOperations(),cash:1000000,revenue:2000000,dividendBps:5000},b,100);assert.equal(p.perShare,2000);assert.equal(p.dividend,2000*sold);assert.equal(p.treasuryDividend,2000*(1000-sold));assert.equal(p.retained,4000000-p.dividend);assert.equal(p.cash,1000000+p.retained);assert.equal(p.dividend+p.retained,4000000);}});
test('integer remainder stays in company without a second treasury credit',()=>{const p=dayPlan({...initialOperations(),revenue:12345,dividendBps:3333},{issuedShares:1000,treasuryShares:777,issuerCash:0},100);assert.equal(p.perShare,8);assert.equal(p.dividend,1784);assert.equal(p.treasuryDividend,6216);assert.equal(p.cash,24690-1784);});
test('invalid share accounting is rejected',()=>{for(const b of [{issuedShares:0,treasuryShares:0},{issuedShares:1000,treasuryShares:1001},{issuedShares:1000,treasuryShares:-1}])assert.throws(()=>dividendAllocation(1000,5000,b));});

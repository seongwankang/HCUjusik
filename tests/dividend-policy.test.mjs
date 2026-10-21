import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dividendChangeStatus} from '../client/dividend-policy.js';
const at=s=>Date.parse('2026-10-21T'+s+'+09:00');
test('dividend policy uses Korea calendar and 08:00 inclusive / 17:00 exclusive',()=>{
 for(const [time,allowed] of [['07:59:59.999',false],['08:00:00',true],['16:59:59.999',true],['17:00:00',false],['23:59:59',false]])assert.equal(dividendChangeStatus({},at(time)).allowed,allowed,time);
 const day=dividendChangeStatus({},at('08:00:00')).day;
 assert.equal(dividendChangeStatus({lastDividendDay:day},at('16:00:00')).allowed,false);
 assert.equal(dividendChangeStatus({lastDividendDay:day-1},at('08:00:00')).allowed,true);
 assert.equal(dividendChangeStatus({lastDividendDay:day},at('08:00:00')+86400000).allowed,true);
 assert.equal(dividendChangeStatus({locked:true},at('09:00:00')).allowed,false);
});

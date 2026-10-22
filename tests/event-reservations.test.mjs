import {test} from 'node:test';import assert from 'node:assert/strict';
import {reservationTime} from '../client/event-reservations.js';
import {choiceDeadlineISO} from '../client/event-deadline.js';
test('reservation uses Korea wall time and rejects past, invalid and unbounded schedules',()=>{
 const now=Date.parse('2026-10-23T09:00:00+09:00'),iso=choiceDeadlineISO('2026-10-23T13:30');assert.equal(iso,'2026-10-23T04:30:00.000Z');assert.equal(reservationTime(iso,now),Date.parse(iso));
 for(const value of ['bad',new Date(now).toISOString(),new Date(now-1).toISOString(),new Date(now+366*86400000).toISOString()])assert.throws(()=>reservationTime(value,now));
});

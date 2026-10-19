import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultChoiceDeadline,choiceDeadlineISO} from '../client/event-deadline.js';
test('choice default is the next future 13:30 Korea, including the exact cutoff and date rollover',()=>{
 for(const [now,date] of [['2026-10-19T00:00:00+09:00','2026-10-19'],['2026-10-19T13:29:59+09:00','2026-10-19'],['2026-10-19T13:30:00+09:00','2026-10-20'],['2026-12-31T23:59:00+09:00','2027-01-01']])assert.equal(defaultChoiceDeadline(Date.parse(now)),date+'T13:30');
 assert.equal(choiceDeadlineISO('2026-10-20T13:30'),'2026-10-20T04:30:00.000Z');
 assert.equal(choiceDeadlineISO('2026-10-20T15:45'),'2026-10-20T06:45:00.000Z');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirestore, documentData} from '../src/firestore.js';
const env = {FIREBASE_PROJECT_ID: 'demo-school-stock'};
const doc = {name: 'projects/demo-school-stock/databases/(default)/documents/users/a', fields: {
  id: {stringValue: 'forged'}, cash: {integerValue: '1000000'},
  active: {booleanValue: true},
  holdings: {arrayValue: {values: [{mapValue: {fields: {quantity: {integerValue: '2'}}}}]}}
}};
test('decodes asset fields and trusts document name for ID', () => {
  assert.deepEqual(documentData(doc), {id: 'a', cash: 1000000, active: true, holdings: [{quantity: 2}]});
  assert.throws(() => documentData({...doc, fields: {cash: {integerValue: '9007199254740992'}}}), {status: 502});
});
test('forwards caller ID token and encodes UID in a fixed Firestore URL', async () => {
  const db = createFirestore(env, 'caller-id-token', async (url, options) => {
    assert.equal(url, 'https://firestore.googleapis.com/v1/projects/demo-school-stock/databases/(default)/documents/users/a%2Bb');
    assert.equal(options.headers.authorization, 'Bearer caller-id-token');
    assert.equal(options.method, undefined); // GET only
    return Response.json(doc);
  });
  assert.equal((await db.get('users/a+b')).cash, 1000000);
});
test('list is bounded and does not follow next page tokens', async () => {
  let count = 0;
  const db = createFirestore(env, 'token', async url => {
    count++;
    assert.equal(new URL(url).searchParams.get('pageSize'), '30');
    assert.equal(new URL(url).searchParams.get('orderBy'), 'publishedAt desc');
    return Response.json({documents: [doc], nextPageToken: 'not-followed'});
  });
  assert.equal((await db.list('news', 30, 'publishedAt desc')).length, 1);
  assert.equal(count, 1);
});
test('missing document and upstream errors handled without leaking bodies', async () => {
  assert.equal(await createFirestore(env, 'token', async () => new Response('', {status: 404})).get('users/missing'), null);
  for (const [upstream, expected] of [[401,401], [403,403], [429,429], [500,503]]) {
    const db = createFirestore(env, 'token', async () => new Response('SECRET', {status: upstream}));
    await assert.rejects(db.list('companies', 100, 'ticker'), error =>
      error.status === expected && !error.message.includes('SECRET'));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../src/index.js';
import {HttpError} from '../src/errors.js';
const origin = 'https://school.test';
const env = {
  FIREBASE_PROJECT_ID: 'demo-school-stock', FIREBASE_API_KEY: 'public-test-config',
  FIREBASE_AUTH_DOMAIN: 'demo-school-stock.firebaseapp.com'
};
function setup({active = true, registered = true} = {}) {
  const calls = [];
  const documents = {
    'users/student-a': registered ? {id: 'student-a', displayName: '테스트 학생', role: 'student', active} : null,
    'portfolios/student-a': {cash: 1000000, holdings: [], version: 0},
    'assignments/student-a': {companyIds: ['club01']},
    'companies/club01': {id: 'club01', name: '동아리 01', ticker: 'CLUB01', status: 'draft'}
  };
  const worker = createWorker({
    verify: async token => {
      if (token !== 'valid.token.signature') throw new HttpError(401, 'invalid');
      return {sub: 'student-a',email:'student@hcu.hs.kr',email_verified:true};
    },
    firestore: (_env, token) => {
      assert.equal(token, 'valid.token.signature');
      return {
        get: async path => {calls.push(['get', path]); return documents[path] ?? null;},
        list: async (...args) => {calls.push(['list', ...args]); return [];}
      };
    }
  });
  const request = (path, {authenticated = true, method = 'GET', body} = {}) =>
    worker.fetch(new Request(origin + path, {
      method,
      headers: authenticated ? {authorization: 'Bearer valid.token.signature', origin} : {},
      ...(body ? {body: JSON.stringify(body)} : {})
    }), env);
  return {request, calls, documents, worker};
}
test('config exposes only public fields and anonymous profile is empty', async () => {
  const {request} = setup();
  const config = await (await request('/api/config', {authenticated: false})).json();
  assert.deepEqual(Object.keys(config.firebase).sort(), ['apiKey', 'authDomain', 'projectId']);
  assert.deepEqual(await (await request('/api/me', {authenticated: false})).json(), {authenticated: false, user: null});
});
test('verified UID selects profile and single asset snapshot; query UID is ignored', async () => {
  const {request, calls} = setup();
  assert.equal((await (await request('/api/me')).json()).user.id, 'student-a');
  const response = await request('/api/portfolio?uid=student-b');
  assert.deepEqual(await response.json(), {cash: 1000000, holdings: [], version: 0});
  assert.ok(calls.every(([, path]) => !path.includes('student-b')));
});
test('authenticated reads use bounded collections and own assignments', async () => {
  const {request, calls} = setup();
  assert.equal((await request('/api/companies')).status, 200);
  assert.equal((await request('/api/news')).status, 200);
  assert.equal((await (await request('/api/my-company')).json()).companies[0].id, 'club01');
  assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(['list', 'companies', 100, 'ticker'])));
  assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(['list', 'news', 30, 'publishedAt desc'])));
});
test('private routes require auth, active registration and valid token', async () => {
  for (const path of ['/api/companies', '/api/news', '/api/portfolio', '/api/my-company']) {
    assert.equal((await setup().request(path, {authenticated: false})).status, 401);
    assert.equal((await setup({active: false}).request(path)).status, 403);
    assert.equal((await setup({registered: false}).request(path)).status, 403);
  }
  const {worker} = setup();
  assert.equal((await worker.fetch(new Request(origin + '/api/me', {
    headers: {authorization: 'Bearer invalid.token.signature'}
  }), env)).status, 401);
});
test('orders stay disabled even with an enabling env flag and malicious asset body', async () => {
  const {worker, calls, documents} = setup();
  const before = JSON.stringify(documents);
  const response = await worker.fetch(new Request(origin + '/api/orders', {
    method: 'POST', headers: {authorization: 'Bearer valid.token.signature'},
    body: JSON.stringify({uid: 'student-b', cash: 9999999, quantity: 100, price: 1})
  }), {...env, TRADING_ENABLED: 'true'});
  assert.equal(response.status, 501);
  assert.equal((await response.json()).code, 'TRADING_DISABLED');
  assert.deepEqual(calls, [['get', 'users/student-a']]);
  assert.equal(JSON.stringify(documents), before);
});
test('missing portfolio is explicit and invalid assignment cannot choose arbitrary paths', async () => {
  const {request, documents} = setup();
  delete documents['portfolios/student-a'];
  assert.equal((await request('/api/portfolio')).status, 404);
  documents['assignments/student-a'].companyIds = ['../users/student-b'];
  assert.equal((await request('/api/my-company')).status, 502);
});
test('malformed or overflowing assets fail closed', async () => {
  const {request, documents} = setup();
  documents['portfolios/student-a'].cash = -1;
  assert.equal((await request('/api/portfolio')).status, 502);
  documents['portfolios/student-a'].cash = 1000000;
  documents['portfolios/student-a'].holdings = [{quantity: '<script>', referencePrice: 1}];
  assert.equal((await request('/api/portfolio')).status, 502);
});

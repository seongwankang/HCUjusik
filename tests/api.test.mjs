import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const env = {ASSETS: {fetch: () => new Response('static asset')}};
test('health is read-only and reports missing configuration', async () => {
  const r = await worker.fetch(new Request('https://school.test/api/health'), env);
  assert.deepEqual(await r.json(), {ok: true, stage: 'firebase-read-only', configured: false, tradingEnabled: false});
});
test('missing config, unknown path, method and cross-origin requests', async () => {
  for (const [path, options, status] of [
    ['/api/companies', {}, 503],
    ['/api/missing', {}, 404],
    ['/api/me', {method: 'DELETE'}, 405],
    ['/api/orders', {method: 'POST', headers: {origin: 'https://other.test'}}, 403],
    ['/api/portfolio', {headers: {origin: 'https://other.test'}}, 403]
  ]) {
    const r = await worker.fetch(new Request('https://school.test' + path, options), env);
    assert.equal(r.status, status);
  }
});
test('static assets bypass API', async () => {
  assert.equal(await (await worker.fetch(new Request('https://school.test/'), env)).text(), 'static asset');
});

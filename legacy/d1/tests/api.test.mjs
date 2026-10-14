import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const assets = {fetch:()=>new Response('static asset')};

test('health endpoint',async()=>{
 const r = await worker.fetch(new Request('https://test.local/api/health'),{ASSETS:assets});
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,stage:'scaffold'});
});
test('API reports missing database',async()=>{
 const r = await worker.fetch(new Request('https://test.local/api/companies'),{ASSETS:assets});
 assert.equal(r.status,503);
});
test('cross-site POST is blocked',async()=>{
 const r = await worker.fetch(new Request('https://test.local/api/login',{method:'POST',headers:{origin:'https://other.local'}}),{ASSETS:assets});
 assert.equal(r.status,403);
});
test('unknown API endpoint has 404',async()=>{
 const db={};
 const r = await worker.fetch(new Request('https://test.local/api/does-not-exist'),{ASSETS:assets,DB:db});
 assert.equal(r.status,404);
});
test('static route delegates to assets',async()=>{
 const r = await worker.fetch(new Request('https://test.local/'),{ASSETS:assets});
 assert.equal(await r.text(),'static asset');
});

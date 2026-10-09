import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, SignJWT, createLocalJWKSet, exportJWK} from 'jose';
import {verifyFirebaseToken, authenticate} from '../src/auth.js';

const project = 'demo-school-stock';
const now = new Date();
const seconds = Math.floor(now.getTime() / 1000);
const pair = await generateKeyPair('RS256');
const jwk = await exportJWK(pair.publicKey);
const keys = createLocalJWKSet({keys: [{...jwk, kid: 'test-key', alg: 'RS256', use: 'sig'}]});
async function token(overrides = {}, signer = pair.privateKey, header = {}) {
  return new SignJWT({
    sub: 'student-a', aud: project, iss: `https://securetoken.google.com/${project}`,
    exp: seconds + 3600, iat: seconds - 1, auth_time: seconds - 60, ...overrides
  }).setProtectedHeader({alg: 'RS256', kid: 'test-key', ...header}).sign(signer);
}
test('valid Firebase-shaped signed token yields UID', async () => {
  assert.equal((await verifyFirebaseToken(await token(), project, keys, now)).sub, 'student-a');
});
for (const [label, claims] of Object.entries({
  expired: {exp: seconds - 1},
  audience: {aud: 'another-project'},
  issuer: {iss: 'https://attacker.example'},
  emptySubject: {sub: ''},
  longSubject: {sub: 'a'.repeat(129)},
  pathSubject: {sub: '../student-b'},
  futureIssue: {iat: seconds + 10},
  futureAuth: {auth_time: seconds + 10},
  missingAuth: {auth_time: undefined},
  wrongType: {auth_time: '123'},
  invalidLifetime: {exp: seconds - 2, iat: seconds - 1}
})) {
  test(`rejects ${label}`, async () => {
    await assert.rejects(verifyFirebaseToken(await token(claims), project, keys, now), {status: 401});
  });
}
test('rejects forged signature and unknown kid', async () => {
  const attacker = await generateKeyPair('RS256');
  await assert.rejects(verifyFirebaseToken(await token({}, attacker.privateKey), project, keys, now), {status: 401});
  await assert.rejects(verifyFirebaseToken(await token({}, pair.privateKey, {kid: 'unknown'}), project, keys, now), {status: 401});
  await assert.rejects(verifyFirebaseToken(await token({}, pair.privateKey, {kid: undefined}), project, keys, now), {status: 401});
});
test('rejects unsigned and symmetric tokens', async () => {
  const unsigned = Buffer.from(JSON.stringify({alg: 'none'})).toString('base64url') + '.' +
    Buffer.from(JSON.stringify({sub: 'student-a'})).toString('base64url') + '.';
  await assert.rejects(verifyFirebaseToken(unsigned, project, keys, now), {status: 401});
  const symmetric = await new SignJWT({sub: 'student-a'}).setProtectedHeader({alg: 'HS256'})
    .sign(new TextEncoder().encode('test-secret-only'));
  await assert.rejects(verifyFirebaseToken(symmetric, project, keys, now), {status: 401});
});
test('rejects missing, oversized and non-bearer auth without verification', async () => {
  for (const authorization of ['', 'Basic abc', 'Bearer ' + 'a'.repeat(8193)]) {
    await assert.rejects(authenticate(new Request('https://school.test', {headers: {authorization}}),
      {FIREBASE_PROJECT_ID: project}, () => assert.fail('must not verify')), {status: 401});
  }
});

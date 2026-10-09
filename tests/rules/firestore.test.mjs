import {before, after, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {doc, getDoc, getDocs, collection, query, limit, orderBy, setDoc, updateDoc, deleteDoc} from 'firebase/firestore';
import {createFirestore} from '../../src/firestore.js';

// Explicit emulator only; never default to production.
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run inside Firestore emulators:exec.');
let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-school-stock',
    firestore: {rules: readFileSync('firestore.rules', 'utf8')}
  });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/a'), {displayName: 'A', role: 'student', active: true}),
      setDoc(doc(db, 'users/b'), {displayName: 'B', role: 'student', active: true}),
      setDoc(doc(db, 'users/inactive'), {displayName: 'I', role: 'student', active: false}),
      setDoc(doc(db, 'portfolios/a'), {cash: 1000000, holdings: [], version: 0}),
      setDoc(doc(db, 'portfolios/b'), {cash: 1000000, holdings: [], version: 0}),
      setDoc(doc(db, 'portfolios/inactive'), {cash: 0, holdings: [], version: 0}),
      setDoc(doc(db, 'assignments/a'), {companyIds: ['club01']}),
      setDoc(doc(db, 'companies/club01'), {ticker: 'CLUB01', name: '동아리 01'}),
      setDoc(doc(db, 'news/n1'), {title: '시험', publishedAt: new Date()})
    ]);
  });
});
after(async () => {await environment?.cleanup();});
test('anonymous reads and unregistered bounded list are denied', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'users/a')));
  await assertFails(getDocs(query(collection(db, 'companies'), limit(100))));
  await assertFails(getDocs(query(collection(environment.authenticatedContext('stranger').firestore(), 'companies'), limit(100))));
});
test('own profile, portfolio, assignments and exact app queries are allowed', async () => {
  const db = environment.authenticatedContext('a').firestore();
  await assertSucceeds(getDoc(doc(db, 'users/a')));
  await assertSucceeds(getDoc(doc(db, 'portfolios/a')));
  await assertSucceeds(getDoc(doc(db, 'assignments/a')));
  await assertSucceeds(getDocs(query(collection(db, 'companies'), orderBy('ticker'), limit(100))));
  await assertSucceeds(getDocs(query(collection(db, 'news'), orderBy('publishedAt', 'desc'), limit(30))));
});
test('REST listDocuments pageSize permits the exact Worker requests', async () => {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const token = encode({alg: 'none', typ: 'JWT'}) + '.' + encode({
    sub: 'a', user_id: 'a', aud: 'demo-school-stock',
    iss: 'https://securetoken.google.com/demo-school-stock',
    iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600,
    auth_time: Math.floor(Date.now()/1000),
    firebase: {sign_in_provider: 'password', identities: {}}
  }) + '.';
  const rest = createFirestore({FIREBASE_PROJECT_ID: 'demo-school-stock'}, token,
    (url, options) => fetch(url.replace('https://firestore.googleapis.com',
      `http://${process.env.FIRESTORE_EMULATOR_HOST}`), options));
  const companies = await rest.list('companies', 100, 'ticker');
  if (companies[0]?.id !== 'club01') throw new Error('REST companies mismatch');
  const news = await rest.list('news', 30, 'publishedAt desc');
  if (news[0]?.id !== 'n1') throw new Error('REST news mismatch');
});
test('other UID, user lists, asset lists, unbounded and oversized lists denied', async () => {
  const db = environment.authenticatedContext('a').firestore();
  await assertFails(getDoc(doc(db, 'users/b')));
  await assertFails(getDoc(doc(db, 'portfolios/b')));
  await assertFails(getDoc(doc(db, 'assignments/b')));
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(getDocs(collection(db, 'portfolios')));
  await assertFails(getDocs(collection(db, 'companies')));
  await assertFails(getDocs(query(collection(db, 'companies'), limit(101))));
  await assertFails(getDocs(query(collection(db, 'news'), limit(31))));
});
test('inactive registration denies asset and company reads', async () => {
  const db = environment.authenticatedContext('inactive').firestore();
  await assertSucceeds(getDoc(doc(db, 'users/inactive')));
  await assertFails(getDoc(doc(db, 'portfolios/inactive')));
  await assertFails(getDoc(doc(db, 'companies/club01')));
});
test('all client writes denied, even with claimed admin role', async () => {
  for (const uid of ['a', 'b']) {
    const db = environment.authenticatedContext(uid, {admin: true}).firestore();
    for (const path of [`users/${uid}`, `portfolios/${uid}`, `assignments/${uid}`, 'companies/club01', 'news/n1', 'orders/o1']) {
      await assertFails(setDoc(doc(db, path), {cash: -1, role: 'admin', active: true}));
      await assertFails(updateDoc(doc(db, path), {cash: 9007199254740992, extraData: 'x'.repeat(10000)}));
      await assertFails(deleteDoc(doc(db, path)));
    }
  }
});
test('unknown paths and orphan subcollections denied', async () => {
  const db = environment.authenticatedContext('a').firestore();
  await assertFails(getDoc(doc(db, 'admin/config')));
  await assertFails(getDoc(doc(db, 'users/a/private/key')));
  await assertFails(setDoc(doc(db, 'users/a/private/key'), {value: 'test'}));
});

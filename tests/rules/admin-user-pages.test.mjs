import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,writeBatch,getDocs,collection,query,limit} from 'firebase/firestore';
import {readFileSync} from 'node:fs';
import {createClientApi} from '../../client/data.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
test('admin lists every account beyond 100 including duplicate/missing names; students remain blocked',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-admin-user-pages',firestore:{rules:readFileSync('firestore.rules','utf8')}});
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c=>{const db=c.firestore(),b=writeBatch(db);b.set(doc(db,'users/admin'),{displayName:'관리자',role:'admin',active:true});for(let i=0;i<205;i++)b.set(doc(db,'users','student-'+String(i).padStart(3,'0')),{...(i===204?{}:{displayName:i<2?'같은 이름':'학생 '+i}),role:'student',active:true,email:'student'+i+'@hcu.hs.kr'});await b.commit();});
  const claims={email:'admin@example.test',email_verified:false},db=env.authenticatedContext('admin',claims).firestore();
  const api=createClientApi({db,getUser:async()=>({uid:'admin',getIdTokenResult:async()=>({claims})})});
  const users=(await api('/api/admin/users')).users;assert.equal(users.length,206);assert.equal(new Set(users.map(u=>u.id)).size,206);
  assert.ok(users.some(u=>u.id==='student-204'));assert.equal(users.filter(u=>u.displayName==='같은 이름').length,2);
  await assertFails(getDocs(query(collection(db,'users'),limit(101))));
  const studentClaims={email:'student0@hcu.hs.kr',email_verified:true},student=env.authenticatedContext('student-000',studentClaims).firestore();
  const studentApi=createClientApi({db:student,getUser:async()=>({uid:'student-000',getIdTokenResult:async()=>({claims:studentClaims})})});
  await assert.rejects(studentApi('/api/admin/users'),/관리자/);await assertFails(getDocs(query(collection(student,'users'),limit(100))));
 }finally{await env.cleanup();}
});

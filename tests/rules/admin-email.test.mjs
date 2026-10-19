import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,limit,updateDoc,waitForPendingWrites} from 'firebase/firestore';
import {createClientApi} from '../../client/data.js';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Loopback emulator required');
let env,admin,student,other,api,adminApi;
const claims={email:'STUDENT@hcu.hs.kr',email_verified:true};
const make=(uid,db,c)=>createClientApi({db,getUser:async()=>({uid,getIdTokenResult:async()=>({claims:c})})});
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-admin-email',firestore:{rules:readFileSync('firestore.rules','utf8')}});await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{const d=c.firestore();for(const [uid,role]of [['admin','admin'],['student','student'],['other','student']])await setDoc(doc(d,'users',uid),{displayName:uid,role,active:true});});
 admin=env.authenticatedContext('admin',{email:'operator@example.test',email_verified:false}).firestore();student=env.authenticatedContext('student',claims).firestore();other=env.authenticatedContext('other',{email:'other@hcu.hs.kr',email_verified:true}).firestore();api=make('student',student,claims);adminApi=make('admin',admin,{email:'operator@example.test',email_verified:false});
});after(async()=>env?.cleanup());

test('verified email sync is private, cannot forge identity or elevate role and survives administrator edits',async()=>{
 await api('/api/me');await waitForPendingWrites(student);let profile=(await getDoc(doc(admin,'users/student'))).data();assert.equal(profile.email,'student@hcu.hs.kr');assert.equal(profile.role,'student');
 await assertFails(getDoc(doc(other,'users/student')));await assertFails(getDocs(query(collection(other,'users'),limit(100))));await assert.rejects(api('/api/admin/users'),/관리자/);
 await assertFails(updateDoc(doc(student,'users/student'),{email:'someone@hcu.hs.kr'}));await assertFails(updateDoc(doc(student,'users/student'),{email:'student@hcu.hs.kr',role:'admin'}));await assertFails(updateDoc(doc(admin,'users/student'),{email:'someone@hcu.hs.kr'}));
 const users=(await adminApi('/api/admin/users')).users;assert.equal(users.find(x=>x.id==='student').email,'student@hcu.hs.kr');
 await adminApi('/api/admin/users',{method:'POST',body:JSON.stringify({id:'student',displayName:'forged',role:'president',active:true,companyIds:[],email:'forged@hcu.hs.kr'})});profile=(await getDoc(doc(admin,'users/student'))).data();assert.equal(profile.email,'student@hcu.hs.kr');assert.equal(profile.displayName,'student');assert.equal(profile.role,'president');
 assert.equal('email' in (await api('/api/me')).user,false);
});

test('registration saves the verified Auth email rather than submitted text',async()=>{
 const c={email:'New@hcu.hs.kr',email_verified:true},db=env.authenticatedContext('new',c).firestore(),newApi=make('new',db,c);
 await newApi('/api/register',{method:'POST',body:JSON.stringify({displayName:'새학생',email:'forged@hcu.hs.kr'})});assert.equal((await getDoc(doc(admin,'users/new'))).data().email,'new@hcu.hs.kr');
 const bad=env.authenticatedContext('forged',{email:'real@hcu.hs.kr',email_verified:true}).firestore();await assertFails(setDoc(doc(bad,'users/forged'),{displayName:'x',role:'student',active:true,email:'wrong@hcu.hs.kr'}));
});

test('empty company description can be created and cleared, and public company data contains no contact emails',async()=>{
 const body={id:'company',initial:true,name:'기업',ticker:'COMP',category:'동아리',status:'listed',referencePrice:10000,issuedShares:1000};
 await adminApi('/api/admin/companies',{method:'POST',body:JSON.stringify(body)});assert.equal((await getDoc(doc(admin,'companies/company'))).data().description,'');
 await adminApi('/api/admin/companies',{method:'POST',body:JSON.stringify({...body,initial:false,description:'소개'})});await adminApi('/api/admin/companies',{method:'POST',body:JSON.stringify({...body,initial:false,description:''})});
 const company=(await api('/api/companies')).companies[0];assert.equal(company.description,'');assert.equal('email' in company,false);
 await assertFails(updateDoc(doc(admin,'companies/company'),{description:123}));await assertFails(updateDoc(doc(student,'companies/company'),{description:'학생 변경'}));
});

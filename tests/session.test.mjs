import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

test('restoration finishes before private reads; reload retains login and logout clears it',async()=>{
 const fixture={saved:null,currentUser:null,restore:null};
 globalThis.__sessionFixture=fixture;
 const originalFetch=globalThis.fetch,originalDocument=globalThis.document;
 globalThis.document={baseURI:'https://example.test/HCUjusik/'};
 globalThis.fetch=async()=>({ok:true,json:async()=>({projectId:'demo-session'})});
 try{
  const result=await build({entryPoints:['client/auth.js'],bundle:true,write:false,format:'esm',plugins:[{
   name:'auth-session-fixture',setup(b){
    b.onResolve({filter:/^(firebase\/|\.\/data\.js)/},a=>({path:a.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='firebase/auth'?`
     const f=globalThis.__sessionFixture;
     export const browserSessionPersistence={type:'SESSION'};
     export function getAuth(){f.currentUser=null;return {app:{},get currentUser(){return f.currentUser},authStateReady:()=>new Promise(resolve=>{f.restore=()=>{f.currentUser=f.saved;resolve()}})}}
     export async function setPersistence(auth,p){if(p.type!=='SESSION')throw Error('Wrong persistence')}
     export async function signInWithEmailAndPassword(){f.currentUser=f.saved={uid:'synthetic-student',getIdToken:async()=>'fixture-token'}}
     export async function signOut(){f.currentUser=f.saved=null}
     export const createUserWithEmailAndPassword=signInWithEmailAndPassword;
     export async function sendEmailVerification(){} export async function reload(){}
    `:a.path==='firebase/app'?'export const initializeApp=config=>config;':a.path==='firebase/firestore'?'export const getFirestore=()=>({});':'export const createClientApi=({getUser})=>async()=>getUser();'}));
   }
  }]});
  const source=Buffer.from(result.outputFiles[0].contents).toString('base64');
  let serial=0;
  async function page(){return import(`data:text/javascript;base64,${source}#${serial++}`)}
  async function restore(){for(let i=0;i<20&&!fixture.restore;i++)await new Promise(r=>setTimeout(r,0));assert.ok(fixture.restore);const finish=fixture.restore;fixture.restore=null;finish()}
  let auth=await page(),pending=auth.dataRequest('/api/me');
  await restore();assert.equal(await pending,null);
  await auth.login('fixture@example.test','synthetic');
  auth=await page();let finished=false;
  pending=auth.dataRequest('/api/me').then(user=>{finished=true;return user});
  await new Promise(r=>setTimeout(r,0));assert.equal(finished,false);
  await restore();assert.equal((await pending).uid,'synthetic-student');
  await auth.logout();assert.equal(fixture.saved,null);
  auth=await page();pending=auth.dataRequest('/api/me');await restore();assert.equal(await pending,null);
 }finally{globalThis.fetch=originalFetch;globalThis.document=originalDocument;delete globalThis.__sessionFixture;}
});

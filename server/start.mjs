import {createServer} from 'node:http';
import {initializeApp,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createExchangeStore} from './store.js';
import {createExchangeApi} from './api.js';
const projectId=process.env.FIREBASE_PROJECT_ID,allowedOrigin=process.env.ALLOWED_ORIGIN;
if(!projectId||!allowedOrigin||new URL(allowedOrigin).origin!==allowedOrigin)throw new Error('Set FIREBASE_PROJECT_ID and an exact ALLOWED_ORIGIN.');
// No implicit credential discovery or production emulator override.
if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Production server refuses emulator overrides.');
if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)throw new Error('Configure the service account in hosting secrets; never in frontend or Git.');
let credentials;try{credentials=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw new Error('Invalid service account JSON in hosting secret.');}
if(credentials.project_id!==projectId)throw new Error('Credential project does not match FIREBASE_PROJECT_ID.');
let app;try{app=initializeApp({projectId,credential:cert(credentials)});}catch{throw new Error('Unable to initialize service account credentials.');}
const api=createExchangeApi({store:createExchangeStore(getFirestore(app)),projectId,allowedOrigin});
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>2048){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
  const request=new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await api(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
 }catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"서버 요청을 처리하지 못했습니다."}');}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Exchange server listening'));

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExchangeApi} from '../server/api.js';
import {createExchangeRequest} from '../client/exchange.js';
import {authorize} from '../server/store.js';
const origin='https://seongwankang.github.io';
const request=(path,options={})=>new Request('https://exchange.example'+path,{headers:{origin,authorization:'Bearer valid.token.signature','content-type':'application/json',...options.headers},...options});
test('API verifies token and trusts only verified UID, exact origin and narrow routes',async()=>{
 const calls=[],api=createExchangeApi({projectId:'test-project',allowedOrigin:origin,verify:async(t,p)=>{assert.equal(t,'valid.token.signature');assert.equal(p,'test-project');return {sub:'verified-user'};},store:{read:async(uid,claims,id)=>{calls.push([uid,id]);return {ok:true};},mutate:async()=>({ok:true})}});
 assert.equal((await api(request('/v1/exchange?companyId=test-a'))).status,200);assert.deepEqual(calls,[['verified-user','test-a']]);
 assert.equal((await api(request('/v1/exchange?companyId=../users'))).status,400);
 assert.equal((await api(request('/v1/exchange?companyId=test-a',{headers:{origin:'https://evil.example'}}))).status,403);
 assert.equal((await api(request('/v1/exchange?companyId=test-a',{headers:{origin}}))).status,401);
 assert.equal((await api(request('/v1/orders',{method:'GET'}))).status,405);
 assert.equal((await api(request('/v1/orders',{method:'POST',body:JSON.stringify({uid:'victim'})}))).status,400);
 assert.equal((await api(request('/v1/cancel',{method:'POST',body:JSON.stringify({orderId:'valid-id',uid:'victim'})}))).status,400);
 assert.equal((await api(request('/v1/orders',{method:'POST',body:'{bad'}))).status,400);
 const pre=await api(new Request('https://exchange.example/v1/orders',{method:'OPTIONS',headers:{origin}}));assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),origin);
});
test('auth gating, request limits and secret-free upstream errors',async()=>{
 assert.throws(()=>authorize({active:false,role:'student'},{email:'a@hcu.hs.kr',email_verified:true}));
 assert.throws(()=>authorize({active:true,role:'student'},{email:'a@hcu.hs.kr',email_verified:false}));
 assert.throws(()=>authorize({active:true,role:'student'},{email:'a@evil.example',email_verified:true}));
 assert.doesNotThrow(()=>authorize({active:true,role:'admin'},{email_verified:false}));
 const api=createExchangeApi({projectId:'p',allowedOrigin:origin,verify:async()=>({sub:'u'}),store:{read:async()=>{throw new Error('PRIVATE_KEY SECRET');}}});
 const r=await api(request('/v1/exchange?companyId=test-a'));assert.equal(r.status,503);assert.ok(!(await r.text()).includes('SECRET'));
 for(let i=0;i<39;i++)await api(request('/v1/exchange?companyId=test-a'));
 assert.equal((await api(request('/v1/exchange?companyId=test-a'))).status,429);
});
test('client refuses disconnected/unsafe endpoints and sends token only to configured HTTPS backend',async()=>{
 const token=async()=>'private-token';
 for(const baseUrl of ['', 'http://remote.example','https://user:password@example.com','https://example.com/?key=x'])await assert.rejects(createExchangeRequest({baseUrl,getToken:token})('/api/exchange?companyId=test-a'));
 let seen;const client=createExchangeRequest({baseUrl:'https://exchange.example',getToken:token,fetcher:async(url,options)=>{seen={url:String(url),options};return Response.json({ok:true});}});
 await client('/api/limit-order',{method:'POST',body:'{}'});assert.equal(seen.url,'https://exchange.example/v1/orders');assert.equal(seen.options.headers.authorization,'Bearer private-token');assert.equal(seen.options.credentials,'omit');
 await assert.rejects(client('/api/arbitrary'));
});

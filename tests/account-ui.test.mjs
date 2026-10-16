import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('restored accounts update the account button and management access for every role',async()=>{
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const update=source.slice(source.indexOf('function updateAccountButton()'),source.indexOf('async function refreshSession()'));
 for(const role of ['admin','president','student',null]){
  const button={},management={},state={page:'market',user:role?{displayName:'테스트',role}:null};
  let session;
  const document={querySelector:selector=>selector==='#account-button'?button:management,querySelectorAll:()=>[management]};
  runInNewContext(update+';updateAccountButton();',{state,adminUI:{session:user=>session=user},$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],navigate:()=>{throw Error('Unexpected navigation');}});
  assert.equal(button.textContent,role?'테스트 · 로그아웃':'로그인');
  assert.equal(button.title,role?'로그아웃':'로그인');
  assert.equal(management.hidden,!['admin','president'].includes(role));
  assert.equal(session,state.user);
 }
});

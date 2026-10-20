import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('restored accounts update the account button and management access for every role',async()=>{
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 const update=source.slice(source.indexOf('function updateAccountButton()'),source.indexOf('async function refreshSession()'));
 for(const role of ['admin','president','student',null]){
  const button={},management={},passwordButton={},state={page:'market',user:role?{displayName:'테스트',role}:null};
  let session,calls=0;
  const document={querySelector:selector=>selector==='#account-button'?button:selector==='#password-change'?passwordButton:management,querySelectorAll:()=>[management]};
  runInNewContext(update+';updateAccountButton();updateAccountButton();',{state,passwordUI:{sessionChanged(){}},adminUI:{session:user=>{session=user;calls++;}},$:s=>document.querySelector(s),$$:s=>[...document.querySelectorAll(s)],navigate:()=>{throw Error('Unexpected navigation');}});
  assert.equal(button.textContent,role?'테스트 · 로그아웃':'로그인');
  assert.equal(passwordButton.hidden,!role);
  assert.equal(button.title,role?'로그아웃':'로그인');
  assert.equal(management.hidden,!['admin','president'].includes(role));
  assert.equal(session,state.user);
  assert.equal(calls,1,'unchanged session must not reload the administrator editor');
 }
});

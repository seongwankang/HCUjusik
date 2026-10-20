import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordChanger} from '../client/password.js';
import {setupPasswordChange} from '../public/password-change.js';

test('password changes require current-account reauthentication before update',async()=>{
 const user={email:'test@example.invalid'},calls=[];
 const change=passwordChanger({getUser:()=>user,credential:(email,password)=>({email,password}),
  reauthenticate:async(u,c)=>{assert.equal(u,user);assert.equal(c.email,user.email);calls.push('reauth');},
  update:async(u,p)=>{assert.equal(u,user);assert.equal(p,'new-test-only');calls.push('update');}});
 await change('old-test-only','new-test-only','new-test-only');assert.deepEqual(calls,['reauth','update']);
});
test('bad confirmation, missing login, rejected reauthentication and session switches never update',async()=>{
 for(const mode of ['confirmation','short','same','signed-out','wrong-password','switched']){
  let user=mode==='signed-out'?null:{email:'test@example.invalid'},updates=0;
  const change=passwordChanger({getUser:()=>user,credential:()=>({}),reauthenticate:async()=>{
   if(mode==='wrong-password')throw Object.assign(Error('rejected'),{code:'auth/invalid-credential'});
   if(mode==='switched')user={email:'other@example.invalid'};
  },update:async()=>updates++});
  const next=mode==='short'?'123':mode==='same'?'old-test-only':'new-test-only';
  await assert.rejects(change('old-test-only',next,mode==='confirmation'?'different':next));assert.equal(updates,0,mode);
 }
});
function fixture(changePassword){
 const elements=new Map();const el=s=>{if(!elements.has(s))elements.set(s,{value:'',textContent:'',hidden:false,disabled:false,open:false,handlers:{},addEventListener(e,f){this.handlers[e]=f;},focus(){},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}});return elements.get(s);};
 setupPasswordChange({root:{querySelector:el},getUser:()=>({id:'test'}),changePassword});
 return {el,click:s=>el(s).handlers.click(),submit:()=>el('#password-form').handlers.submit({preventDefault(){}})};
}
test('dialog prevents duplicate submission and cancellation in flight, clears secrets, reports success',async()=>{
 let done,calls=0;const f=fixture(()=>{calls++;return new Promise(r=>done=r);});
 f.click('#password-change');for(const id of ['current','new','confirm'])f.el('#password-'+id).value='test-only-value';
 const pending=f.submit();await f.submit();assert.equal(calls,1);assert.equal(f.el('#password-current').value,'');
 let prevented=false;f.el('#password-dialog').handlers.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 f.click('#password-close');assert.equal(f.el('#password-dialog').open,true);
 done();await pending;assert.match(f.el('#password-message').textContent,/변경되었습니다/);assert.equal(f.el('#password-submit').hidden,true);
 f.click('#password-close');f.click('#password-change');assert.equal(f.el('#password-message').textContent,'');assert.equal(f.el('#password-submit').hidden,false);
});
test('wrong current password produces a useful error and allows retry without retaining inputs',async()=>{
 const f=fixture(async()=>{throw Object.assign(Error('Firebase internal'),{code:'auth/invalid-credential'});});f.click('#password-change');
 f.el('#password-current').value='test-only';await f.submit();assert.match(f.el('#password-message').textContent,/현재 비밀번호/);
 assert.equal(f.el('#password-current').value,'');assert.equal(f.el('#password-submit').disabled,false);assert.equal(f.el('#password-dialog').open,true);
});

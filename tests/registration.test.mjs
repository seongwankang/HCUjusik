import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupRegistration} from '../public/registration.js';

function fixture({status=null,profile=false,meError=null,mailError=false,duplicate=false,afterSignIn=async()=>{}}={}){
 const elements=new Map(),timers=[],calls={mail:0,register:0,login:0,signup:0,logout:0,signedIn:0,refreshErrors:0};
 function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',hidden:false,disabled:false,open:false,handlers:{},addEventListener(e,f){this.handlers[e]=f;},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
 const state={status,profile,meError,mailError,duplicate};
 const flow=setupRegistration({root:{querySelector:el},schedule:fn=>timers.push(fn),
  verificationStatus:async()=>state.status,
  login:async(email)=>{calls.login++;state.status||={email,verified:false,displayName:'기존 학생'};},
  signup:async(email,password,displayName)=>{calls.signup++;if(state.duplicate)throw Object.assign(Error('exists'),{code:'auth/email-already-in-use'});state.status={email,verified:false,displayName};},
  logout:async()=>{calls.logout++;state.status=null;},
  sendVerification:async()=>{calls.mail++;if(state.mailError)throw Error('network');},
  api:async(path,options)=>{
   if(path==='/api/register'){calls.register++;calls.name=JSON.parse(options.body).displayName;state.profile=true;return {ok:true};}
   if(state.meError)throw state.meError;
   if(!state.status?.verified)throw Error('이메일 인증을 완료하세요.');
   if(!state.profile)throw Object.assign(Error('가입 마무리'),{code:'registration-required'});
   return {user:{id:'student',displayName:'학생',role:'student'}};
  },onSignedIn:async()=>{calls.signedIn++;await afterSignIn();},onRefreshError:()=>{calls.refreshErrors++;},
 });
 return {flow,el,state,calls,timers,click:async id=>el(id).handlers.click(),submit:async()=>el('#login-form').handlers.submit({preventDefault(){}})};
}
test('pending signup survives dialog dismissal and page reconstruction without sending repeated mail',async()=>{
 const f=fixture();await f.click('#auth-toggle');f.el('#username').value='STUDENT@hcu.hs.kr';f.el('#password').value='test-only';f.el('#signup-name').value='홍학생';await f.submit();
 assert.equal(f.calls.signup,1);assert.equal(f.calls.mail,1);assert.equal(f.calls.register,0);assert.equal(f.el('#password').value,'');assert.equal(f.el('#username').disabled,true);assert.equal(f.el('#signup-name').disabled,true);
 await f.click('#close-login');await f.flow.open();assert.equal(f.el('#login-dialog').open,true);assert.equal(f.el('#verification-name').value,'홍학생');assert.equal(f.calls.mail,1);
 const reload=fixture({status:f.state.status});await reload.flow.resume();assert.equal(reload.el('#login-dialog').open,true);assert.equal(reload.el('#verification-name').value,'홍학생');assert.equal(reload.calls.mail,0);
});
test('verified pending account completes from restored Auth name, without new signup or empty login dialog',async()=>{
 const f=fixture({status:{email:'student@hcu.hs.kr',verified:true,displayName:'홍학생'}});await f.flow.open();
 assert.equal(f.calls.name,'홍학생');assert.equal(f.calls.register,1);assert.equal(f.calls.signedIn,1);assert.equal(f.el('#login-dialog').open,false);assert.equal(f.el('#verification-name').value,'');
 await f.flow.resume();assert.equal(f.calls.register,1);
});
test('older pending account without a saved name can supply it after verification',async()=>{
 const f=fixture({status:{email:'student@hcu.hs.kr',verified:true,displayName:''}});await f.flow.resume();
 assert.equal(f.calls.register,0);assert.equal(f.el('#login-dialog').open,true);assert.equal(f.el('#verification-resend').hidden,true);
 f.el('#verification-name').value='이학생';await f.click('#verification-check');assert.equal(f.calls.name,'이학생');assert.equal(f.calls.signedIn,1);
});
test('already-created account resumes through login when signup is retried',async()=>{
 const f=fixture({duplicate:true});await f.click('#auth-toggle');f.el('#username').value='student@hcu.hs.kr';f.el('#password').value='test-only';await f.submit();
 assert.equal(f.calls.signup,1);assert.equal(f.calls.login,1);assert.equal(f.calls.logout,0);assert.equal(f.el('#verification-panel').hidden,false);
});
test('failed email delivery preserves created account and offers resend; repeated clicks are throttled',async()=>{
 const f=fixture({mailError:true});await f.click('#auth-toggle');f.el('#username').value='student@hcu.hs.kr';f.el('#signup-name').value='홍학생';await f.submit();
 assert.equal(f.calls.logout,0);assert.ok(f.state.status);assert.match(f.el('#verification-message').textContent,/계정은 생성/);
 f.state.mailError=false;await f.click('#verification-resend');await f.click('#verification-resend');assert.equal(f.calls.mail,2);assert.equal(f.el('#verification-resend').disabled,true);
});
test('network and disabled-profile errors never trigger account registration or automatic logout',async()=>{
 for(const message of ['연결 실패','비활성화된 참가 계정입니다. 관리자에게 문의하세요.']){
  const f=fixture({status:{email:'student@hcu.hs.kr',verified:true,displayName:'학생'},meError:Error(message)});await f.flow.resume();
  assert.equal(f.calls.register,0);assert.equal(f.calls.logout,0);assert.equal(f.el('#verification-message').textContent,message);
 }
});
test('switching accounts clears stale verification state and re-enables credential form',async()=>{
 const f=fixture({status:{email:'student@hcu.hs.kr',verified:false,displayName:'학생'}});await f.flow.resume();await f.click('#verification-change');
 assert.equal(f.state.status,null);assert.equal(f.el('#verification-panel').hidden,true);assert.equal(f.el('#username').disabled,false);assert.equal(f.el('#password').disabled,false);assert.equal(f.el('#verification-name').value,'');
 await f.flow.open();assert.equal(f.el('#verification-panel').hidden,true);
});
test('check works after external email verification and expired sessions return to login',async()=>{
 const f=fixture({status:{email:'student@hcu.hs.kr',verified:false,displayName:'학생'}});await f.flow.resume();await f.click('#verification-check');assert.equal(f.calls.register,0);
 f.state.status.verified=true;await f.click('#verification-check');assert.equal(f.calls.register,1);assert.equal(f.calls.signedIn,1);
 const expired=fixture({status:{email:'student@hcu.hs.kr',verified:false}});await expired.flow.resume();expired.state.status=null;await expired.click('#verification-check');assert.equal(expired.el('#verification-panel').hidden,true);assert.match(expired.el('#login-error').textContent,/ログイン|로그인/);
});


test('verification dialog closes immediately after profile success while dashboard refresh remains pending',async()=>{
 let release;const refresh=new Promise(resolve=>{release=resolve;});
 const f=fixture({status:{email:'student@hcu.hs.kr',verified:false,displayName:'학생'},afterSignIn:()=>refresh});
 await f.flow.resume();assert.equal(f.el('#login-dialog').open,true);f.state.status.verified=true;
 const checking=f.click('#verification-check');
 for(let i=0;i<20&&f.calls.signedIn===0;i++)await Promise.resolve();
 assert.equal(f.calls.signedIn,1);assert.equal(f.el('#login-dialog').open,false);assert.equal(f.el('#verification-panel').hidden,true);
 release();await checking;assert.equal(f.calls.register,1);
});

test('a post-login refresh failure does not reopen verification or register twice',async()=>{
 const f=fixture({status:{email:'student@hcu.hs.kr',verified:true,displayName:'학생'},afterSignIn:async()=>{throw Error('market unavailable');}});
 await f.flow.open();assert.equal(f.el('#login-dialog').open,false);assert.equal(f.el('#verification-panel').hidden,true);assert.equal(f.calls.register,1);assert.equal(f.calls.signedIn,1);assert.equal(f.calls.refreshErrors,1);assert.equal(f.calls.logout,0);
});

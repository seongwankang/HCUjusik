const school=status=>/^[^\s@]+@hcu\.hs\.kr$/i.test(status?.email||'');
export function setupRegistration({root=document,api,login,signup,logout,verificationStatus,sendVerification,onSignedIn,onRefreshError=()=>{},schedule=setTimeout}){
 const $=s=>root.querySelector(s),dialog=$('#login-dialog');
 let signupMode=false,pending=false,busy=false,resendUntil=0;
 function mode(signingUp=false){
  signupMode=signingUp;pending=false;
  $('#verification-panel').hidden=true;
  for(const s of ['#username','#password','label[for="username"]','label[for="password"]','#auth-submit','#auth-toggle'])$(s).hidden=false;
  $('#username').disabled=false;$('#password').disabled=false;
  $('#auth-title').textContent=signingUp?'학생 회원가입':'로그인';
  $('#auth-description').textContent=signingUp?'학교 이메일 인증이 필요합니다.':'이메일과 비밀번호로 로그인하세요.';
  $('#auth-submit').textContent=signingUp?'회원가입':'로그인';
  $('#auth-toggle').textContent=signingUp?'이미 가입했나요? 로그인':'처음 오셨나요? 회원가입';
  $('#signup-name-label').hidden=!signingUp;$('#signup-warning').hidden=!signingUp;
  $('#signup-name').disabled=!signingUp;$('#signup-name').required=signingUp;
  $('#password').minLength=signingUp?6:0;$('#password').autocomplete=signingUp?'new-password':'current-password';
  $('#login-error').textContent='';
 }
 function reset(){mode();$('#password').value='';$('#signup-name').value='';$('#verification-name').value='';$('#verification-address').textContent='';$('#verification-message').textContent='';}
 function show(status,message=''){
  pending=true;$('#verification-panel').hidden=false;
  for(const s of ['#username','#password','label[for="username"]','label[for="password"]','#auth-submit','#auth-toggle','#signup-name-label','#signup-warning'])$(s).hidden=true;
  for(const s of ['#username','#password','#signup-name'])$(s).disabled=true;
  $('#password').value='';$('#auth-title').textContent=status.verified?'가입 마무리':'이메일 인증 이어하기';
  $('#auth-description').textContent='기존 계정의 이메일 인증을 완료하세요.';
  $('#verification-address').textContent=status.email;
  $('#verification-warning').hidden=status.verified;
  if(!$('#verification-name').value.trim())$('#verification-name').value=status.displayName||$('#signup-name').value;
  $('#verification-resend').hidden=status.verified;
  $('#verification-resend').disabled=Date.now()<resendUntil;
  $('#verification-check').textContent=status.verified?'가입 완료하기':'인증 완료 확인';
  $('#verification-message').textContent=message||(status.verified?'이메일 인증이 확인됐습니다. 학생 이름을 확인하고 가입을 완료하세요.':'메일의 인증 링크를 누른 뒤 인증 완료 확인을 눌러 주세요.');
  $('#login-error').textContent='';
 }
 async function complete(status){
  let data;
  try{data=await api('/api/me');}
  catch(error){
   // Never treat disabled accounts or connection failures as a new registration.
   if(error.code!=='registration-required')throw error;
   if(!status?.verified||!school(status))throw error;
   const name=$('#verification-name').value.trim()||status.displayName||$('#signup-name').value.trim();
   if(!name)throw new Error('학생 이름을 입력한 뒤 가입 완료하기를 눌러 주세요.');
   await api('/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({displayName:name})});
   data=await api('/api/me');
  }
  if(!data.user)throw new Error('같은 이메일과 비밀번호로 다시 로그인해 주세요.');
  // Authentication is complete before market/news requests begin.
  reset();dialog.close();
  try{await onSignedIn(data.user);}catch(error){onRefreshError(error);}
 }
 async function resume(){
  const status=await verificationStatus(true);
  if(!school(status))return false;
  try{if(status.verified){await complete(status);return true;}}
  catch(error){show(status,error.message);return true;}
  show(status);return true;
 }
 async function open(){
  if(busy)return;
  try{const restored=await resume();if(restored&&!pending)return;if(!restored)reset();}catch{reset();$('#login-error').textContent='가입 상태를 확인하지 못했습니다. 같은 이메일로 로그인해 다시 시도하세요.';}
  if(!dialog.open)dialog.showModal();
 }
 async function check(){
  if(busy)return;busy=true;$('#verification-check').disabled=true;
  try{
   const status=await verificationStatus(true);
   if(!status){reset();$('#login-error').textContent='로그인이 만료됐습니다. 가입했던 이메일로 다시 로그인해 주세요.';return;}
   if(!status.verified){show(status,'아직 인증되지 않았습니다. 메일의 인증 링크를 눌러 주세요. 스팸메일함도 확인하세요.');return;}
   show(status);$('#verification-message').textContent='이메일 인증이 확인됐습니다. 가입과 로그인을 완료하는 중입니다…';await complete(status);
  }catch(error){$('#verification-message').textContent=error.message;}
  finally{busy=false;$('#verification-check').disabled=false;}
 }
 $('#close-login').addEventListener('click',()=>dialog.close());
 $('#auth-toggle').addEventListener('click',()=>{if(!busy)mode(!signupMode);});
 $('#verification-check').addEventListener('click',check);
 $('#verification-change').addEventListener('click',async()=>{
  if(busy)return;busy=true;
  try{await logout();reset();$('#username').value='';}catch{ $('#verification-message').textContent='계정 전환에 실패했습니다. 잠시 후 다시 시도하세요.';}
  finally{busy=false;}
 });
 $('#verification-resend').addEventListener('click',async()=>{
  if(busy||Date.now()<resendUntil)return;
  $('#verification-resend').disabled=true;resendUntil=Date.now()+60000;
  try{await sendVerification();$('#verification-message').textContent='인증 메일을 보냈습니다. 스팸메일함도 꼭 확인하세요.';}
  catch{$('#verification-message').textContent='메일을 보내지 못했습니다. 메일이 이미 왔는지 확인하거나 잠시 후 재발송하세요. 계정은 유지됩니다.';}
  schedule(()=>{$('#verification-resend').disabled=false;},60000);
 });
 $('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();if(pending){await check();return;}if(busy)return;
  busy=true;$('#auth-submit').disabled=true;$('#login-error').textContent='';
  const email=$('#username').value.trim().toLowerCase(),password=$('#password').value;
  let status;
  try{
   if(signupMode){
    if(!school({email}))throw new Error('학교 이메일(@hcu.hs.kr)로만 가입할 수 있습니다.');
    try{await signup(email,password,$('#signup-name').value.trim());}
    catch(error){if(error.code==='auth/email-already-in-use')await login(email,password);else throw error;}
   }else await login(email,password);
   status=await verificationStatus(true);
   try{await complete(status);}
   catch(error){
    if(!school(status))throw error;
    show(status,status.verified?error.message:'');
    if(signupMode&&!status.verified){
     try{await sendVerification();resendUntil=Date.now()+60000;$('#verification-resend').disabled=true;schedule(()=>{$('#verification-resend').disabled=false;},60000);$('#verification-message').textContent='인증 메일을 보냈습니다. 스팸메일함도 꼭 확인하세요.';}
     catch{$('#verification-message').textContent='계정은 생성됐지만 메일을 보내지 못했습니다. 잠시 후 인증 메일 재발송을 눌러 주세요.';}
    }
   }
  }catch(error){
   // Account creation can succeed even if the following profile/network call fails.
   try{status=await verificationStatus();}catch{}
   if(school(status))show(status,'계정은 유지됩니다. 인증 상태를 확인하거나 잠시 후 다시 시도하세요.');
   else $('#login-error').textContent=error.message?.includes('학교 이메일')?error.message:'이메일·비밀번호를 확인하세요. 이미 가입했다면 처음 가입한 비밀번호로 로그인해 인증을 이어갈 수 있습니다.';
  }finally{busy=false;$('#auth-submit').disabled=false;}
 });
 return {open,resume:async()=>{const restored=await resume();if(restored&&pending&&!dialog.open)dialog.showModal();return restored;},reset};
}

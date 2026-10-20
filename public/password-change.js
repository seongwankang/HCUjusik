export function passwordError(error){
 return ({'auth/invalid-credential':'현재 비밀번호가 올바르지 않습니다.',
  'auth/wrong-password':'현재 비밀번호가 올바르지 않습니다.',
  'auth/weak-password':'새 비밀번호가 너무 약합니다. 더 긴 비밀번호를 사용해 주세요.',
  'auth/password-does-not-meet-requirements':'새 비밀번호가 보안 기준에 맞지 않습니다. 더 강한 비밀번호를 사용해 주세요.',
  'auth/too-many-requests':'시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  'auth/network-request-failed':'연결을 확인한 뒤 다시 시도해 주세요.',
  'auth/requires-recent-login':'다시 로그인한 뒤 비밀번호를 변경해 주세요.',
  'auth/user-disabled':'비활성화된 계정입니다. 관리자에게 문의해 주세요.',
  'auth/user-token-expired':'로그인이 만료되었습니다. 다시 로그인해 주세요.'})[error.code] || (error.code?'변경하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.':error.message);
}

export function setupPasswordChange({changePassword,getUser,root=document}){
 const $=s=>root.querySelector(s),dialog=$('#password-dialog'),form=$('#password-form'),submit=$('#password-submit'),close=$('#password-close'),message=$('#password-message');
 const fields=['#password-current','#password-new','#password-confirm'].map($);
 let busy=false;
 const clear=()=>fields.forEach(input=>input.value='');
 const reset=()=>{clear();message.textContent='';submit.hidden=false;close.textContent='취소';};
 $('#password-change').addEventListener('click',()=>{if(!getUser())return;reset();dialog.showModal();fields[0].focus();});
 close.addEventListener('click',()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 dialog.addEventListener('close',reset);
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  busy=true;submit.disabled=true;submit.textContent='변경 중…';close.disabled=true;message.textContent='';
  const values=fields.map(input=>input.value);clear();fields.forEach(input=>input.disabled=true);
  try{await changePassword(...values);message.textContent='비밀번호가 변경되었습니다.';submit.hidden=true;close.textContent='닫기';}
  catch(error){message.textContent=passwordError(error);}
  finally{values.fill('');busy=false;submit.disabled=false;submit.textContent='비밀번호 변경';close.disabled=false;fields.forEach(input=>input.disabled=false);}
 });
 return {sessionChanged(){if(dialog.open&&!busy)dialog.close();clear();}};
}

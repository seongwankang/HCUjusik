export function validatePasswordChange(current,next,confirmation){
 if(!current)throw new Error('현재 비밀번호를 입력해 주세요.');
 if(next.length<6)throw new Error('새 비밀번호는 6자 이상 입력해 주세요.');
 if(next!==confirmation)throw new Error('새 비밀번호가 서로 일치하지 않습니다.');
 if(next===current)throw new Error('현재 비밀번호와 다른 비밀번호를 입력해 주세요.');
}

export function passwordChanger({getUser,credential,reauthenticate,update}){
 return async(current,next,confirmation)=>{
  validatePasswordChange(current,next,confirmation);
  const user=getUser();
  if(!user?.email)throw new Error('로그인 후 다시 시도해 주세요.');
  await reauthenticate(user,credential(user.email,current));
  if(getUser()!==user)throw new Error('로그인 상태가 변경되었습니다. 다시 시도해 주세요.');
  await update(user,next);
 };
}

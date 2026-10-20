# 본인 비밀번호 변경

로그인 후 상단의 **비밀번호 변경**에서 현재 비밀번호, 새 비밀번호, 새 비밀번호 확인을 입력합니다. Firebase Auth의 현재 사용자에 대해 이메일·현재 비밀번호로 재인증한 후 updatePassword를 호출합니다. 다른 사용자의 UID나 이메일을 입력하는 경로는 없습니다.

비밀번호는 Firestore, 앱 API, 브라우저 저장소, 로그에 기록하지 않습니다. 입력은 제출·닫기·계정 변경 시 비우며 중복 제출을 막습니다. Firebase 프로젝트의 비밀번호 정책도 적용됩니다. Firebase 규칙이나 유료 서비스 설정 변경은 필요하지 않습니다.

검증: pnpm test, pnpm build. 실계정 비밀번호는 자동 테스트에서 변경하지 않습니다.

공식 문서: https://firebase.google.com/docs/auth/web/manage-users#set_a_users_password

# GitHub Pages + Firebase

사이트는 Firebase Web SDK로 Auth/기존 Firestore 조회에 직접 연결합니다. 지정가 주문은 [매칭 서버](limit-exchange.md)에서 처리합니다. Cloudflare 서버가 필요하지 않습니다.
클라이언트 직접 접근은 Firestore Rules, 매칭 서버는 검증된 ID 토큰과 서버 로직으로 권한을 검사합니다. 화면 버튼 숨김으로 권한을 대체하지 않습니다.
공개 firebase.config.json은 Firebase Web 앱 식별 설정입니다. 서비스 계정 키/비밀번호는 넣지 않습니다.

## 배포

1. 저장소는 사용자 승인 후 공개로 전환했고 GitHub Pages를 사용합니다.
   실제 학생 데이터·키·로컬 설정은 저장소나 dist에 포함하지 않습니다.
2. 변경 PR을 반영합니다. Settings → Pages → Source에서 GitHub Actions를 선택합니다.
3. Actions → Deploy GitHub Pages → Run workflow로 실행합니다.
   npm deploy 명령은 업로드하지 않고 산출물만 생성합니다. 로컬 빌드는 pnpm build입니다.
4. 사이트 주소는 https://seongwankang.github.io/HCUjusik/ 입니다.
5. Firebase Authentication → Settings → Authorized domains에 seongwankang.github.io를 추가합니다.
6. 최신 firestore.rules를 게시합니다. 주소 추가/규칙 변경은 프로젝트 관리 권한과 승인이 필요합니다.
7. 학교 이메일 회원가입 → 인증 메일 및 스팸메일함 확인 → 인증 완료 확인 → 초기 자산 조회를 점검합니다.

## 동작

- 기존 조회 `/api/*`는 로컬 JS 요청 이름입니다. `/api/exchange`, `/api/limit-order`, `/api/cancel-order`는 설정된 매칭 서버에 HTTPS 요청합니다.
- Auth config와 JS/CSS는 상대 경로여서 /HCUjusik/ 서브경로에서도 작동합니다.
- 이메일 인증 완료 전 참가 등록 및 데이터 조회는 Rules에서 차단합니다. 기존 활성 admin은 예외입니다.
- 참가자/초기 자산 등록은 트랜잭션이며 규칙에서 한 번만 고정 금액을 생성하도록 제한합니다.
- 관리자도 사용자 토큰으로 쓰며 가격/학생 자산 조작이나 관리자 승격은 금지합니다.
- 이벤트는 게시용이며 주가/현금 효과는 비활성화 상태입니다.
- 지정가 거래는 별도 서버의 `tradingApiUrl` 및 비밀 설정 완료 후 사용할 수 있습니다. 기존 즉시 매매는 종료했습니다.

기존 Worker, D1 코드와 문서는 보존합니다. 현재 정적 사이트는 Worker API를 호출하지 않습니다.
GitHub Actions와 사이트에 로그인 비밀번호, ID 토큰, Firebase Admin 키를 저장하지 않습니다.
Pages가 HTTPS로 배포되어도 실제 메일 수신/관리자 저장은 원격 Firebase 규칙 적용 후 검증해야 합니다.

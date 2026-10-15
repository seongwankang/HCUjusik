# 설치 및 계정 연결 (사용자 실행 단계)

코드와 테스트는 준비되어 있지만 실제 Firebase/Cloudflare 리소스는 아직 연결하지 않았다.
이 문서의 원격 변경 단계는 프로젝트 소유자가 승인한 뒤 직접 실행한다.

## 로컬 코드 검사

Node.js 22 이상과 pnpm 11.25.0을 설치한다. corepack이 있는 환경에서는:

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm test
pnpm test:legacy
pnpm build
pnpm exec wrangler deploy --dry-run
```

dry-run은 업로드하지 않는다. pnpm-workspace.yaml은 esbuild/workerd의 설치 스크립트만
허용하고 Firebase util 및 protobufjs의 불필요한 설치 스크립트는 차단한다.
Auth SDK는 로컬에서 public/auth.bundle.js로 빌드하며 CDN 버전을 런타임에 가져오지 않는다.
생성 bundle은 Git에서 제외한다.

## Firestore Rules 검증

Java 21 이상과 Firebase CLI를 설치한다.
실제 Firebase 로그인 없이 demo 프로젝트의 emulator에서 실행한다:

```sh
pnpm dlx firebase-tools emulators:exec --only firestore --project demo-school-stock "pnpm test:rules"
```

테스트는 FIRESTORE_EMULATOR_HOST가 없으면 즉시 실패한다.
Rules 구문 컴파일, 본인 조회, 다른 학생 조회, 비활성 계정, 무제한 쿼리,
자산 변조, 역할 승격, create/update/delete와 하위 컬렉션 거부를 확인한다.
로컬 Worker의 인증 경로는 unsigned emulator Auth 토큰을 허용하지 않는다.
Worker unit/integration 테스트는 합성 RSA 키와 가짜 Firestore 응답을 사용하며
실제 계정·데이터·네트워크 비용을 발생시키지 않는다.

## Firebase 연결 승인 후

1. Firebase Console에서 새 프로젝트를 **Spark**로 만든다. Cloud Billing을 연결하지 않는다.
   기존 프로젝트라면 Firestore DB 목록/edition/위치를 확인하고 데이터 삭제 없이 사용할지 결정한다.
   무료 대상은 **Standard의 (default)** DB다. Enterprise나 추가 DB를 만들지 않는다.
2. Firestore를 production mode로 만들고 적절한 지역을 선택한다.
   지역 변경을 위한 삭제/재생성은 이 절차에 포함하지 않는다.
3. Authentication의 Email/Password를 활성화한다. SMS/이메일 링크는 사용하지 않는다.
   Firebase Console의 사용자 추가로 행사 계정을 만든다.
   공개 회원가입 화면은 제공하지 않는다. Auth API에 직접 가입한 사용자라도
   운영자가 active profile을 만들지 않으면 행사 데이터는 접근할 수 없다.
4. Web 앱 등록에서 공개 projectId/apiKey/authDomain을 확인한다.
   Auth Authorized domains에 localhost와 실제 workers.dev 호스트를 추가한다.
   스킴이나 포트를 넣지 않는다. Google Analytics는 이 앱에 필요하지 않다.
5. 실제 권한을 바꾸기 전에 Rules를 검토하고 위 emulator 테스트를 실행한다.
   운영자 계정으로 승인된 프로젝트에만 다음을 실행한다:

```sh
pnpm dlx firebase-tools login
pnpm dlx firebase-tools firestore:databases:list --project YOUR_PROJECT_ID
pnpm dlx firebase-tools firestore:databases:get "(default)" --project YOUR_PROJECT_ID
pnpm dlx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

명령은 Cloud Functions, DB 삭제, 데이터 seed를 실행하지 않는다.
기존 규칙을 대체하는 작업이므로 기존 앱의 접근 요구를 확인하고 승인해야 한다.

6. 운영자가 Console에서 아래 문서를 생성한다. Auth UID와 문서 ID가 정확히 같아야 한다.
   실제 이름·이메일·UID를 저장소에 쓰지 않는다. 테스트용 별칭을 우선 사용한다.

| 문서 | 초기 필드 예시 |
| --- | --- |
| users/{UID} | displayName: 학생 별칭 (string), role: student (string), active: true (boolean) |
| portfolios/{UID} | cash: 확정된 초기 가상 금액 (integer), holdings: [] (array), version: 0 (integer) |
| assignments/{UID} | companyIds: [] (array), 동아리장만 담당 기업 ID 최대 5개 |
| companies/club01 | ticker: CLUB01, name: 동아리 01, referencePrice: 10000, issuedShares: 1000, companyCash: 0, dailyRevenue: 0, status: draft |
| news/{ID} | title, content (string), publishedAt (timestamp), companyId/companyName (선택 string) |

포트폴리오가 없으면 API는 404로 초기화 필요를 알린다. 임의의 자동 지급은 없다.
원하는 경우 node scripts/demo-data.mjs로 가상 기업 21개의 JSON을 확인한다.
이 도구는 stdout 출력만 하며 DB에 연결하지 않는다. news의 timestamp를 문자열로 입력하지 않는다.
입력 전 모델과 숫자/길이 제약을 docs/architecture.md에서 확인한다.

## 로컬 앱 확인

.dev.vars.example을 .dev.vars로 복사하고 공개 Web 설정만 채운다.
Firebase가 아직 연결되지 않아도 /api/health와 정적 화면을 확인할 수 있다.
실제 로그인/읽기 검증은 연결 승인 후 작은 무료 테스트 DB를 이용한다.

```sh
pnpm dev
```

브라우저에서 로그인 → 시장/뉴스 → 내 자산 → 담당 기업 → 로그아웃을 확인한다.
로그인은 Firebase browserSessionPersistence로 같은 탭의 새로고침 후에도 유지된다. 초기 자산 조회는 authStateReady()로 로그인 복원이 끝난 뒤 실행한다. 로그아웃하면 저장된 세션도 제거된다. 탭을 닫으면 세션은 종료되며, 공용 컴퓨터에서는 명시적으로 로그아웃한다.
개발 서버도 실제 Firebase 설정을 입력하면 실제 quota를 소비한다.
연결되지 않았을 때는 API가 503을 반환한다.

## Cloudflare 연결·배포 승인 후

1. Cloudflare 계정의 Workers **Free** 플랜을 확인한다.
2. wrangler.jsonc의 vars에 공개 Web 설정을 채운다.
   실제 설정을 PR에 커밋할 필요는 없다. .dev.vars는 배포에 자동 적용되지 않는다.
3. 다음 명령으로 로그인과 배포를 실행한다. 커스텀 도메인은 필수가 아니다.

```sh
pnpm exec wrangler login
pnpm deploy
```

이번 버전에는 wrangler secret put이나 서비스 계정 키 업로드가 필요 없다.
향후 거래용 비밀키 절차는 architecture.md에만 설계되어 있다.
ASSETS가 /api/* 요청을 Worker로 전달하고 나머지 파일은 정적으로 제공한다.
배포 후 /api/health configured=true / tradingEnabled=false를 확인한다.
Firestore usage와 Workers 요청 수를 모니터링하고 CPU 10 ms 실제 환경 성능을 측정한다.
무료 CPU 한도를 넘으면 유료 전환부터 하지 말고 요청/응답과 처리량을 줄여 검증한다.

## 기존 D1 보존과 이전

SQL migrations와 scripts/create-user.mjs는 기존 이력으로 보존한다.
legacy/d1에는 이전 Worker/설정/README/테스트를 저장했다.
기본 package scripts에는 원격 D1 migration이 없다.
새 Worker는 DB binding이나 D1 사용자 쿠키를 사용하지 않는다.
기존 배포를 바꾸기 전 이전 버전과 D1을 유지하여 되돌릴 수 있어야 한다.

현재 데이터를 자동 이전하거나 삭제하지 않는다.
실제 데이터가 있다면 별도 승인 후 D1 백업 → Auth UID 매핑 → 새 DB에
create-only import → 학생별 cash/holdings 합계 비교 → 제한된 테스트 → 전환 순서로 진행한다.
기존 PBKDF2 비밀번호를 임의로 Firebase Auth에 복사하지 않는다.
관리자 계정 생성/재설정 또는 Firebase가 지원하는 검토된 hash import를 별도로 결정한다.
학생 수·잔고·기업 수·권한을 검증하기 전 기존 DB를 지우지 않는다.

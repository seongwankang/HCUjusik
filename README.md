# 청운증권HTS — 현재 실행 방식

현재 지정가 테스트는 [GitHub Pages + Firestore Spark](docs/spark-limit-exchange.md)만 사용합니다. 별도 서버/Render/서비스 계정 키가 필요하지 않습니다. 가격/수량 주문, 초기 발행 선착순, 가격·시간 우선, 부분 체결·예약·취소를 지원하며 **종목당 미체결 4건**으로 제한합니다. 최신 Firestore 규칙 게시 후 사용할 수 있습니다.

GitHub Pages + Firebase Auth/Firestore Spark로 전환했습니다. Cloudflare 계정은 필요하지 않습니다.

- 배포: [GitHub Pages 안내](docs/github-pages.md)
- 회사별 거래 화면·구버전 갱신: [안내](docs/company-pages.md)
- 관리자·학교 이메일 인증: [설정 안내](docs/admin-setup.md)
- 로컬: `pnpm install --frozen-lockfile`, `pnpm dev` (8789/HCUjusik/)
- 빌드: `pnpm build` → `dist/`
- 검증: `pnpm test`, Firestore 에뮬레이터 규칙 테스트

Pages에는 비밀키를 넣지 않습니다. 이전 Node 서버와 기준가격 즉시 매매 코드는 참고용으로 보존하며 현재 화면에서 호출하지 않습니다.

---
아래는 기존 Workers 단계의 기록입니다. 현재 배포는 위 Pages 안내를 사용하세요.

# 모의주식 | MOCK MARKET

학교 동아리 기반 교육용 모의주식 초기 프로젝트입니다.
기본 실행 구조를 **Firebase Auth + Firestore Spark + Cloudflare Workers Free**로 전환했습니다.
현재는 행사 참가자 로그인과 기업/뉴스/자산/담당 기업 조회만 제공하며,
거래·배당·경영 쓰기는 비활성화되어 있습니다.

- [무료 구조, 공식 한도, 인증/비밀키와 원자적 거래 설계](docs/architecture.md)
- [설치, 테스트, Firebase 연결과 승인 후 배포 절차](docs/setup.md)
- [기존 D1 버전 문서](legacy/d1/README.md)

Node.js 22 이상과 pnpm 11.25.0:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run
```

실제 계정 연결·배포 없이 unit/API 테스트와 빌드를 실행할 수 있습니다.
Firestore 규칙 검증에는 Java 21과 emulator가 필요합니다:

```sh
pnpm dlx firebase-tools emulators:exec --only firestore --project demo-school-stock "pnpm test:rules"
```

현재 서버는 사용자 ID token을 검증하고 그대로 Firestore REST에 전달합니다.
서버 비밀키 없이 Firestore Rules가 소유자/활성 참가자 읽기를 검사합니다.
클라이언트의 모든 쓰기는 막혀 있으며 주문은 인증 후 항상 501을 반환합니다.
미연결 상태에서는 /api/health가 configured=false를 반환하고 읽기 API는 503입니다.

공용 컴퓨터에서 token을 지속 저장하지 않으므로 새로고침 후 재로그인이 필요합니다.
기업/뉴스도 로그인한 활성 행사 참가자만 조회합니다.
운영자는 Auth 계정과 users/{UID}, portfolios/{UID} 문서를 별도로 준비합니다.
현재 UI 가격은 참고값이며 실제 체결·공식 순위 계산이 아닙니다.

기존 SQL migrations와 사용자 생성 스크립트는 그대로 보존했습니다.
이전 Worker/설정/테스트는 legacy/d1에 보존했으며 pnpm test:legacy로 검증할 수 있습니다.
실제 학생 데이터, 기존 D1 데이터, Firebase 계정, 비밀키는 이전하거나 삭제하지 않습니다.
기본 실행에 D1, Cloud Functions, Cloud Billing 연결은 필요 없습니다.

프로토타입 Firestore Security Rules는 본인 데이터 읽기, 활성 참가자 확인 및
모든 클라이언트 쓰기 차단을 목표로 합니다. 대규모 공개 전 운영 환경에서 검토·검증하세요.

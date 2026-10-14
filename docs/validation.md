# 검증 기록

2026-10-09, Node.js 24.19.0 / pnpm 11.25.0 / Wrangler 4.148.0.

| 검사 | 결과 |
| --- | --- |
| node --test tests/*.test.mjs | 29/29 통과 |
| node --test legacy/d1/tests/*.test.mjs | 8/8 통과 |
| node --test tests/rules/*.test.mjs | Firestore Standard emulator 1.22.0, Java 21, 7/7 통과 |
| node scripts/build.mjs | Firebase Auth ESM bundle 생성 성공 |
| wrangler deploy --dry-run | Worker 약 45.5 KiB, gzip 약 12.6 KiB, 정적 파일 4개 검증 성공 |

Rules는 실제 emulator에서 컴파일되었다. REST get/list 구현을 테스트했고,
회사/뉴스 목록 요청의 pageSize와 Rules limit이 맞는지 emulator로 확인했다.
뉴스 정렬의 공백을 '+' 대신 '%20'으로 인코딩하도록 수정했다.
권한 실패 테스트의 PERMISSION_DENIED 로그는 예상된 결과다.
역할 주장만으로 쓰기 권한을 얻지 못하며 주문 요청은 자산 쓰기를 수행하지 않는다.

실제 Firebase 계정/DB 또는 Cloudflare 배포를 실행한 결과는 아니다.
실제 10 ms CPU 한도, Google JWKS cold fetch/rotation, Firebase 공급자 설정,
free quota 도달 시 운영 동작은 승인 후 작은 테스트 환경에서 확인해야 한다.
향후 원자적 거래는 문서 설계이며 활성화/체결 구현의 테스트 결과가 아니다.
보안 규칙은 프로토타입이며 넓은 공개 전에 운영 접근 요구를 검토한다.

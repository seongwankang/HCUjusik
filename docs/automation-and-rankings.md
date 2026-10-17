# 오전 9시 자동 정산과 순위표

GitHub Pages + Firestore Spark를 유지한다. Cloud Functions, Cloud Scheduler, Render 또는 상시 서버를 추가하지 않는다. 공개 저장소의 표준 GitHub Actions 실행과 기존 Firestore 무료 사용량을 사용하되, Firestore 읽기·쓰기 사용량은 계속 점검한다.

## 실행 시각과 한계

`.github/workflows/daily-economy.yml`은 UTC 15분 간격으로 실행을 예약한다. 한국시간 오전 9시 이전에는 정산하지 않고 현금 순위 갱신 여부만 확인하며, 오전 9시 이후의 첫 실행이 그날 회사 정산을 시작한다. 완료한 날짜는 건너뛰므로 후속 실행은 재지급하지 않는다. 중단된 정산은 영수증을 확인해 이어서 처리한다. 현금 순위는 전체 계좌 조회량을 줄이기 위해 약 1시간 간격 또는 정산·복구 완료 직후에 갱신한다. 일부 회사가 실패해도 나머지를 처리하고 필요한 현금 순위 갱신을 마친 뒤 작업을 실패 상태로 끝내 운영자가 확인할 수 있게 한다.

GitHub 예약 실행은 지연되거나 누락될 수 있으므로 09:00:00 정각 지급을 보장하지 않는다. 공개 저장소는 60일간 활동이 없으면 예약 작업이 비활성화될 수 있다. 이 구조는 **09시 예약 + 후속 실행 재시도**이며, 자동 실행이 없었던 과거 날짜를 당시 보유량인 것처럼 추정해서 소급 지급하지 않는다. 관리자 수동 정산·이어하기는 계속 사용할 수 있다. 오전 9시 이전의 수동 정산도 기존처럼 가능하므로 운영자는 예외 처리에만 사용한다.

투자자 패널의 내일 예상 배당은 한국시간 다음 날 오전 9시에 가동될 설비와 그때 유효한 적용 이벤트로 계산한다. 실제 실행 시점의 보유량·이벤트·배당률을 사용하므로 예상과 실제 지급액은 다를 수 있다.

## 안전한 계정 연결 — 소유자 승인 후에만 실행

새 영구 비밀키나 학생/관리자 비밀번호를 GitHub에 저장하지 않는다. GitHub OIDC와 Google Workload Identity Federation(WIF)으로 단기 인증한다. 연결 전에는 `ECONOMY_AUTOMATION_ENABLED`가 없으므로 작업은 실행되지 않는다.

승인 대상은 다음과 같다.

1. `hcujusik`에 `hcu-economy-job` 전용 서비스 계정을 생성하고 `roles/datastore.user`를 부여한다. 이 역할은 Firestore 데이터 읽기·쓰기를 허용하며 보안 규칙을 우회하는 신뢰된 운영자 권한이다. Firebase Auth 사용자 관리나 IAM 관리 권한은 주지 않는다. Firestore 전체 데이터에 영향을 줄 수 있으므로 저장소 main과 워크플로 변경 권한을 보호해야 한다.
2. `hcu-github/hcu-economy` WIF 연결을 생성한다. 저장소 ID `1411053406`, 소유자 ID `257706646`, `main`, 해당 정산 워크플로 경로가 모두 일치할 때만 서비스 계정을 사용할 수 있게 한다.
3. GitHub 저장소 변수 3개를 등록하고 자동 실행을 켠다. 변수는 공개 식별자와 활성화 플래그이며 비밀키가 아니다.

프로젝트 소유자가 Cloud Shell 또는 인증된 gcloud 환경에서 검토한 `scripts/setup-economy-identity.sh`를 실행한다. 기존 서비스 계정이나 풀이 있으면 스크립트가 중단하며 임의로 덮어쓰지 않는다. 부분 실패 시 만든 리소스와 IAM 정책을 확인한 후 누락 단계만 진행한다.

출력된 값을 저장소 Settings → Secrets and variables → Actions → Variables에 등록한다.

| 이름 | 값 |
|---|---|
| `ECONOMY_WIF_PROVIDER` | 출력된 `projects/프로젝트번호/locations/global/workloadIdentityPools/hcu-github/providers/hcu-economy` |
| `ECONOMY_SERVICE_ACCOUNT` | `hcu-economy-job@hcujusik.iam.gserviceaccount.com` |
| `ECONOMY_AUTOMATION_ENABLED` | `true` |

`Daily settlement and rankings`의 Run workflow를 한 번 실행해 인증과 정산 결과를 확인한다. 이 실행도 실제 09시 기준을 따르며 09시 이후라면 미정산 회사를 정산하므로 테스트 버튼처럼 실행하지 않는다. Actions 로그는 처리 건수만 출력하며 이름·보유 현금·인증 정보를 출력하지 않는다.

중지하려면 활성화 변수를 `false`로 바꾸거나 워크플로를 비활성화한다. 영구 연결 해제는 WIF 제공자를 비활성화하고 전용 서비스 계정의 프로젝트 Datastore 역할과 WIF 사용자 바인딩을 회수한다. 앱 데이터나 정산 기록을 삭제하지 않는다.

## 개인 현금과 주가 순위

개인 현금 순위는 활성 학생·사장의 개인 `sparkAccounts.cash`로 집계한다. 관리자·비활성 회원은 제외한다. 거래 계좌가 아직 없으면 거래 서비스와 같은 시작 현금 100만 원으로 취급한다. 매수 예약금도 보유 현금에 포함하며 주식 평가액은 포함하지 않는다. 동점은 공동 순위(1, 1, 3)이며 상위 100명과 전체 인원·집계 시각을 제공한다.

서버 작업 또는 관리자 `현금 순위 갱신`이 전체 회원·계좌를 100개씩 조회해 `leaderboards/cash`에 투영한다. 이 문서는 이름·현금·순위만 포함하며 이메일·UID·주식 보유량·주문·계좌 참조를 공개하지 않는다. 일반 학생은 자기 계좌와 이 집계 문서만 조회하며 타인 원본 계좌는 계속 차단된다. 집계 사이의 거래·회원 상태 변경은 다음 집계에 반영된다. 관리자 갱신은 자동 연결 전에도 사용할 수 있다.

주가 순위는 상장·중지 기업의 최근 체결가 기준이며 첫 거래 전에는 초기 판매가임을 명시한다. 수익률 순위와 다르다. 화면 새로고침 시 현재 가격을 다시 조회한다. 상위 100개를 표시한다.

## 검증

`pnpm test`, `pnpm build`, `node scripts/build-jobs.mjs`와 루프백 `demo-*` Firestore 테스트를 실행한다. 서버 작업은 동일한 `client/economy.js`와 이벤트 로직을 Node 전용 SDK 어댑터로 재사용한다. 오전 9시 경계·중복 지급·실패 후 재개·실패 회사 격리·원장 비복리·계좌 미초기화 회원·동점·관리자 제외·원본 계좌 접근 차단·순위 쓰기 권한을 검사한다.

참조: [GitHub 예약 실행 제약](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Google GitHub 인증 액션](https://github.com/google-github-actions/auth), [배포 파이프라인의 WIF](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).
